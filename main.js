import { BskyAgent } from 'https://esm.sh/@atproto/api';
import { uploadSoundSkyAudio, fetchSoundSkyRecord } from './soundsky-lexicon.js';
import { loadBanlist, isBannedHandle, sha256Hex, formatRelativeTime, getCurrentPdsUrl } from './utils.js';
import { renderArtistPage as importedRenderArtistPage } from './artist.js';
let renderArtistPage = importedRenderArtistPage;
import { renderPostCard } from './post.js';
import { initWaveSurfer, setupLazyWaveSurfer } from './audioPlayer.js';
import { renderSidebarLikedSongs, fetchAndRenderSidebarLikedSongs } from './sidebar.js';
// [REMOVED: import { renderSinglePostComments, renderThreadedComments } from './comments.js';]
import { fetchNotifications, updateNotificationBell, renderNotificationDropdown, setupNotificationDropdown, markNotificationsSeen, setupNotificationNavRefresh } from './notifications.js';

// Change agent to let, not const
let agent = null;

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const feedContainer = document.getElementById('feed');
const feedLoading = document.getElementById('feed-loading');

const defaultAvatar = '/favicon.ico';

// Immediately hide the upload box if present
const uploadForm = document.getElementById('create-audio-post');
if (uploadForm) uploadForm.style.display = 'none';

// --- Mini Liked Songs Sidebar ---

// --- Helper: Get post param from URL ---
function getPostParamFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('post');
}
function getArtistParamFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('artist');
}
function getSearchParamFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('q') || url.searchParams.get('search');
}
function getLinkParamFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('l') || url.searchParams.get('link');
}

// On page load, try to resume session
window.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('.flex.h-screen.overflow-hidden').style.filter = 'blur(2px)';
    const savedPds = localStorage.getItem('bskyPds') || 'https://bsky.social';
    const pdsInput = document.getElementById('pds-server');
    if (pdsInput) pdsInput.value = savedPds;
    agent = new BskyAgent({ service: savedPds });
    const savedSession = localStorage.getItem('bskySession');
    if (savedSession) {
        try {
            await agent.resumeSession(JSON.parse(savedSession));
            loginForm.style.display = 'none';
            document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
            setCurrentUserAvatar();
            // --- Notification system setup (after agent is ready) ---
            setupNotificationDropdown();
            setupNotificationNavRefresh();
            setTimeout(fetchNotifications, 500);
            const postParam = getPostParamFromUrl();
            const artistParam = getArtistParamFromUrl();
            const searchParam = getSearchParamFromUrl();
            const linkParam = getLinkParamFromUrl();
            if (postParam) {
                renderSinglePostView(postParam);
            } else if (artistParam) {
                renderArtistPage(artistParam);
            } else if (searchParam) {
                fetchSoundskyFeed({ mode: 'search', q: searchParam });
            } else if (linkParam) {
                fetchSoundskyFeed({ mode: 'link', q: linkParam });
            } else {
                setActiveNav('nav-discover');
                fetchSoundskyFeed({ mode: 'discover' });
            }
            // Fetch and render sidebar liked songs after session resume
            setTimeout(fetchAndRenderSidebarLikedSongs, 1200);
        } catch (e) {
            console.error('[SoundSky] Session resume failed:', e, '\nSaved session:', savedSession, '\nAgent:', agent);
            localStorage.removeItem('bskySession');
            window.location.href = '/login';
        }
    } else {
        window.location.href = '/login';
    }
    // Hide the upload box by default on page load
    const uploadForm = document.getElementById('create-audio-post');
    if (uploadForm) uploadForm.style.display = 'none';
});

loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const pdsInput = document.getElementById('pds-server');
    const pds = pdsInput && pdsInput.value.trim() ? pdsInput.value.trim() : 'https://bsky.social';
    loginError.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    try {
        // Save PDS to localStorage
        localStorage.setItem('bskyPds', pds);
        // Create agent with selected PDS
        agent = new BskyAgent({ service: pds });
        await agent.login({ identifier: username, password });
        // Save session to localStorage
        localStorage.setItem('bskySession', JSON.stringify(agent.session));
        loginForm.style.display = 'none';
        document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
        const createPostBox = document.getElementById('create-post-box');
        if (createPostBox) createPostBox.style.display = 'none';
        const mobilePlayer = document.getElementById('mobile-player');
        if (mobilePlayer) mobilePlayer.style.display = 'none';
        // Fetch and set current user avatar
        setCurrentUserAvatar();
        fetchSoundskyFeed();
        // Fetch and render sidebar liked songs after login
        setTimeout(fetchAndRenderSidebarLikedSongs, 1200);
    } catch (e) {
        loginError.textContent = 'Login failed: ' + (e.message || e);
        loginError.classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        loginForm.style.display = 'flex';
    }
});

async function setCurrentUserAvatar() {
    try {
        const profile = await agent.getProfile({ actor: agent.session.did });
        let avatarUrl = profile.data.avatar;
        if (!avatarUrl) {
            avatarUrl = `https://cdn.bsky.app/img/avatar_thumbnail/plain/${agent.session.did}/@jpeg`;
        }
        const avatarImg = document.getElementById('current-user-avatar');
        if (avatarImg) {
            avatarImg.src = avatarUrl;
            avatarImg.onerror = () => { avatarImg.src = defaultAvatar; };
        }
    } catch (e) {
        const avatarImg = document.getElementById('current-user-avatar');
        if (avatarImg) avatarImg.src = defaultAvatar;
    }
}

let loadedAudioPosts = [];
let nextCursor = null;

// Sidebar navigation logic
function setActiveNav(id) {
    document.querySelectorAll('#nav-feed, #nav-discover, #nav-likes').forEach(el => {
        el.classList.remove('bg-blue-500', 'text-white');
        el.classList.add('text-gray-700');
    });
    const active = document.getElementById(id);
    if (active) {
        active.classList.add('bg-blue-500', 'text-white');
        active.classList.remove('text-gray-700');
    }
}

// Add event listeners for nav
const navFeed = document.getElementById('nav-feed');
const navDiscover = document.getElementById('nav-discover');
const navLikes = document.getElementById('nav-likes');
if (navFeed) navFeed.onclick = (e) => { e.preventDefault(); clearAllParamsInUrl(); setActiveNav('nav-feed'); fetchSoundskyFeed({ mode: 'home' }); };
if (navDiscover) navDiscover.onclick = (e) => { e.preventDefault(); clearAllParamsInUrl(); setActiveNav('nav-discover'); fetchSoundskyFeed({ mode: 'discover' }); };
if (navLikes) navLikes.onclick = (e) => {
    e.preventDefault();
    clearAllParamsInUrl();
    setActiveNav('nav-likes');
    renderLikedPostsAlbumView();
};

// --- Utility: Clear all SoundSky params from the URL (without reload) ---
function clearAllParamsInUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    url.searchParams.delete('artist');
    url.searchParams.delete('q');
    url.searchParams.delete('search');
    url.searchParams.delete('l');
    url.searchParams.delete('link');
    window.history.replaceState({}, document.title, url.pathname + url.search);
}

// --- Utility: Fetch audio blob URL with CORS fallback ---
async function fetchAudioBlobUrl(userDid, blobRef) {
    // Look up the user's PDS/serviceEndpoint using getProfile
    let baseUrl = 'https://bsky.social';
    try {
          const plcResponse = await fetch(`https://plc.directory/${userDid}`);
          if (!plcResponse.ok) throw new Error(`Failed to resolve DID: ${plcResponse.status}`);
          const plcData = await plcResponse.json();
          // The PDS URL is in the 'service' field of the DID document
          const pdsEndpoint = plcData.service.find(s => s.id === '#atproto_pds')?.serviceEndpoint;
          if (!pdsEndpoint) throw new Error("Could not find PDS endpoint in DID document");
          console.log(`PDS: ${pdsEndpoint}`);
          baseUrl = pdsEndpoint;
    } catch (e) {
        // fallback to default
    }
    const blobUrl = `${baseUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
    let resp;
    try {
        resp = await fetch(blobUrl);
    } catch (e) {
        resp = { ok: false };
    }
    if (!resp.ok) {
        // fallback to CORS proxy
        const corsProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(blobUrl);
        try {
        resp = await fetch(corsProxyUrl);
        } catch (e) {
            resp = { ok: false };
        }
    }
    if (!resp.ok) throw new Error('Blob fetch failed');
    const audioBlob = await resp.blob();
    return URL.createObjectURL(audioBlob);
}

// Global flag to cancel feed loading
let _soundskyFeedCancelled = false;
// Global feed generation token for robust cancellation
let _soundskyFeedGeneration = 0;

// --- Banlist support for post filtering ---
let _soundskyBanlistSet = null;

// Helper: attach click handler to .post-title-link buttons
function attachPostTitleLinkHandlers() {
    document.querySelectorAll('.post-title-link').forEach(title => {
        if (!title._soundskyHandlerAttached) {
            title.addEventListener('click', function(e) {
                e.preventDefault();
                // Cancel feed loading/appending
                _soundskyFeedCancelled = true;
                // Robust: increment feed generation to cancel async appends
                _soundskyFeedGeneration++;
                // Hide feed immediately
                feedContainer.style.display = 'none';
                const postUri = title.getAttribute('data-post-uri');
                if (postUri) {
                    setPostParamInUrl(postUri);
                    renderSinglePostView(postUri);
                }
            });
            title._soundskyHandlerAttached = true;
        }
    });
    // --- NEW: Attach click handler to .comment-post-btn to open single-post view ---
    document.querySelectorAll('.comment-post-btn').forEach(btn => {
        if (!btn._soundskyHandlerAttached) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                const postCard = btn.closest('.post-card');
                const postUri = postCard?.getAttribute('data-post-uri');
                if (postUri) {
                    setPostParamInUrl(postUri);
                    renderSinglePostView(postUri);
                }
            });
            btn._soundskyHandlerAttached = true;
        }
    });
}

// In artist link navigation, also increment _soundskyFeedGeneration (if you have a similar handler, do the same)
// If you have a function for artist links, add: _soundskyFeedGeneration++;

// Helper: progressively append a single audio post card
let _soundskyFirstCardAppended = false;
// --- Patch appendAudioPostCard to enforce strict lazy loading ---
async function appendAudioPostCard(item, feedGen) {
    // UFOs-API: item is the wrapper, item.record is the actual SoundSky record
    const record = item.record;
    const did = item.did;
    if (!record || !did) {
        console.warn('[appendAudioPostCard] Skipping item with missing record or did', item);
            return;
        }
    // Build user object
    const user = {
        did,
        handle: '', // UFOs-API does not provide handle
        displayName: record.metadata?.artist || '',
        avatar: '/favicon.ico',
    };
    // Banlist check: skip if artist is banned
    const handle = user.displayName.toLowerCase();
    const hash = await sha256Hex(handle);
    const banlist = await loadBanlist();
    if (banlist.has(hash)) return;
    let audioHtml = '';
    let audioWaveformId = `waveform-${item.rkey}`;
    let playCount = record.stats?.plays || 0;
    // Ensure record has audio
    if (!record.audio || !record.audio.ref || !record.audio.ref.$link) {
        console.warn('[appendAudioPostCard] Skipping record: missing audio blob', { record, item });
        return;
    }
    // Debug: Log the raw objects and extracted fields
    const debugTitle = record.metadata?.title || record.text || '';
    const debugArtist = record.metadata?.artist || '';
    const audioCid = record.audio.ref.$link;
    const artworkCid = record.artwork?.ref?.$link;
    // --- Cover fallback logic ---
    let coverUrl = '';
    if (artworkCid) {
        coverUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(artworkCid)}`;
            } else {
        coverUrl = '/favicon.ico';
    }
    console.debug('[appendAudioPostCard] UFOs-API mapping:', {
        item,
        record,
        did,
        debugTitle,
        debugArtist,
        audioCid,
        artworkCid,
        metadata: record.metadata
    });
    let cardHtml;
    try {
        cardHtml = await renderPostCard({
            post: { uri: `at://${did}/cloud.soundsky.audio/${item.rkey}`, cid: record.cid || item.rkey, record, author: user },
            user,
            audioHtml,
            options: { lazyWaveformId: audioWaveformId },
            lexiconRecord: record,
            playCount,
            coverUrl // pass to post card for fallback
        });
        } catch (err) {
        console.error('[appendAudioPostCard] Failed to render post card:', err, { record, user });
            return;
        }
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHtml;
    const cardEl = tempDiv.firstElementChild;
    if (!cardEl) {
        console.error('[appendAudioPostCard] cardEl is null after parsing cardHtml', { cardHtml, record, user });
        return;
    }
    feedContainer.appendChild(cardEl);
        const playBtn = cardEl.querySelector('.soundsky-play-btn');
        if (playBtn) {
        playBtn._soundskyPost = record;
        playBtn._soundskyLexiconRecord = record;
        playBtn.setAttribute('data-did', did);
        playBtn.setAttribute('data-blob', audioCid);
        playBtn.setAttribute('data-waveform-id', audioWaveformId);
        }
        const playCountEl = cardEl.querySelector('.soundsky-playcount-row span.ml-1');
        if (playCountEl) {
            playCountEl.textContent = playCount;
    }
    if (!_soundskyFirstCardAppended) {
        feedLoading.classList.add('hidden');
        _soundskyFirstCardAppended = true;
    }
    attachPostTitleLinkHandlers();
    // Setup lazy loader for lexicon audio (no-op, handled by click now)
}

// Update fetchSoundskyFeed to render each card as soon as it's ready
async function fetchSoundskyFeed({ append = false, mode = 'discover', q = false } = {}) {
    console.debug('[fetchSoundskyFeed] called with', { append, mode, q });
    destroyAllWaveSurfers();
    feedLoading.classList.remove('hidden');
    if (!append) {
        feedContainer.innerHTML = '';
        loadedAudioPosts = [];
        nextCursor = null;
    }
    _soundskyFirstCardAppended = false;
    _soundskyFeedCancelled = false;
    _soundskyFeedGeneration++;
    const thisFeedGen = _soundskyFeedGeneration;
    feedContainer.appendChild(feedLoading);
    try {
        let records = [];
        let url = 'https://ufos-api.microcosm.blue/records?collection=cloud.soundsky.audio';
        if (q) url += `&q=${encodeURIComponent(q)}`;
        if (nextCursor) url += `&cursor=${encodeURIComponent(nextCursor)}`;
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('Failed to fetch SoundSky records');
        records = await resp.json();
        if (!Array.isArray(records)) records = [];
        if (records.length > 0) {
            loadedAudioPosts = append ? loadedAudioPosts.concat(records) : records;
            for (const item of records) {
                try {
                    await appendAudioPostCard(item, thisFeedGen);
                } catch (err) {
                    console.error('[fetchSoundskyFeed] Failed to append audio post card:', err, { item });
                }
                }
            } else {
            feedContainer.innerHTML = `<div class="text-center text-gray-500 py-8">No music found.</div>`;
        }
        // TODO: Handle pagination if the API supports it
    } catch (err) {
        console.error('[fetchSoundskyFeed] Error loading feed:', err);
        feedContainer.innerHTML = `<div class='text-red-500 py-8'>Failed to load SoundSky feed: ${err.message || err}</div>`;
    } finally {
        feedLoading.classList.add('hidden');
    }
}

// Global object to store WaveSurfer instances
window.soundskyWavesurfers = window.soundskyWavesurfers || {};

async function renderFeed(posts, { showLoadMore = false } = {}) {
    // DEBUG: Print all posts being processed
    console.debug('[renderFeed] raw posts:', posts);
    if (!Array.isArray(posts) || posts.length === 0) {
        feedContainer.innerHTML = `<div class="text-center text-gray-500 py-8">
            It's quiet in here - let's post some music!
        </div>`;
        return;
    }
    // Only process lexicon records
    const wavesurferInitQueue = [];
    let html = '';
    const postCards = await Promise.all(posts.map(async item => {
        const record = item.record;
        const did = item.did;
        const user = {
            did,
            handle: '',
            displayName: record.metadata?.artist || '',
            avatar: '/favicon.ico',
        };
        let audioHtml = '';
        let audioWaveformId = `waveform-${item.rkey}`;
        let playCount = record.stats?.plays || 0;
        return renderPostCard({
            post: { uri: `at://${did}/cloud.soundsky.audio/${item.rkey}`, cid: item.rkey, record, author: user },
            user,
            audioHtml,
            options: { lazyWaveformId: audioWaveformId },
            lexiconRecord: record,
            playCount
        });
    }));
    html = postCards.join('');
    // At the end, add Load More button if needed
    if (showLoadMore) {
        html += `<div class="flex justify-center py-4"><button id="load-more-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Load More</button></div>`;
    }
    feedContainer.innerHTML = html;
    // After rendering all posts, initialize all WaveSurfer instances
    for (const { audioWaveformId, audioBlobUrl } of wavesurferInitQueue) {
        setTimeout(() => initWaveSurfer(audioWaveformId, audioBlobUrl), 0);
    }
    // Load More button event
    if (showLoadMore) {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.onclick = () => fetchSoundskyFeed({ append: true });
        }
    }
}

// --- 3. Add renderArtistPage(did) ---
// [REMOVED: local async function renderArtistPage(did) - now imported from artist.js]

// --- 4. Add event delegation for username clicks ---
function addArtistLinkHandlers() {
    // Delegated event handler for .artist-link
    feedContainer.addEventListener('click', function(e) {
        const target = e.target.closest('.artist-link');
        if (target && target.dataset.did) {
            // Save last view for back button
            if (document.getElementById('single-post-content')) {
                window._soundskyLastView = { type: 'single', postUri: getPostParamFromUrl() };
            } else {
                window._soundskyLastView = { type: 'feed' };
            }
            renderArtistPage(target.dataset.did);
        }
    });
}
// Call this after rendering feed and single post
addArtistLinkHandlers();
// Also call after rendering single post (wrap origRenderFeed and renderSinglePostView)
const origRenderFeed = renderFeed;
renderFeed = async function(...args) {
    await origRenderFeed.apply(this, args);
    addSinglePostClickHandlers();
    addArtistLinkHandlers();
};
const origRenderSinglePostView = renderSinglePostView;
renderSinglePostView = async function(...args) {
    await origRenderSinglePostView.apply(this, args);
    addArtistLinkHandlers();
};

// --- New: Increment play count for custom lexicon posts ---
async function incrementLexiconPlayCount({ did, rkey }) {
    if (!did || !rkey) return;
    try {
        // Fetch the latest record
        const res = await agent.api.com.atproto.repo.getRecord({ repo: did, collection: 'cloud.soundsky.audio', rkey });
        const record = res.data.value;
        // Ensure stats exists and increment
        if (!record.stats) record.stats = {};
        if (typeof record.stats.plays !== 'number') record.stats.plays = 0;
        record.stats.plays++;
        // Write back the updated record
        await agent.api.com.atproto.repo.putRecord({
            repo: did,
            collection: 'cloud.soundsky.audio',
            rkey,
            record
        });
        // Update the UI immediately
        const postUri = `at://${did}/cloud.soundsky.audio/${rkey}`;
        const playCountEls = document.querySelectorAll(`[data-post-uri="${postUri}"] .soundsky-playcount-row span.ml-1`);
        playCountEls.forEach(el => {
            el.textContent = record.stats.plays;
        });
    } catch (err) {
        console.error('Failed to increment play count:', err);
    }
}

async function getLexiconPlayCount({ post, lexiconRecord, soundskyRkey }) {
    if (!post || !post.uri) return;
    try {
        const uriParts = String(post.uri).replace('at://', '').split('/');
        if (uriParts.length !== 3) return;
        const did = uriParts[0];
        const collection = uriParts[1];
        const rkey = uriParts[2];
        // Fetch the latest record
        const res = await agent.api.com.atproto.repo.getRecord({ repo: did, collection, rkey });
        const record = res.data.value;

        if (typeof record.stats.plays !== 'number') return 0;
        else return record.stats.plays;
    } catch (err) {
        console.error('Failed to get play count:', err);
        return 0;
    }
}

// --- Utility: Initialize WaveSurfer instance for a given waveform ID and blob URL ---
// [REMOVED: local function initWaveSurfer - now imported from audioPlayer.js]




// --- Add event delegation for delete button (fixes icon click issues) ---
feedContainer.addEventListener('click', async function(e) {
    // Delete button
    const btn = e.target.closest('.delete-post-btn');
    if (btn && btn.getAttribute('data-uri')) {
        let uri = btn.getAttribute('data-uri');
        if (typeof uri !== 'string') uri = String(uri);
        if (window.confirm('Are you sure you want to delete this post?')) {
            try {
                const uriParts = uri.replace('at://', '').split('/');
                const did = uriParts[0];
                const collection = uriParts[1];
                const rkey = uriParts[2];
                // Fetch the post to get tags (and soundskyid)
                let postRecord;
                try {
                    const res = await agent.api.app.bsky.feed.getPostThread({ uri });
                    postRecord = res.data?.thread?.post?.record || res.data?.thread?.record;
                } catch (err) {
                    // fallback: try to delete anyway
                }
                let soundskyRkey = null;
                if (postRecord && postRecord.tags && Array.isArray(postRecord.tags)) {
                    for (const tag of postRecord.tags) {
                        if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                            soundskyRkey = tag.split('=')[1];
                            break;
                        }
                    }
                }
                // Delete the Bluesky post
                await agent.api.com.atproto.repo.deleteRecord({
                    repo: did,
                    collection,
                    rkey,
                });
                // If soundskyid found, delete the lexicon record as well
                if (soundskyRkey) {
                    try {
                        await agent.api.com.atproto.repo.deleteRecord({
                            repo: did,
                            collection: 'cloud.soundsky.audio',
                            rkey: soundskyRkey,
                        });
                    } catch (lexErr) {
                        alert('Bluesky post deleted, but failed to delete linked SoundSky record: ' + (lexErr.message || lexErr));
                    }
                }
                clearAllParamsInUrl();
                fetchSoundskyFeed();
            } catch (err) {
                alert('Failed to delete post: ' + (err.message || err));
            }
        }
        return;
    }
    // Like button
    const likeBtn = e.target.closest('.like-post-btn');
    if (likeBtn && likeBtn.getAttribute('data-uri')) {
        const uri = likeBtn.getAttribute('data-uri');
        const cid = likeBtn.getAttribute('data-cid');
        const liked = likeBtn.getAttribute('data-liked') === 'true';
        const likeUri = likeBtn.getAttribute('data-likeuri');
        const countSpan = likeBtn.querySelector('span');
        try {
            if (!liked) {
                await agent.like(uri, cid);
                likeBtn.setAttribute('data-liked', 'true');
                likeBtn.classList.remove('text-gray-500', 'hover:text-blue-500');
                likeBtn.classList.add('text-blue-500');
                likeBtn.querySelector('i').classList.remove('far');
                likeBtn.querySelector('i').classList.add('fas');
                countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
            } else {
                if (likeUri) {
                    await agent.deleteLike(likeUri);
                    likeBtn.setAttribute('data-liked', 'false');
                    likeBtn.classList.remove('text-blue-500');
                    likeBtn.classList.add('text-gray-500', 'hover:text-blue-500');
                    likeBtn.querySelector('i').classList.remove('fas');
                    likeBtn.querySelector('i').classList.add('far');
                    countSpan.textContent = (parseInt(countSpan.textContent, 10) - 1).toString();
                } else {
                    alert('Could not find like record URI to unlike.');
                }
            }
        } catch (err) {
            alert('Failed to like/unlike post: ' + (err.message || err));
        }
        return;
    }
    // Repost button
    const repostBtn = e.target.closest('.repost-post-btn');
    if (repostBtn && repostBtn.getAttribute('data-uri')) {
        const uri = repostBtn.getAttribute('data-uri');
        const cid = repostBtn.getAttribute('data-cid');
        const reposted = repostBtn.getAttribute('data-reposted') === 'true';
        const repostUri = repostBtn.getAttribute('data-reposturi');
        const countSpan = repostBtn.querySelector('span');
        try {
            if (!reposted) {
                await agent.repost(uri, cid);
                repostBtn.setAttribute('data-reposted', 'true');
                repostBtn.classList.remove('text-gray-500', 'hover:text-green-500');
                repostBtn.classList.add('text-green-500');
                countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
            } else {
                if (repostUri) {
                    await agent.deleteRepost(repostUri);
                    repostBtn.setAttribute('data-reposted', 'false');
                    repostBtn.classList.remove('text-green-500');
                    repostBtn.classList.add('text-gray-500', 'hover:text-green-500');
                    countSpan.textContent = (parseInt(countSpan.textContent, 10) - 1).toString();
                } else {
                    alert('Could not find repost record URI to unrepost.');
                }
            }
        } catch (err) {
            alert('Failed to repost/unrepost post: ' + (err.message || err));
        }
        return;
    }
    // Share button
    const shareBtn = e.target.closest('.share-post-btn');
    if (shareBtn && shareBtn.getAttribute('data-shareurl')) {
        const url = shareBtn.getAttribute('data-shareurl');
        navigator.clipboard.writeText(window.location.origin + url).then(() => {
            shareBtn.title = 'Link copied!';
            shareBtn.classList.add('text-blue-500');
            setTimeout(() => {
                shareBtn.title = 'Copy embed link';
                shareBtn.classList.remove('text-blue-500');
            }, 1200);
            window.open(window.location.origin + url, '_blank');
        });
    }
    // Like button for comments
    const likeCommentBtn = e.target.closest('.like-comment-btn');
    if (likeCommentBtn && likeCommentBtn.getAttribute('data-uri')) {
        const uri = likeCommentBtn.getAttribute('data-uri');
        const cid = likeCommentBtn.getAttribute('data-cid');
        const liked = likeCommentBtn.getAttribute('data-liked') === 'true';
        const likeUri = likeCommentBtn.getAttribute('data-likeuri');
        const countSpan = likeCommentBtn.querySelector('span');
        try {
            if (!liked) {
                await agent.like(uri, cid);
                likeCommentBtn.setAttribute('data-liked', 'true');
                likeCommentBtn.classList.remove('text-gray-500', 'hover:text-blue-500');
                likeCommentBtn.classList.add('text-blue-500');
                likeCommentBtn.querySelector('i').classList.remove('far');
                likeCommentBtn.querySelector('i').classList.add('fas');
                countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
            } else {
                if (likeUri) {
                    await agent.deleteLike(likeUri);
                    likeCommentBtn.setAttribute('data-liked', 'false');
                    likeCommentBtn.classList.remove('text-blue-500');
                    likeCommentBtn.classList.add('text-gray-500', 'hover:text-blue-500');
                    likeCommentBtn.querySelector('i').classList.remove('fas');
                    likeCommentBtn.querySelector('i').classList.add('far');
                    countSpan.textContent = (parseInt(countSpan.textContent, 10) - 1).toString();
                } else {
                    alert('Could not find like record URI to unlike.');
                }
            }
        } catch (err) {
            alert('Failed to like/unlike comment: ' + (err.message || err));
        }
        return;
    }
    // Delete comment button
    const deleteCommentBtn = e.target.closest('.delete-comment-btn');
    if (deleteCommentBtn && deleteCommentBtn.getAttribute('data-uri')) {
        let uri = deleteCommentBtn.getAttribute('data-uri');
        if (typeof uri !== 'string') uri = String(uri);
        if (window.confirm('Are you sure you want to delete this comment?')) {
            try {
                const uriParts = uri.replace('at://', '').split('/');
                const did = uriParts[0];
                const collection = uriParts[1];
                const rkey = uriParts[2];
                await agent.api.com.atproto.repo.deleteRecord({
                    repo: did,
                    collection,
                    rkey,
                });
                // Reload the comment section for the relevant post
                // Find the root post URI (walk up the DOM to .post-card)
                let postCard = deleteCommentBtn.closest('.post-card');
                let postUri = postCard?.getAttribute('data-post-uri');
                if (!postUri) {
                    // Try to find the closest #single-post-content .post-card
                    postCard = document.querySelector('#single-post-content .post-card');
                    postUri = postCard?.getAttribute('data-post-uri');
                }
                if (postUri && typeof renderSinglePostComments === 'function') {
                    // Fetch the post object for this URI
                    try {
                        const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: postUri });
                        const post = threadRes.data.thread && threadRes.data.thread.post ? threadRes.data.thread.post : threadRes.data.thread;
                        await renderSinglePostComments(post);
                    } catch (err) {
                        // fallback: reload the page or remove the comment from DOM
                        window.location.reload();
                    }
                } else {
                    // fallback: reload the page or remove the comment from DOM
                    window.location.reload();
                }
            } catch (err) {
                alert('Failed to delete comment: ' + (err.message || err));
            }
        }
        return;
    }
});

// Add search bar functionality
const searchInput = document.getElementById('top-search-input');
if (searchInput) {
    searchInput.addEventListener('keydown', async function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (!query) return;
            feedLoading.classList.remove('hidden');
            feedContainer.innerHTML = '';
            try {
                const params = { q: `${query} #soundskyaudio`, limit: 50 };
                const feed = await agent.api.app.bsky.feed.searchPosts(params);
                // Use filterAudioPosts utility
                let audioPosts = [];
                if (feed && feed.data && feed.data.feed) {
                    audioPosts = filterAudioPosts(feed.data.feed);
                } else if (feed && feed.data && feed.data.posts) {
                    audioPosts = filterAudioPosts(feed.data.posts);
                }
                await renderFeed(audioPosts, { showLoadMore: false });
            } finally {
                feedLoading.classList.add('hidden');
            }
        }
    });
}

// Update follow button event delegation for follow/unfollow toggle
feedContainer.addEventListener('click', async function(e) {
    // Follow/unfollow logic
    const followBtn = e.target.closest('.follow-user-btn');
    if (followBtn && followBtn.getAttribute('data-did')) {
        const did = followBtn.getAttribute('data-did');
        const isFollowing = followBtn.getAttribute('data-following') === 'true';
        followBtn.disabled = true;
        let originalText = followBtn.textContent;
        followBtn.textContent = isFollowing ? 'Unfollowing...' : 'Following...';
        try {
            if (!isFollowing) {
                await agent.follow(did);
                followBtn.textContent = 'Following';
                followBtn.setAttribute('data-following', 'true');
                followBtn.classList.remove('text-blue-600', 'border-blue-200', 'hover:bg-blue-50');
                followBtn.classList.add('text-gray-500', 'border-gray-200');
            } else {
                // Unfollow: find the follow record URI if available
                if (agent.unfollow) {
                    await agent.unfollow(did);
                } else if (agent.api && agent.api.app && agent.api.app.bsky && agent.api.app.bsky.graph && agent.api.app.bsky.graph.unfollow) {
                    await agent.api.app.bsky.graph.unfollow({ actor: agent.session.did, subject: did });
                }
                followBtn.textContent = 'Follow';
                followBtn.setAttribute('data-following', 'false');
                followBtn.classList.remove('text-gray-500', 'border-gray-200');
                followBtn.classList.add('text-blue-600', 'border-blue-200', 'hover:bg-blue-50');
            }
        } catch (err) {
            followBtn.textContent = originalText;
            alert('Failed to update follow state: ' + (err.message || err));
        } finally {
            followBtn.disabled = false;
        }
    }
});

// Add event delegation for comment form submission (restores comment functionality)
feedContainer.addEventListener('submit', async function(e) {
    const form = e.target.closest('form[id^="comment-form-"]');
    if (!form) return;
    e.preventDefault();
    const input = form.querySelector('input[type="text"]');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;
    const postCard = form.closest('.post-card');
    const postUri = postCard?.getAttribute('data-post-uri');
    const postCid = postCard?.querySelector('.like-post-btn')?.getAttribute('data-cid');
    if (!postUri || !postCid) return;
    form.querySelector('button[type="submit"]').disabled = true;
    try {
        await agent.post({
            text,
            reply: {
                root: { cid: postCid, uri: postUri },
                parent: { cid: postCid, uri: postUri }
            }
        });
        input.value = '';
        // Optimistically append the new comment under the form
        const commentSection = document.getElementById(`comments-${postCid}`);
        if (commentSection) {
            const currentUser = agent.session && agent.session.did ? {
                avatar: document.getElementById('current-user-avatar')?.src || defaultAvatar,
                displayName: 'Me',
            } : {
                avatar: defaultAvatar,
                displayName: 'Me',
            };
            const commentHtml = `<div class="flex items-start gap-2"><img src="${currentUser.avatar}" class="h-7 w-7 rounded-full" alt="${currentUser.displayName}" onerror="this.onerror=null;this.src='${defaultAvatar}';"><div><span class="font-medium text-xs text-gray-900 dark:text-gray-100">${currentUser.displayName}</span><p class="text-xs text-gray-700 dark:text-gray-200">${text}</p></div></div>`;
            commentSection.innerHTML += commentHtml;
        }
        // Optionally, re-fetch comments for this post
        // (You may want to call a function to update the comment section)
    } catch (err) {
        alert('Failed to post comment: ' + (err.message || err));
    } finally {
        form.querySelector('button[type="submit"]').disabled = false;
    }
});

// Add delegated event handler for .delete-comment-btn
feedContainer.addEventListener('click', async function(e) {
    const btn = e.target.closest('.delete-comment-btn');
    if (btn && btn.getAttribute('data-uri')) {
        let uri = btn.getAttribute('data-uri');
        if (typeof uri !== 'string') uri = String(uri);
        if (window.confirm('Are you sure you want to delete this comment?')) {
            try {
                const uriParts = uri.replace('at://', '').split('/');
                const did = uriParts[0];
                const collection = uriParts[1];
                const rkey = uriParts[2];
                await agent.api.com.atproto.repo.deleteRecord({
                    repo: did,
                    collection,
                    rkey,
                });
                // Remove the comment from the DOM
                const commentDiv = btn.closest('.flex.items-start.gap-2');
                if (commentDiv) commentDiv.remove();
            } catch (err) {
                alert('Failed to delete comment: ' + (err.message || err));
            }
        }
        return;
    }
});

  
/**
 * Increment the counter by 1
 * @param {string} namespace - Your domain or logical grouping
 * @param {string} key - Unique identifier for the counter
 * @returns {Promise<number>} - Resolves to the updated count after increment
 */
async function incrementCount(namespace, key) {
    key = key.replace('waveform-','');
    const url = `https://counterapi.com/api/${namespace}/play/${key}?time=${Date.now()}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to increment count');
    const data = await response.json();
    return data.value;
}

// Add topbar button logic for static HTML buttons
const uploadBtn = document.getElementById('upload-btn');
if (uploadBtn) {
    uploadBtn.onclick = () => {
        const uploadForm = document.getElementById('create-audio-post');
        const postParam = typeof getPostParamFromUrl === 'function' ? getPostParamFromUrl() : null;
        const artistParam = typeof getArtistParamFromUrl === 'function' ? getArtistParamFromUrl() : null;
        let canShow = false;
        if (!postParam) {
            if (!artistParam) {
                canShow = true; // feed/discover
            } else if (agent && agent.session && agent.session.handle && artistParam === agent.session.handle) {
                canShow = true; // own artist page
            }
        }
        if (uploadForm && canShow) {
            if (uploadForm.style.display === 'none' || uploadForm.style.display === '') {
                uploadForm.style.display = 'block';
            } else {
                uploadForm.style.display = 'none';
            }
        }
    };
}
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.onclick = () => {
        localStorage.removeItem('bskySession');
        window.location.href = '/login';
    };
}
const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
if (volumeBtn && volumeSlider) {
    // Set initial volume from localStorage or default
    let globalVolume = 1.0;
    if (localStorage.getItem('soundskyVolume')) {
        globalVolume = parseFloat(localStorage.getItem('soundskyVolume'));
        if (isNaN(globalVolume)) globalVolume = 1.0;
    }
    volumeSlider.value = globalVolume;
    // Show/hide slider on button click
    volumeBtn.onclick = (e) => {
        e.stopPropagation();
        volumeSlider.classList.toggle('hidden');
        if (volumeSlider.style.display === "none") {
            volumeSlider.style.display = "block";
        } else {
            volumeSlider.style.display = "none";
        }
    };
    // Hide slider when clicking outside
    document.addEventListener('click', (e) => {
        const volumeContainer = volumeBtn.parentElement;
        if (volumeContainer && !volumeContainer.contains(e.target)) {
            volumeSlider.classList.add('hidden');
            volumeSlider.style.display = 'none';
        }
    });
    // Update all wavesurfer instances on slider change
    volumeSlider.oninput = () => {
        globalVolume = parseFloat(volumeSlider.value);
        localStorage.setItem('soundskyVolume', globalVolume);
        if (window.soundskyWavesurfers) {
            Object.values(window.soundskyWavesurfers).forEach(ws => {
                if (ws && ws.setVolume) ws.setVolume(globalVolume);
            });
        }
    };
}

// --- Utility: Destroy all WaveSurfer instances and clear global object ---
function destroyAllWaveSurfers() {
    if (window.soundskyWavesurfers) {
        Object.values(window.soundskyWavesurfers).forEach(ws => {
            try { ws.destroy(); } catch {}
        });
        window.soundskyWavesurfers = {};
    }
}

// Add custom CSS for .soundsky-waveform-placeholder if not present
if (!document.getElementById('soundsky-waveform-placeholder-style')) {
    const style = document.createElement('style');
    style.id = 'soundsky-waveform-placeholder-style';
    style.textContent = `
    .soundsky-waveform-placeholder {
      background: #23272f;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 96px;
      color: #b3b3b3;
      position: relative;
    }
    .soundsky-placeholder-content {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.95rem;
      opacity: 0.85;
      pointer-events: none;
      user-select: none;
    }
    `;
    document.head.appendChild(style);
}

// After rendering artist page, add click handlers to post titles to enable single-post navigation
function addArtistPagePostTitleHandlers() {
    setTimeout(() => {
        document.querySelectorAll('#artist-page-content .post-title-link').forEach(title => {
            if (!title._soundskyHandlerAttached) {
                title.addEventListener('click', function(e) {
                    e.preventDefault();
                    const postUri = title.getAttribute('data-post-uri');
                    if (postUri) {
                        setPostParamInUrl(postUri);
                        renderSinglePostView(postUri);
                    }
                });
                title._soundskyHandlerAttached = true;
            }
        });
    }, 0);
}
// After rendering artist page, call the handler
const origRenderArtistPage = renderArtistPage;
renderArtistPage = async function(...args) {
    await origRenderArtistPage.apply(this, args);
    addArtistPagePostTitleHandlers();
};

async function renderLikedPostsAlbumView() {
    destroyAllWaveSurfers();
    feedContainer.innerHTML = '<div class="text-center text-gray-400 py-8"><img src="loading.webp" style="margin:auto;width: 80px;"></div>';
    let likedPosts = [];
    try {
        // Use UFOs-API to fetch all liked posts for the current user
        const did = agent.session?.did;
        if (!did) throw new Error('Not logged in');
        const url = `https://ufos-api.microcosm.blue/records?collection=cloud.soundsky.audio&likedBy=${encodeURIComponent(did)}`;
        const resp = await fetch(url);
        if (resp.ok) {
            likedPosts = await resp.json();
        } else {
            likedPosts = [];
        }
    } catch (e) {
        console.error('[renderLikedPostsAlbumView] Failed to load liked posts:', e);
        feedContainer.innerHTML = '<div class="text-center text-red-400 py-8">Failed to load liked posts.</div>';
        return;
    }
    if (!likedPosts.length) {
        feedContainer.innerHTML = '<div class="text-center text-gray-400 py-8">No liked posts yet.</div>';
        return;
    }
    // Album grid view
    let html = '<div class="album-grid-outer">';
    html += '<div class="text-2xl font-bold mb-4 text-left">Likes</div>';
    html += '<div class="album-grid grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">';
    const postCards = await Promise.all(likedPosts.map(async item => {
        const record = item.record;
        const did = item.did;
        const user = {
            did,
            handle: '',
            displayName: record.metadata?.artist || '',
            avatar: '/favicon.ico',
        };
        let playCount = record.stats?.plays || 0;
        // --- Artwork ---
        let coverUrl = '';
        let artworkCid = record.artwork && record.artwork.ref && record.artwork.ref.$link ? record.artwork.ref.$link : '';
        if (artworkCid) {
            coverUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(artworkCid)}`;
        } else if (record.artwork) {
            console.error('[renderLikedPostsAlbumView] Missing artworkCid (.ref.$link) for record', { record, item });
        }
        // --- Title and Artist ---
        let title = '';
        let artist = '';
        if (record.metadata) {
            title = record.metadata.title || '';
            artist = record.metadata.artist || '';
        } else {
            title = (record.text || '').split('\n')[0].slice(0, 40) || 'Untitled';
            artist = user.displayName || user.handle || '';
        }
        // --- Audio ---
        let playBtnHtml = '';
        let audioCid = record.audio && record.audio.ref && record.audio.ref.$link ? record.audio.ref.$link : '';
        if (audioCid) {
            playBtnHtml = `<button class="album-cover-btn" data-did="${user.did}" data-blob="${audioCid}" title="Play">
                ${coverUrl ? `<img src="${coverUrl}" alt="cover" class="album-cover-img" loading="lazy" onerror="this.onerror=null;this.src='/favicon.ico';">` : `<img src="/favicon.ico" alt="cover" class="album-cover-img" loading="lazy">`}
                <div class="album-cover-overlay"><i class="fas fa-play album-play-icon"></i></div>
            </button>`;
        } else {
            if (record.audio) console.error('[renderLikedPostsAlbumView] Missing audioCid (.ref.$link) for record', { record, item });
                playBtnHtml = coverUrl ? `<img src="${coverUrl}" alt="cover" class="album-cover-img" loading="lazy" onerror="this.onerror=null;this.src='/favicon.ico';">` : `<img src="/favicon.ico" alt="cover" class="album-cover-img" loading="lazy">`;
        }
        // --- Play Count (for lexicon posts) ---
        let playCountHtml = '';
        if (typeof playCount === 'number') {
            playCountHtml = `<div class="album-playcount text-xs text-gray-400 mt-1">Plays: ${playCount}</div>`;
        }
        return `<div class="album-tile">
            ${playBtnHtml}
            <div class="album-title-row">
                <a href="#" class="album-title-link" data-post-uri="${record.uri}">${title || 'Untitled'}</a>
            </div>
            <div class="album-artist-row">
                <a href="#" class="album-artist-link" data-did="${user.did}">${artist}</a>
            </div>
            ${playCountHtml}
        </div>`;
    }));
    html += postCards.join('');
    html += '</div></div>';
    // Add minimal CSS for album view
    html += `<style>
    .album-grid-outer { margin: 1.5rem auto 1.5rem auto; max-width: 1200px; padding: 0 1.2rem; }
    .album-grid { width: 100%; }
    .album-tile { display: flex; flex-direction: column; align-items: center; }
    .album-cover-btn { position: relative; width: 100%; aspect-ratio: 1/1; background: none; border: none; padding: 0; margin-bottom: 0.5rem; cursor: pointer; border-radius: 12px; overflow: hidden; }
    .album-cover-img { width: 100%; height: 100%; object-fit: cover; border-radius: 12px; display: block; }
    .album-cover-placeholder { width: 100%; height: 0; padding-bottom: 100%; background: #222; border-radius: 12px; display: block; position: relative; }
    .album-cover-overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.25); color: #fff; font-size: 2rem; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    .album-cover-btn:hover .album-cover-overlay, .album-cover-btn:focus .album-cover-overlay { opacity: 1; pointer-events: auto; }
    .album-title-row { font-weight: 600; font-size: 0.98rem; margin-bottom: 0.1rem; text-align: center; }
    .album-title-link { color: #fff; text-decoration: none; font-size: 0.97rem; }
    .album-title-link:hover { text-decoration: underline; color: #3b82f6; }
    .album-artist-row { font-size: 0.93rem; color: #bbb; text-align: center; }
    .album-artist-link { color: #bbb; text-decoration: none; font-size: 0.93rem; }
    .album-artist-link:hover { color: #3b82f6; text-decoration: underline; }
    </style>`;
    feedContainer.innerHTML = html;
    // Play logic for covers
    document.querySelectorAll('.album-cover-btn').forEach(btn => {
        btn.addEventListener('click', async function(e) {
            e.preventDefault();
            destroyAllWaveSurfers();
            const did = btn.getAttribute('data-did');
            const blobRef = btn.getAttribute('data-blob');
            if (!did || !blobRef) return;
            // Pause any existing audio and reset icons
            document.querySelectorAll('.album-cover-audio').forEach(aud => { try { aud.pause(); aud.remove(); } catch {} });
            document.querySelectorAll('.album-play-icon').forEach(icon => { icon.classList.remove('fa-pause'); icon.classList.add('fa-play'); });
            // If already playing, just stop
            const overlayIcon = btn.querySelector('.album-play-icon');
            if (btn.classList.contains('playing')) {
                btn.classList.remove('playing');
                if (overlayIcon) { overlayIcon.classList.remove('fa-pause'); overlayIcon.classList.add('fa-play'); }
                return;
            }
            // Mark this as playing
            btn.classList.add('playing');
            if (overlayIcon) { overlayIcon.classList.remove('fa-play'); overlayIcon.classList.add('fa-pause'); }
            // Fetch and play audio
            let audioUrl = null;
            try {
                audioUrl = await fetchAudioBlobUrl(did, blobRef);
            } catch (e) { 
                console.error('[renderLikedPostsAlbumView] Failed to fetch audio blob URL:', e, { did, blobRef });
                btn.classList.remove('playing'); if (overlayIcon) { overlayIcon.classList.remove('fa-pause'); overlayIcon.classList.add('fa-play'); } return; 
            }
            const audio = document.createElement('audio');
            audio.className = 'album-cover-audio';
            audio.src = audioUrl;
            audio.autoplay = true;
            audio.controls = true;
            audio.style.display = 'none';
            btn.parentElement.appendChild(audio);
            audio.play();
            audio.onended = () => {
                btn.classList.remove('playing');
                if (overlayIcon) { overlayIcon.classList.remove('fa-pause'); overlayIcon.classList.add('fa-play'); }
                try { audio.remove(); } catch {}
            };
            audio.onpause = () => {
                btn.classList.remove('playing');
                if (overlayIcon) { overlayIcon.classList.remove('fa-pause'); overlayIcon.classList.add('fa-play'); }
                try { audio.remove(); } catch {}
            };
        });
    });
    // Title click: single post
    document.querySelectorAll('.album-title-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const postUri = link.getAttribute('data-post-uri');
            if (postUri) {
                setPostParamInUrl(postUri);
                renderSinglePostView(postUri);
            }
        });
    });
    // Artist click: artist page
    document.querySelectorAll('.album-artist-link').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const did = link.getAttribute('data-did');
            if (did) {
                renderArtistPage(did);
            }
        });
    });
}

// --- Utility: Filter for audio posts with correct tag and audio file ---
function filterAudioPosts(posts) {
    return posts.filter(item => {
        const record = item.record;
        const did = item.did;
        const user = {
            did,
            handle: '',
            displayName: record.metadata?.artist || '',
            avatar: '/favicon.ico',
        };
        const tags = record.tags;
        if (!tags || !Array.isArray(tags) || !tags.includes('soundskyaudio')) return false;
        // Accept if legacy embed exists
        const embed = record.embed;
        let fileEmbed = null;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/')) return true;
        // Accept if soundskyid tag exists
        for (const tag of tags) {
            if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                return true;
            }
        }
        return false;
    });
}

// --- Utility: Robustly extract blob ref string from ATProto blob objects ---
function extractBlobRef(ref) {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.$link) return ref.$link;
    if (typeof ref === 'string') return ref;
    // If we get here, log and return empty string
    console.error('[extractBlobRef] Invalid blob ref structure:', ref);
    return '';
}

// --- Patch renderSinglePostView to enforce strict lazy loading ---
async function renderSinglePostView(postUri) {
    destroyAllWaveSurfers();
    feedContainer.style.display = '';
    feedLoading.classList.remove('hidden'); // Show loading indicator
    if (!feedContainer.contains(feedLoading)) {
        feedContainer.appendChild(feedLoading);
    }
    const uploadForm = document.getElementById('create-audio-post');
    if (uploadForm) uploadForm.style.display = 'none';
    document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
    feedContainer.innerHTML = `<div id='single-post-content'></div>`;
    if (!feedContainer.contains(feedLoading)) {
        feedContainer.appendChild(feedLoading);
    }
    let postData;
    try {
        const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: postUri });
        postData = threadRes.data.thread && threadRes.data.thread.post ? threadRes.data.thread : threadRes.data.thread;
    } catch (err) {
        console.error('[renderSinglePostView] Failed to load post:', err, { postUri });
        document.getElementById('single-post-content').innerHTML = `<div class='text-red-500'>Failed to load post.</div>`;
        feedLoading.classList.add('hidden');
        return;
    }
    const record = postData.record;
    const did = postData.author.did;
    let audioWaveformId = `waveform-${record.cid}`;
    let lexiconRecord = null;
    let playCount = null;
    // Check for soundskyid tag
    const tags = record.tags;
    let soundskyRkey = null;
    if (tags && Array.isArray(tags)) {
        for (const tag of tags) {
            if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                soundskyRkey = tag.split('=')[1];
                break;
            }
        }
    }
    if (soundskyRkey) {
        try {
            const lexRes = await fetchSoundSkyRecord(agent, { did, rkey: soundskyRkey });
            if (lexRes.success && lexRes.record) {
                lexiconRecord = lexRes.record;
                playCount = await getLexiconPlayCount({ post: postData });
                        }
                    } catch (err) {
            console.error('[renderSinglePostView] Failed to fetch lexicon record:', err, { post: postData, did, soundskyRkey });
            lexiconRecord = null;
        }
    }
    // Prepare artwork HTML for large display if available
    let largeArtworkHtml = '';
    let displayArtworkUrl = '';
    let artworkCid = lexiconRecord && lexiconRecord.artwork && lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.$link ? lexiconRecord.artwork.ref.$link : '';
    if (artworkCid) {
        displayArtworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(artworkCid)}`;
    } else if (lexiconRecord && lexiconRecord.artwork) {
        console.error('[renderSinglePostView] Missing artworkCid (.ref.$link) for lexiconRecord', { lexiconRecord });
    }
    if (displayArtworkUrl) {
        largeArtworkHtml = `<div class="singlepost-artwork-wrapper p-4" style="width:100%;max-width:100%;text-align:center;"><img src="${displayArtworkUrl}" alt="Artwork" style="max-width:100%;max-height:340px;border-radius:18px;box-shadow:0 2px 16px rgba(0,0,0,0.10);background:#f3f4f6;object-fit:contain;"></div>`;
    }
    // Prepare title/artist row
    let titleRowHtml = '';
    let displayTitle = '';
    let displayArtist = '';
    if (lexiconRecord && lexiconRecord.metadata) {
        displayTitle = lexiconRecord.metadata.title || '';
        displayArtist = lexiconRecord.metadata.artist || '';
        } else {
        displayTitle = (record.text || '').split('\n')[0].slice(0, 100);
        displayArtist = postData.author.displayName || postData.author.handle || '';
    }
    // Render the single post view layout
    document.getElementById('single-post-content').innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out mx-auto mt-1 mb-8">
            <div class="p-4">
                ${titleRowHtml}
                ${largeArtworkHtml}
                ${await renderPostCard({
                    post: { uri: postUri, cid: record.cid, record, author: postData.author },
                    user: postData.author,
                    audioHtml: '',
                    options: { lazyWaveformId: audioWaveformId },
                    lexiconRecord: lexiconRecord || null,
                    soundskyRkey,
                    playCount
                })}
            </div>
        </div>
        <div id="comments-${record.cid}"></div>
    `;
    feedLoading.classList.add('hidden');
    // Setup lazy loader for lexicon or legacy audio
    if (lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref && lexiconRecord.audio.ref.$link) {
        const audioCid = lexiconRecord.audio.ref.$link;
        setTimeout(() => setupLazyWaveSurfer(audioWaveformId, did, audioCid, lexiconRecord.audio.size), 0);
    } else if (lexiconRecord && lexiconRecord.audio) {
        console.error('[renderSinglePostView] Missing audioCid (.ref.$link) for lexiconRecord', { lexiconRecord });
    }
    // After rendering the single post, render comments using the same logic as the feed
    // Fetch the thread for comments (if not already available)
    try {
        await renderSinglePostComments(postData);
    } catch (err) {
        console.error('[renderSinglePostView] Failed to render comments:', err, { post: postData });
        const postCardContent = document.querySelector('#single-post-content .post-card .p-4');
        if (postCardContent) {
            postCardContent.insertAdjacentHTML('beforeend', '<div class="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4"><div class="text-red-400 text-xs">Failed to load comments.</div></div>');
        }
    }
    const cardEl = document.querySelector('#single-post-content .post-card');
    if (lexiconRecord) {
        const playBtn = cardEl.querySelector('.soundsky-play-btn');
        if (playBtn) {
            playBtn._soundskyPost = record;
            playBtn._soundskyLexiconRecord = lexiconRecord;
        }
        const playCountEl = cardEl.querySelector('.soundsky-playcount-row span.ml-1');
        if (playCountEl) {
            playCountEl.textContent = typeof playCount === 'number' ? playCount : (typeof lexiconRecord.stats?.plays === 'number' ? lexiconRecord.stats.plays : 0);
        }
    }
}

// --- Helper: Render the comment section for a single post (by post object) ---
async function renderSinglePostComments(post) {
    // Find the .p-4 content area inside the post card
    const postCardContent = document.querySelector('#single-post-content .post-card .p-4');
    if (!postCardContent) return;
    const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: post.uri });
    const replies = (threadRes.data.thread?.replies || []);
    // Render the comment section using the correct markup and classes
    const currentUserAvatar = agent.session?.did ? (document.getElementById('current-user-avatar')?.src || defaultAvatar) : defaultAvatar;
    const commentBlockHtml = `
      <div class=\"mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4\">
        <div class=\"flex items-center gap-2 mb-2\">
          <img src=\"${currentUserAvatar}\" class=\"h-8 w-8 rounded-full\" alt=\"Me\" onerror=\"this.onerror=null;this.src='/favicon.ico';\">
          <form id=\"comment-form-${post.cid}\" class=\"flex-1 flex items-center gap-2\">
            <input id=\"comment-input-${post.cid}\" type=\"text\" placeholder=\"Write a comment\" class=\"flex-1 bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none\" maxlength=\"280\" autocomplete=\"off\">
            <button id=\"comment-send-${post.cid}\" type=\"submit\" class=\"p-2 text-blue-500 hover:text-blue-600\" title=\"Send\">
              <svg width=\"20\" height=\"20\" fill=\"none\" viewBox=\"0 0 20 20\"><path d=\"M2.5 17.5l15-7.5-15-7.5v6.25l10 1.25-10 1.25v6.25z\" fill=\"currentColor\"></path></svg>
            </button>
          </form>
        </div>
        <div id=\"comments-${post.cid}\" class=\"space-y-2\">
          ${
            replies.length === 0
              ? '<div class=\\"text-gray-400 text-xs\\">No comments yet.</div>'
              : renderThreadedComments(replies)
          }
        </div>
      </div>
    `;
    // Remove any old comment section (by id)
    const oldCommentSection = postCardContent.querySelector(`#comments-${post.cid}`)?.parentElement;
    if (oldCommentSection) oldCommentSection.remove();
    // Insert the comment section at the end of .p-4
    postCardContent.insertAdjacentHTML('beforeend', commentBlockHtml);
    // --- Add direct event handler for the comment form (single-post view) ---
    setTimeout(() => {
        const commentForm = document.getElementById(`comment-form-${post.cid}`);
        if (commentForm) {
            commentForm.addEventListener('submit', async function(e) {
                console.debug('[SinglePost] Comment form submit handler fired');
                e.preventDefault();
                const input = commentForm.querySelector('input[type="text"]');
                if (!input) { console.debug('[SinglePost] No input found'); return; }
                const text = input.value.trim();
                if (!text) { console.debug('[SinglePost] No text entered'); return; }
                commentForm.querySelector('button[type="submit"]').disabled = true;
                try {
                    await agent.post({
                        text,
                        reply: {
                            root: { cid: post.cid, uri: post.uri },
                            parent: { cid: post.cid, uri: post.uri }
                        }
                    });
                    input.value = '';
                    console.debug('[SinglePost] Comment posted, reloading comment section');
                    await renderSinglePostComments(post);
                } catch (err) {
                    alert('Failed to post comment: ' + (err.message || err));
                    console.error('[SinglePost] Failed to post comment:', err);
                } finally {
                    commentForm.querySelector('button[type="submit"]').disabled = false;
                }
            });
        } else {
            console.debug('[SinglePost] Comment form not found for direct handler');
        }
    }, 0);
}

// --- Helper: Recursively render threaded comments (minimal indentation, full-width rows) ---
function renderThreadedComments(replies, level = 0) {
    if (!replies || !Array.isArray(replies) || replies.length === 0) return '';
    // Minimal indentation: 1vw per level, capped at 8px
    const indent = `calc(min(1vw, 8px) * ${level})`;
    // Alternate background shade for nesting
    const bgShade = level % 2 === 0 ? 'rgba(36,40,48,0.10)' : 'rgba(36,40,48,0.16)';
    return replies.map(reply => {
        const author = reply.post.author;
        const avatar = author.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${author.did || ''}/@jpeg`;
        const name = author.displayName || author.handle || 'Unknown';
        const commentText = reply.post.record.text || '';
        const isOwnComment = agent.session && agent.session.did === author.did;
        const deleteBtn = isOwnComment ? `<button class='ml-2 px-1 py-0.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-comment-btn' data-uri='${reply.post.uri}' title='Delete comment'><i class='fa-solid fa-trash-can'></i></button>` : '';
        const liked = reply.post.viewer && reply.post.viewer.like;
        const likeCount = reply.post.likeCount || 0;
        const likeBtnHtml = `<button class=\"like-comment-btn flex items-center space-x-1 text-xs ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}\" data-uri=\"${reply.post.uri}\" data-cid=\"${reply.post.cid}\" data-liked=\"${!!liked}\" data-likeuri=\"${liked ? liked : ''}\"><i class=\"${liked ? 'fas' : 'far'} fa-heart\"></i><span>${likeCount}</span></button>`;
        // Recursively render child replies
        const childReplies = renderThreadedComments(reply.replies, level + 1);
        return `<div class=\"soundsky-comment-bubble\" style=\"margin-left:${indent};background:${bgShade};\"><div class=\"flex items-start w-full\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full mr-2\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div class=\"flex-1 min-w-0\"><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200 break-words\">${commentText}</p></div><div class=\"flex items-center gap-1 ml-2 self-start\" style=\"margin-left:auto;\">${likeBtnHtml}${deleteBtn}</div></div>${childReplies}</div>`;
    }).join('');
}

// --- Delegated click handler for waveform play buttons in feed/discovery ---
feedContainer.addEventListener('click', async function(e) {
    const playBtn = e.target.closest('.soundsky-play-btn');
    if (playBtn) {
        e.preventDefault();
        e.stopPropagation(); // Prevent event bubbling to waveform container
        const postCard = playBtn.closest('.post-card');
        const waveformDiv = postCard ? postCard.querySelector('.wavesurfer.waveform') : null;
        const waveformId = waveformDiv ? waveformDiv.id : null;
        if (!waveformId) return;
        // Always destroy all other players before starting a new one
        destroyAllWaveSurfers();
        // If WaveSurfer instance exists, just toggle play/pause
        if (window.soundskyWavesurfers && window.soundskyWavesurfers[waveformId]) {
            const ws = window.soundskyWavesurfers[waveformId];
            if (ws.isPlaying()) {
                ws.pause();
            } else {
                // Pause all others
                Object.entries(window.soundskyWavesurfers).forEach(([id, otherWs]) => {
                    if (id !== waveformId && otherWs && otherWs.pause) otherWs.pause();
                });
                ws.play();
            }
            return;
        }
        // First play: fetch blob, init WaveSurfer, play
        const did = playBtn.getAttribute('data-did');
        const blobRef = playBtn.getAttribute('data-blob');
        // Extract rkey from post URI
        const postUri = postCard ? postCard.getAttribute('data-post-uri') : null;
        let rkey = null;
        if (postUri) {
            const parts = postUri.replace('at://', '').split('/');
            if (parts.length === 3) rkey = parts[2];
        }
        if (!did || !blobRef || !rkey) {
            console.error('[WaveformPlay] Missing did/blobRef/waveformId/rkey', { did, blobRef, waveformId, rkey });
            return;
        }
        // Remove placeholder content
        if (waveformDiv) {
            waveformDiv.innerHTML = '';
        }
        try {
            const audioUrl = await fetchAudioBlobUrl(did, blobRef);
            initWaveSurfer(waveformId, audioUrl);
            // Play after ready
            setTimeout(() => {
                if (window.soundskyWavesurfers && window.soundskyWavesurfers[waveformId]) {
                    try { window.soundskyWavesurfers[waveformId].play(); } catch (err) { console.error('WaveSurfer play() failed:', err); }
                }
            }, 200);
            // Increment play count using did and rkey
            incrementLexiconPlayCount({ did, rkey });
        } catch (err) {
            alert('Failed to load audio: ' + (err.message || err));
        }
    }
});