import { BskyAgent } from 'https://esm.sh/@atproto/api';
import { uploadSoundSkyAudio, fetchSoundSkyRecord } from './soundsky-lexicon.js';

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
function renderSidebarLikedSongs(likedAudioPosts) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    let container = document.getElementById('sidebar-liked-songs');
    if (!container) {
        container = document.createElement('div');
        container.id = 'sidebar-liked-songs';
        container.style.marginTop = '1rem';
        sidebar.appendChild(container);
    }
    if (!likedAudioPosts || likedAudioPosts.length === 0) {
        container.innerHTML = '<div class="text-xs text-gray-400 px-4"><i class="fas fa-heart mr-3"></i> No liked songs yet.</div>';
        return;
    }
    container.innerHTML = `<div class="text-xs text-gray-500 font-semibold px-4 mb-2"><!-- liked songs --></div>` +
        '<div style="max-height: 80%; overflow-y: auto;">' +
        likedAudioPosts.map(item => {
            const post = item.post || item;
            const user = post.author;
            let cover = '';
            let embed = post.record && post.record.embed;
            let images = [];
            if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
                images = embed.media.images;
            } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
                images = embed.images;
            }
            if (images.length > 0) {
                const img = images[0];
                let imgUrl = '';
                if (img.image && img.image.ref) {
                    const blobRef = img.image.ref && img.image.ref.toString ? img.image.ref.toString() : img.image.ref;
                    const userDid = user.did;
                    imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
                }
                cover = `<img src="${imgUrl}" alt="cover" style="width:32px;height:32px;object-fit:cover;border-radius:6px;margin-right:8px;">`;
            }
            const artist = user.displayName || user.handle || '';
            const title = (post.record?.text || '').split('\n')[0].slice(0, 40);
            return `<a href="?post=${encodeURIComponent(post.uri)}" class="flex items-center mb-2 px-4 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition" style="text-decoration:none;">
                ${cover}
                <div style="min-width:0;">
                  <div class="truncate font-medium text-gray-900 dark:text-gray-100" style="font-size:13px;">${title}</div>
                  <div class="truncate text-gray-500" style="font-size:12px;">${artist}</div>
                </div>
            </a>`;
        }).join('') + '</div>';
}

async function fetchAndRenderSidebarLikedSongs() {
    if (!agent || !agent.session || !agent.session.did) return;
    try {
        const res = await agent.api.app.bsky.feed.getActorLikes({ actor: agent.session.did, limit: 6 });
        let likedPosts = res.data?.feed || [];
        // Filter for audio posts
        likedPosts = filterAudioPosts(likedPosts);
        renderSidebarLikedSongs(likedPosts);
    } catch (e) {
        renderSidebarLikedSongs([]);
    }
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
async function loadBanlist() {
    if (_soundskyBanlistSet !== null) return _soundskyBanlistSet;
    try {
        const resp = await fetch('/login/banlist.txt');
        if (resp.ok) {
            const text = await resp.text();
            _soundskyBanlistSet = new Set(text.split(/\r?\n/).map(l => l.trim().toLowerCase()).filter(Boolean));
        } else {
            _soundskyBanlistSet = new Set();
        }
    } catch (e) {
        _soundskyBanlistSet = new Set();
    }
    return _soundskyBanlistSet;
}
async function isBannedHandle(handle) {
    if (!handle) return false;
    const banlist = await loadBanlist();
    const hash = await sha256Hex(handle.trim().toLowerCase());
    return banlist.has(hash);
}
// Helper to hash a string to SHA-256 hex
async function sha256Hex(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

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
async function appendAudioPostCard(audioPost, feedGen) {
    console.debug('[appendAudioPostCard] called for', audioPost);
    if (_soundskyFeedCancelled || feedGen !== _soundskyFeedGeneration) return;
    const post = audioPost.post || audioPost;
    const user = post.author;
    // Banlist check: skip if author is banned
    if (user && user.handle) {
        const handle = user.handle;
        const hash = await sha256Hex(handle.trim().toLowerCase());
        const banlist = await loadBanlist();
        const isBanned = banlist.has(hash);
        // console.log('[Banlist] Checking handle:', handle, 'Hash:', hash, 'Is banned:', isBanned);
        if (isBanned) {
            // console.log('[Banlist] Skipping banned user:', handle);
            return;
        }
    }
    let audioHtml = '';
    let audioWaveformId = `waveform-${post.cid}`;
    let fileEmbed = null;
    let lexiconRecord = null;
    let playCount = null;
    let useLexicon = false;
    // Check for soundskyid tag
    const tags = post.record && post.record.tags;
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
        // Fetch the lexicon record for this post
        try {
            const did = user.did;
            const lexRes = await fetchSoundSkyRecord(agent, { did, rkey: soundskyRkey });
            if (lexRes.success && lexRes.record) {
                lexiconRecord = lexRes.record;
                useLexicon = true;
                // Fetch play count from the latest record using getLexiconPlayCount
                playCount = await getLexiconPlayCount({ post });
            } else {
                useLexicon = false;
                console.warn('[appendAudioPostCard] Skipping post: missing lexicon record', post.uri);
                return; // Skip this post
            }
        } catch (err) {
            useLexicon = false;
            console.warn('[appendAudioPostCard] Skipping post: error fetching lexicon record', post.uri, err);
            return; // Skip this post
        }
    }
    // For lexicon posts, set up the player to use the lexicon audio blob
    // (audioHtml handled by renderPostCard)
    // Legacy embed logic
    if (!useLexicon) {
        const embed = post.record && post.record.embed;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
    if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
            audioHtml = '';
        } else {
            // No valid audio, skip this post
            console.warn('[appendAudioPostCard] Skipping post: missing audio', post.uri);
            return;
        }
    } else {
        // For lexicon posts, ensure audio is present
        if (!lexiconRecord || !lexiconRecord.audio || !lexiconRecord.audio.ref) {
            console.warn('[appendAudioPostCard] Skipping post: lexicon record missing audio', post.uri);
            return;
        }
    }
    if (feedGen !== _soundskyFeedGeneration) return;
    // Always pass lexiconRecord and playCount to renderPostCard if available
    const cardHtml = await renderPostCard({ post, user, audioHtml, options: { lazyWaveformId: audioWaveformId }, lexiconRecord: lexiconRecord || null, soundskyRkey, playCount });
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHtml;
    const cardEl = tempDiv.firstElementChild;
    feedContainer.appendChild(cardEl);
    if (lexiconRecord) {
        const playBtn = cardEl.querySelector('.soundsky-play-btn');
        if (playBtn) {
            playBtn._soundskyPost = post;
            playBtn._soundskyLexiconRecord = lexiconRecord;
        }
        const playCountEl = cardEl.querySelector('.soundsky-playcount-row span.ml-1');
        if (playCountEl) {
            playCountEl.textContent = playCount;
        }
    }
    if (!_soundskyFirstCardAppended) {
        feedLoading.classList.add('hidden');
        _soundskyFirstCardAppended = true;
    }
    attachPostTitleLinkHandlers();
    // Setup lazy loader for lexicon or legacy audio
    if (useLexicon && lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref) {
        const blobRef = lexiconRecord.audio.ref && lexiconRecord.audio.ref.toString ? lexiconRecord.audio.ref.toString() : lexiconRecord.audio.ref;
        setTimeout(() => setupLazyWaveSurfer(audioWaveformId, user.did, blobRef, lexiconRecord.audio.size), 0);
    } else if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
        const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
        setTimeout(() => setupLazyWaveSurfer(audioWaveformId, user.did, blobRef, fileEmbed.file.size), 0);
    }
}

// Update fetchSoundskyFeed to render each card as soon as it's ready
async function fetchSoundskyFeed({ append = false, mode = 'home', q = false } = {}) {
    console.debug('[fetchSoundskyFeed] called with', { append, mode, q });
    destroyAllWaveSurfers();
    feedLoading.classList.remove('hidden');
    if (!append) {
        feedContainer.innerHTML = '';
        loadedAudioPosts = [];
        nextCursor = null;
    }
    // Reset the first card flag and cancel flag
    _soundskyFirstCardAppended = false;
    _soundskyFeedCancelled = false;
    // Increment feed generation and capture for this load
    _soundskyFeedGeneration++;
    const thisFeedGen = _soundskyFeedGeneration;
    feedContainer.appendChild(feedLoading);
    try {
        let foundAudio = false;
        let localCursor = nextCursor;
        let lastCursor = null;
        do {
            let feed;
            if (mode === 'home') {
                const params = { limit: 50 };
                if (localCursor) params.cursor = localCursor;
                feed = await agent.getTimeline(params);
            } else if (mode === 'likes') {
                feedContainer.innerHTML = '<div class="text-center text-gray-500 py-8">Coming Soon!</div>';
                feedLoading.classList.add('hidden');
                return;
            } else if (mode === 'discover') {
                const params = { q: '#soundskyaudio', limit: 50 };
                if (localCursor) params.cursor = localCursor;
                feed = await agent.api.app.bsky.feed.searchPosts(params);
            } else if (mode == 'search' && q != false) {
                // alias search on image id
                const params = { q: '#soundskyimg='+q, limit: 50 };
                if (localCursor) params.cursor = localCursor;
                feed = await agent.api.app.bsky.feed.searchPosts(params);
            } else if (mode == 'link' && q != false) {
                // alias search on image id
                const params = { q: '#soundskyid='+q, limit: 50 };
                if (localCursor) params.cursor = localCursor;
                feed = await agent.api.app.bsky.feed.searchPosts(params);
            } else {
                const params = { limit: 50 };
                if (localCursor) params.cursor = localCursor;
                feed = await agent.getTimeline(params);
            }
            localCursor = feed && feed.data && feed.data.cursor || null;
            lastCursor = localCursor;
            // Use filterAudioPosts utility
            let audioPosts = [];
            if (mode === 'home') {
                if (feed && feed.data && feed.data.feed) {
                    audioPosts = filterAudioPosts(feed.data.feed);
                } else if (feed && feed.data && feed.data.posts) {
                    audioPosts = filterAudioPosts(feed.data.posts);
                }
            } else {
                if (feed && feed.data && feed.data.feed) {
                    audioPosts = filterAudioPosts(feed.data.feed);
                } else if (feed && feed.data && feed.data.posts) {
                    audioPosts = filterAudioPosts(feed.data.posts);
                }
            }
            if (audioPosts && audioPosts.length > 0) {
                foundAudio = true;
                if (append) {
                    loadedAudioPosts = loadedAudioPosts.concat(audioPosts);
                } else {
                    loadedAudioPosts = audioPosts;
                }
                // Render each card as soon as it's ready
                for (const audioPost of audioPosts) {
                    await appendAudioPostCard(audioPost, thisFeedGen);
                }
            }
            if (append && audioPosts && audioPosts.length > 0) break;
        } while (!foundAudio && localCursor);
        nextCursor = lastCursor;
        // At the end, show Load More button if needed
        if (!!nextCursor) {
            // Remove any existing Load More button
            const oldBtn = document.getElementById('load-more-btn');
            if (oldBtn) oldBtn.remove();
            // Add new Load More button
            const btnDiv = document.createElement('div');
            btnDiv.className = 'flex justify-center py-4';
            btnDiv.innerHTML = '<button id="load-more-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Load More</button>';
            feedContainer.appendChild(btnDiv);
            const loadMoreBtn = document.getElementById('load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.onclick = () => fetchSoundskyFeed({ append: true });
            }
        }
    } finally {
        feedLoading.classList.add('hidden');
    }
}

// Global object to store WaveSurfer instances
window.soundskyWavesurfers = window.soundskyWavesurfers || {};

async function renderFeed(posts, { showLoadMore = false } = {}) {
    // DEBUG: Print all posts being processed
    console.debug('[renderFeed] raw posts:', posts);
    if (Array.isArray(posts)) {
        posts.forEach((item, idx) => {
            const post = item.post || item;
            const tags = post.record && post.record.tags;
            console.debug(`[renderFeed] Post[${idx}] uri:`, post.uri, 'tags:', tags);
        });
    }
    // Only render posts with audio content
    const audioPosts = filterAudioPosts(posts);
    console.debug('[renderFeed] audioPosts after filterAudioPosts:', audioPosts);
    console.debug('[renderFeed] audioPosts count:', audioPosts.length);
    if (!audioPosts.length) {
        feedContainer.innerHTML = `<div class="text-center text-gray-500 py-8">
            It's quiet in here - let's post some music or <a href="#" id="go-discover-link" class="text-blue-500 underline">follow other artists</a>.
        </div>`;
        setTimeout(() => {
            const link = document.getElementById('go-discover-link');
            if (link) {
                link.onclick = (e) => {
                    e.preventDefault();
                    clearPostParamInUrl();
                    setActiveNav('nav-discover');
                    fetchSoundskyFeed({ mode: 'discover' });
                };
            }
        }, 0);
        return;
    }
    // --- Batch fetch lexicon play counts ---
    // 1. Collect all posts with soundskyid
    const lexiconPosts = [];
    const postUriToSoundsky = {};
    for (const item of audioPosts) {
        const post = item.post || item;
        const user = post.author;
        const tags = post.record && post.record.tags;
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
            lexiconPosts.push({ post, user, soundskyRkey });
            postUriToSoundsky[post.uri] = { did: user.did, rkey: soundskyRkey };
            console.debug('[renderFeed] Collected lexicon post:', { uri: post.uri, did: user.did, rkey: soundskyRkey });
        }
    }
    console.debug('[renderFeed] lexiconPosts count:', lexiconPosts.length);
    // 2. Batch fetch all lexicon records (with concurrency limit)
    const BATCH_LIMIT = 5;
    async function batchGetLexiconRecords(lexiconPosts) {
        const results = {};
        let i = 0;
        async function fetchOne({ post, user, soundskyRkey }) {
            try {
                console.debug('[batchGetLexiconRecords] Fetching:', { did: user.did, rkey: soundskyRkey, postUri: post.uri });
                const res = await agent.api.com.atproto.repo.getRecord({
                    repo: user.did,
                    collection: 'cloud.soundsky.audio',
                    rkey: soundskyRkey
                });
                const record = res.data.value;
                let playCount = 0;
                if (record && record.stats && typeof record.stats.plays === 'number') playCount = record.stats.plays;
                results[post.uri] = { playCount, lexiconRecord: record };
                console.debug('[batchGetLexiconRecords] Success:', { postUri: post.uri, playCount, record });
            } catch (err) {
                results[post.uri] = { playCount: 0, lexiconRecord: null };
                console.error('[batchGetLexiconRecords] Error for', post.uri, err);
            }
        }
        while (i < lexiconPosts.length) {
            const batch = lexiconPosts.slice(i, i + BATCH_LIMIT);
            await Promise.all(batch.map(fetchOne));
            i += BATCH_LIMIT;
        }
        return results;
    }
    const lexiconMap = await batchGetLexiconRecords(lexiconPosts);
    // 3. Render posts, passing playCount and lexiconRecord if available
    const wavesurferInitQueue = [];
    let html = '';
    const postCards = await Promise.all(audioPosts.map(async item => {
        const post = item.post || item;
        const user = post.author;
        let audioHtml = '';
        let audioBlobUrl = null;
        let audioWaveformId = `waveform-${post.cid}`;
        let fileEmbed = null;
        let lexiconRecord = null;
        let playCount = null;
        let soundskyRkey = null;
        const tags = post.record && post.record.tags;
        if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
                if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                    soundskyRkey = tag.split('=')[1];
                    break;
                }
            }
        }
        // Use batch-fetched lexicon data if available
        if (lexiconMap[post.uri]) {
            lexiconRecord = lexiconMap[post.uri].lexiconRecord;
            playCount = await getLexiconPlayCount({ post });
        }
        // For lexicon posts, let renderPostCard handle player/artwork
        if (lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref) {
            // No need to set audioHtml here
        } else {
            // Legacy embed logic
        const embed = post.record && post.record.embed;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
            const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
            try {
                audioBlobUrl = await fetchAudioBlobUrl(user.did, blobRef);
            } catch (e) {
                audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailableor Session Expired.</div>`;
            }
            if (audioBlobUrl && audioWaveformId) {
                audioHtml = `
                          <div class=\"flex items-center gap-2 mt-3 audioplayerbox\">\n                        <!--IMG-FEED-->\n                        <button class=\"wavesurfer-play-btn soundsky-play-btn\" data-waveid=\"${audioWaveformId}\">\n                          <svg class=\"wavesurfer-play-icon\" width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\">\n                            <circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#3b82f6\"/>\n                            <polygon class=\"play-shape\" points=\"11,9 21,14 11,19\" fill=\"white\"/>\n                          </svg>\n                        </button>\n                        <div id=\"${audioWaveformId}\" class=\"wavesurfer waveform flex-1 h-12 relative\">\n                          <div class=\"wavesurfer-time\">0:00</div>\n                          <div class=\"wavesurfer-duration\">0:00</div>\n                          <div class=\"wavesurfer-hover\"></div>\n                        </div>\n                      </div>\n                    `;
                wavesurferInitQueue.push({ audioWaveformId, audioBlobUrl });
            }
        }
    }
        return renderPostCard({ post, user, audioHtml, options: { lazyWaveformId: audioWaveformId }, lexiconRecord, soundskyRkey, playCount });
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

// Only declare audioPostForm once at the top
const audioPostForm = document.getElementById('audio-post-form');
const audioFileInput = document.getElementById('audio-file');
if (audioFileInput) audioFileInput.setAttribute('accept', '.mp3,audio/mpeg');
const audioCaptionInput = document.getElementById('audio-caption');
const audioPostBtn = document.getElementById('audio-post-btn');
const audioPostStatus = document.getElementById('audio-post-status');

// Add an optional image file input to the audio post form (styled like the MP3 upload)
if (audioPostForm && !document.getElementById('artwork-file')) {
    // Find the audio file input and its custom label/button
    const audioFileInput = document.getElementById('audio-file');
    const audioFileLabel = audioFileInput && audioFileInput.labels && audioFileInput.labels[0];
    // Create artwork input (hidden)
    const artworkInput = document.createElement('input');
    artworkInput.type = 'file';
    artworkInput.id = 'artwork-file';
    artworkInput.name = 'artwork';
    artworkInput.accept = '.png,.jpg,.jpeg,.gif,image/png,image/jpeg,image/gif';
    artworkInput.className = 'hidden';
    // Create custom label/button for artwork
    const artworkLabel = document.createElement('label');
    artworkLabel.htmlFor = 'artwork-file';
    artworkLabel.className = audioFileLabel ? audioFileLabel.className : 'cursor-pointer px-3 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100';
    artworkLabel.style.marginLeft = '0.5rem';
    artworkLabel.innerHTML = '<i class="fa fa-image mr-1"></i><span class="text-sm text-gray-500">Choose Artwork...</span>';
    // File name display
    const artworkFileName = document.createElement('span');
    artworkFileName.id = 'artwork-file-name';
    artworkFileName.className = 'ml-2 text-sm text-gray-300';
    artworkFileName.textContent = ''; // 'No file chosen'
    // Insert artwork input, label, and file name after the audio file input/label
    if (audioFileInput && audioFileInput.parentNode) {
        // Find the next sibling after the audio file input (could be the label or something else)
        let insertAfter = audioFileInput;
        if (audioFileLabel && audioFileLabel.nextSibling) {
            insertAfter = audioFileLabel;
        }
        insertAfter.parentNode.insertBefore(artworkInput, insertAfter.nextSibling);
        insertAfter.parentNode.insertBefore(artworkLabel, artworkInput.nextSibling);
        insertAfter.parentNode.insertBefore(artworkFileName, artworkLabel.nextSibling);
    }

}

// Handle audio post form submit
if (audioPostForm) {
    audioPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        audioPostStatus.textContent = '';
        audioPostBtn.disabled = true;
        audioPostBtn.textContent = 'Uploading...';
        try {
            const file = audioFileInput.files[0];
            const artworkInput = document.getElementById('artwork-file');
            const artworkFile = artworkInput && artworkInput.files && artworkInput.files[0] ? artworkInput.files[0] : null;
            // Collect metadata fields
            const metaTitle = document.getElementById('meta-title').value.trim();
            const metaArtist = document.getElementById('meta-artist').value.trim();
            const metaAlbum = document.getElementById('meta-album')?.value.trim();
            const metaGenre = document.getElementById('meta-genre')?.value.trim();
            const metaYear = document.getElementById('meta-year')?.value.trim();
            const metaBpm = document.getElementById('meta-bpm')?.value.trim();
            const metaKey = document.getElementById('meta-key')?.value.trim();
            const metaIsrc = document.getElementById('meta-isrc')?.value.trim();
            const metaLicense = document.getElementById('meta-license')?.value.trim();
            const metaTags = document.getElementById('meta-tags')?.value.trim();
            const caption = audioCaptionInput.value || '';
            // Build metadata object
            const metadata = {
                title: metaTitle,
                artist: metaArtist,
                album: metaAlbum,
                genre: metaGenre,
                year: metaYear ? parseInt(metaYear, 10) : undefined,
                bpm: metaBpm ? parseInt(metaBpm, 10) : undefined,
                key: metaKey,
                isrc: metaIsrc,
                license: metaLicense,
                tags: metaTags ? metaTags.split(',').map(t => t.trim()).filter(Boolean) : []
            };
            // Remove empty fields
            Object.keys(metadata).forEach(k => (metadata[k] === '' || metadata[k] === undefined) && delete metadata[k]);
            // Upload to SoundSky lexicon
            const lexRes = await uploadSoundSkyAudio(agent, { audioFile: file, artworkFile, caption, metadata });
            if (!lexRes.success) throw new Error(lexRes.error || 'Failed to upload to SoundSky lexicon');
            // Extract rkey from lexicon URI (e.g. at://did:plc:.../cloud.soundsky.audio/3lpoyiyfxkj2c)
            let rkey = '';
            if (lexRes.uri && typeof lexRes.uri === 'string') {
                const parts = lexRes.uri.split('/');
                rkey = parts[parts.length - 1];
            }
            // Compose Bluesky post tags
            const tags = ['soundskyaudio'];
            if (rkey) tags.push(`soundskyid=${rkey}`);
            if (metadata.genre) tags.push(metadata.genre);
            if (metadata.album) tags.push(metadata.album);
            if (metadata.tags && Array.isArray(metadata.tags)) tags.push(...metadata.tags);
            // Add Play on SoundSky link as a facet using /?link=<rkey>
            let postText = caption || '';
            const playerUrl = `https://soundsky.cloud/?link=${encodeURIComponent(rkey)}`;
            const linkText = '\n\nPlay on SoundSky';
            if (!postText.endsWith(linkText)) postText += linkText;
            // Find byteStart/byteEnd for 'Play on SoundSky' (last occurrence)
            const encoder = new TextEncoder();
            const soundSkyIdx = postText.lastIndexOf('Play on SoundSky');
            const byteStart = encoder.encode(postText.slice(0, soundSkyIdx)).length;
            const byteEnd = byteStart + encoder.encode('Play on SoundSky').length;
            // Only add the facet if playerUrl is a valid https:// URL
            let facets = [];
            // console.log('[SoundSky] playerUrl:', playerUrl);
            // console.log('[SoundSky] byteStart:', byteStart, 'byteEnd:', byteEnd);
            if (playerUrl && playerUrl.startsWith('https://')) {
                facets = [{
                    index: { byteStart, byteEnd },
                    features: [
                        {
                            $type: 'app.bsky.richtext.facet#link',
                            uri: playerUrl
                        }
                    ]
                }];
            }
            // console.log('[SoundSky] facets:', facets);
            // --- Try to post to Bluesky, cleanup lexicon record on failure ---
            let postRes;
            try {
                postRes = await agent.post({ text: postText, tags, facets });
            } catch (err) {
                // Delete the lexicon record to avoid orphaned entry
                try {
                    const did = agent.session?.did;
                    if (did && rkey) {
                        await agent.api.com.atproto.repo.deleteRecord({
                            repo: did,
                            collection: 'cloud.soundsky.audio',
                            rkey: rkey,
                        });
                        console.error('Bluesky post failed, lexicon record deleted to avoid orphaned entry.');
                    }
                } catch (cleanupErr) {
                    console.error('Failed to delete orphaned lexicon record:', cleanupErr);
                }
                throw err;
            }
            audioPostStatus.textContent = 'Posted!';
            audioPostForm.reset();
            const uploadForm = document.getElementById('create-audio-post');
            uploadForm.style.display = 'none';
            fetchSoundskyFeed();
        } catch (err) {
            audioPostStatus.textContent = 'Error: ' + (err.message || err);
            console.error('Audio post error:', err);
        } finally {
            audioPostBtn.disabled = false;
            audioPostBtn.textContent = 'Post Audio';
        }
    });
}

// At the end of main.js, inject the CSS for .soundsky-play-btn if not present
if (!document.getElementById('soundsky-play-btn-style')) {
    const style = document.createElement('style');
    style.id = 'soundsky-play-btn-style';
    style.textContent = `
    .soundsky-play-btn {
      width: 48px;
      height: 48px;
      border: none;
      background: none;
      padding: 0;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(59,130,246,0.10);
      transition: transform 0.1s, box-shadow 0.1s;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
    }
    .soundsky-play-btn:focus,
    .soundsky-play-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 4px 16px rgba(59,130,246,0.18);
    }
    .wavesurfer-play-icon {
      display: block;
    }
    `;
    document.head.appendChild(style);
}

// --- Single Post View Logic ---
function getPostParamFromUrl() {
    const url = new URL(window.location.href);
    return url.searchParams.get('post');
}

function setPostParamInUrl(postUri) {
    const url = new URL(window.location.href);
    url.searchParams.set('post', postUri);
    window.history.pushState({}, '', url);
}

function clearPostParamInUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    window.history.replaceState({}, '', url);
}

function clearAllParamsInUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('post');
    url.searchParams.delete('artist');
    url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
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
        document.getElementById('single-post-content').innerHTML = `<div class='text-red-500'>Failed to load post.</div>`;
        feedLoading.classList.add('hidden');
        return;
    }
    const post = postData.post || postData;
    const user = post.author;
    let audioWaveformId = `waveform-${post.cid}`;
    let lexiconRecord = null;
    let playCount = null;
    // Check for soundskyid tag
    const tags = post.record && post.record.tags;
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
            const did = user.did;
            const lexRes = await fetchSoundSkyRecord(agent, { did, rkey: soundskyRkey });
            if (lexRes.success && lexRes.record) {
                lexiconRecord = lexRes.record;
                playCount = await getLexiconPlayCount({ post });
            }
        } catch (err) {
            lexiconRecord = null;
        }
    }
    // Prepare artwork HTML for large display if available
    let largeArtworkHtml = '';
    let displayArtworkUrl = '';
    if (lexiconRecord && lexiconRecord.artwork && lexiconRecord.artwork.ref) {
        const blobRef = lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.toString ? lexiconRecord.artwork.ref.toString() : lexiconRecord.artwork.ref;
        displayArtworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
    } else {
        // Legacy artwork logic
        let embed = post.record && post.record.embed;
        let images = [];
        if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
            images = embed.media.images;
        } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
            images = embed.images;
        }
        if (images.length > 0) {
            const img = images[0];
            if (img.image && img.image.ref) {
                const blobRef = img.image.ref && img.image.ref.toString ? img.image.ref.toString() : img.image.ref;
                displayArtworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
            }
        }
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
        displayTitle = (post.record?.text || '').split('\n')[0].slice(0, 100);
        displayArtist = user.displayName || user.handle || '';
    }
    /*
        if (displayArtist && displayTitle) {
            titleRowHtml = `<div class="singlepost-title-row" style="font-size:1.35rem;font-weight:700;text-align:center;margin-bottom:0.7rem;">${displayArtist}: <span style="font-weight:400;">${displayTitle}</span></div>`;
        } else if (displayTitle) {
            titleRowHtml = `<div class="singlepost-title-row" style="font-size:1.35rem;font-weight:700;text-align:center;margin-bottom:0.7rem;">${displayTitle}</div>`;
        } else if (displayArtist) {
            titleRowHtml = `<div class="singlepost-title-row" style="font-size:1.35rem;font-weight:700;text-align:center;margin-bottom:0.7rem;">${displayArtist}</div>`;
        }
    */
    // Render the single post view layout
    document.getElementById('single-post-content').innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out mx-auto mt-1 mb-8">
            <div class="p-4">
                ${titleRowHtml}
                ${largeArtworkHtml}
                ${await renderPostCard({ post, user, audioHtml: '', options: { lazyWaveformId: audioWaveformId }, lexiconRecord: lexiconRecord || null, soundskyRkey, playCount })}
            </div>
        </div>
        <div id="comments-${post.cid}"></div>
    `;
    feedLoading.classList.add('hidden');
    // Setup lazy loader for lexicon or legacy audio
    if (lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref) {
        const blobRef = lexiconRecord.audio.ref && lexiconRecord.audio.ref.toString ? lexiconRecord.audio.ref.toString() : lexiconRecord.audio.ref;
        setTimeout(() => setupLazyWaveSurfer(audioWaveformId, user.did, blobRef, lexiconRecord.audio.size), 0);
                } else {
        // Legacy embed logic
        let fileEmbed = null;
        const embed = post.record && post.record.embed;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
            const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
            setTimeout(() => setupLazyWaveSurfer(audioWaveformId, user.did, blobRef, fileEmbed.file.size), 0);
        }
    }
    // After rendering the single post, render comments using the same logic as the feed
    // Fetch the thread for comments (if not already available)
    try {
        await renderSinglePostComments(post);
                    } catch (err) {
        const postCardContent = document.querySelector('#single-post-content .post-card .p-4');
        if (postCardContent) {
            postCardContent.insertAdjacentHTML('beforeend', '<div class="mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4"><div class="text-red-400 text-xs">Failed to load comments.</div></div>');
        }
    }
    const cardEl = document.querySelector('#single-post-content .post-card');
    if (lexiconRecord) {
        const playBtn = cardEl.querySelector('.soundsky-play-btn');
        if (playBtn) {
            playBtn._soundskyPost = post;
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

// --- 3. Add renderArtistPage(did) ---
async function renderArtistPage(did) {
    destroyAllWaveSurfers();
    // Set ?artist=... in the URL
    const url = new URL(window.location.href);
    url.searchParams.set('artist', did);
    window.history.pushState({}, '', url);
    // Hide upload form
    const uploadForm = document.getElementById('create-audio-post');
    if (uploadForm) uploadForm.style.display = 'none';
    // Remove modal/blur logic
    document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
    // Stop and destroy any existing WaveSurfer instances
    if (window.soundskyWavesurfers) {
        Object.values(window.soundskyWavesurfers).forEach(ws => { try { ws.destroy(); } catch {} });
        window.soundskyWavesurfers = {};
    }
    feedContainer.innerHTML = `<div id='artist-page-content'></div>`;
    const container = document.getElementById('artist-page-content');
    container.innerHTML = `<div class='text-center text-gray-400 py-8'><img src="loading.webp" style="margin:auto;width: 80px;"></div>`;
    let profile;
    try {
        const res = await agent.getProfile({ actor: did });
        profile = res.data;
    } catch (e) {
        // Redirect to homepage
        const redirectUrl = window.location.origin;
        window.location.href = redirectUrl;
        // old message
        container.innerHTML = `<div class='text-red-500'>Failed to load artist profile.</div>`;
        return;
    }
    // Fetch posts (with pagination support, but just first 50 for now)
    let posts = [];
    let cursor = null;
    try {
        const res = await agent.api.app.bsky.feed.getAuthorFeed({ actor: did, limit: 50 });
        posts = res.data.feed || [];
    } catch (e) {
        container.innerHTML = `<div class='text-red-500'>Failed to load artist tracks.</div>`;
        return;
    }
    // Use filterAudioPosts utility
    const audioPosts = filterAudioPosts(posts);
    // Render profile header
    let avatarUrl = profile.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
    let displayName = profile.displayName || profile.handle || 'Unknown';
    let handle = profile.handle ? `@${profile.handle}` : '';
    let description = profile.description || '';
    let headerHtml = `
      <div class="flex flex-col items-center py-8">
        <img class="h-24 w-24 rounded-full border-4 border-blue-200 mb-4" src="${avatarUrl}" alt="${handle}" onerror="this.onerror=null;this.src='${defaultAvatar}';">
        <div class="text-2xl font-bold text-gray-900 dark:text-gray-100">${displayName}</div>
        <div class="text-gray-500 mb-2">${handle}</div>
        <div class="max-w-xl text-center text-gray-700 dark:text-gray-300 mb-4">${description}</div>
      </div>
    `;
    // Render audio posts (lexicon-aware)
    let tracksHtml = '';
    if (audioPosts.length === 0) {
        tracksHtml = `<div class='text-center text-gray-400 py-8'>No tracks yet.</div>`;
    } else {
        let html = '';
        const lazyLoaders = [];
        for (const item of audioPosts) {
            const post = item.post || item;
            const user = post.author;
            let audioWaveformId = `waveform-${post.cid}`;
            let lexiconRecord = null;
            let playCount = null;
            // Check for soundskyid tag
            const tags = post.record && post.record.tags;
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
                    const did = user.did;
                    const lexRes = await fetchSoundSkyRecord(agent, { did, rkey: soundskyRkey });
                    if (lexRes.success && lexRes.record) {
                        lexiconRecord = lexRes.record;
                        playCount = await getLexiconPlayCount({ post });
                    }
                } catch (err) {
                    lexiconRecord = null;
                }
            }
            html += await renderPostCard({ post, user, audioHtml: '', options: { lazyWaveformId: audioWaveformId }, lexiconRecord: lexiconRecord || null, soundskyRkey, playCount });
            // Setup lazy loader for lexicon or legacy audio
            if (lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref) {
                const blobRef = lexiconRecord.audio.ref && lexiconRecord.audio.ref.toString ? lexiconRecord.audio.ref.toString() : lexiconRecord.audio.ref;
                lazyLoaders.push(() => setTimeout(() => setupLazyWaveSurfer(audioWaveformId, user.did, blobRef, lexiconRecord.audio.size), 0));
            } else {
                // Legacy embed logic
            let fileEmbed = null;
            const embed = post.record && post.record.embed;
            if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
            else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
            if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
                const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
                    lazyLoaders.push(() => setTimeout(() => setupLazyWaveSurfer(audioWaveformId, user.did, blobRef, fileEmbed.file.size), 0));
                }
            }
        }
        tracksHtml = html;
        // After rendering, set up lazy loader for each
        setTimeout(() => { lazyLoaders.forEach(fn => fn()); }, 0);
    }
    container.innerHTML = headerHtml + `<div class='mx-auto'>${tracksHtml}</div>`;
}

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

// Helper: format relative time
function formatRelativeTime(dateString) {
    const now = new Date();
    const then = new Date(dateString);
    const diff = Math.floor((now - then) / 1000); // seconds
    if (diff < 60) return 'just now';
    if (diff < 3600) {
        const m = Math.floor(diff / 60);
        return m === 1 ? '1 minute ago' : `${m} minutes ago`;
    }
    if (diff < 86400) {
        const h = Math.floor(diff / 3600);
        return h === 1 ? '1 hour ago' : `${h} hours ago`;
    }
    if (diff < 2592000) {
        const d = Math.floor(diff / 86400);
        return d === 1 ? '1 day ago' : `${d} days ago`;
    }
    if (diff < 31536000) {
        const mo = Math.floor(diff / 2592000);
        return mo === 1 ? '1 month ago' : `${mo} months ago`;
    }
    const y = Math.floor(diff / 31536000);
    return y === 1 ? '1 year ago' : `${y} years ago`;
}

// Helper to get the current PDS base URL
function getCurrentPdsUrl() {
    // Try to get from agent if possible
    if (agent && agent.service) return agent.service;
    // Fallback to localStorage or default
    return localStorage.getItem('bskyPds') || 'https://bsky.social';
}

// --- Utility: Filter for audio posts with correct tag and audio file ---
function filterAudioPosts(posts) {
    return posts.filter(item => {
        const post = item.post || item;
        const tags = post.record && post.record.tags;
        if (!tags || !Array.isArray(tags) || !tags.includes('soundskyaudio')) return false;
        // Accept if legacy embed exists
        const embed = post.record && post.record.embed;
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

// --- Utility: Render a post card (returns HTML string) ---
async function renderPostCard({ post, user, audioHtml, options = {}, lexiconRecord = null, soundskyRkey = null, playCount = null }) {
    // console.log('[renderPostCard] called for post:', { uri: post.uri, lexiconRecord, soundskyRkey, playCount });
    const did = user.did;
    let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
    let displayTitle = '';
    let displayArtist = '';
    let displayAlbum = '';
    let displayGenre = '';
    let displayYear = '';
    let displayArtworkUrl = '';
    let displayAudioBlob = null;
    let displayAudioSize = null;
    let displayText = '';
    let displayMetadata = {};
    let isLexicon = false;
    if (lexiconRecord) {
        isLexicon = true;
        displayTitle = lexiconRecord.metadata?.title || '';
        displayArtist = lexiconRecord.metadata?.artist || '';
        displayAlbum = lexiconRecord.metadata?.album || '';
        displayGenre = lexiconRecord.metadata?.genre || '';
        displayYear = lexiconRecord.metadata?.year || '';
        displayMetadata = lexiconRecord.metadata || {};
        if (lexiconRecord.artwork && lexiconRecord.artwork.ref) {
            const blobRef = lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.toString ? lexiconRecord.artwork.ref.toString() : lexiconRecord.artwork.ref;
            displayArtworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(blobRef)}`;
        }
        if (lexiconRecord.audio && lexiconRecord.audio.ref) {
            displayAudioBlob = lexiconRecord.audio.ref && lexiconRecord.audio.ref.toString ? lexiconRecord.audio.ref.toString() : lexiconRecord.audio.ref;
            displayAudioSize = lexiconRecord.audio.size;
        }
        // --- Play counter for custom lexicon posts ---
        // Use playCount if provided, else fallback to stats.plays, else 0
        if (typeof playCount !== 'number') {
            playCount = 0;
        }
    } else {
        displayText = post.record.text || '';
        displayTitle = displayText.split('\n')[0].slice(0, 100);
        displayArtist = user.displayName || user.handle || 'Unknown';
        // Legacy artwork logic
    let embed = post.record && post.record.embed;
    let images = [];
    if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
        images = embed.media.images;
    } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
        images = embed.images;
    }
    if (images.length > 0) {
        const img = images[0];
        let imgUrl = '';
        if (img.image && img.image.ref) {
            const blobRef = img.image.ref && img.image.ref.toString ? img.image.ref.toString() : img.image.ref;
                imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(blobRef)}`;
            }
            displayArtworkUrl = imgUrl;
        }
    }
    // --- Artwork HTML ---
    // For legacy: check for Imgur tag
    if (!isLexicon && !displayArtworkUrl) {
        const tags = post.record && post.record.tags;
        let soundskyImgId = null;
        if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
                if (typeof tag === 'string' && tag.startsWith('soundskyimg=')) {
                    soundskyImgId = tag.split('=')[1];
                    break;
                }
            }
        }
        if (soundskyImgId) {
            displayArtworkUrl = `https://i.imgur.com/${soundskyImgId}.png`;
        }
    }
    // Constrain cover size for all posts
    let artworkHtml = '';
    if (displayArtworkUrl) {
        artworkHtml = `<div class=\"mb-2\"><img src=\"${displayArtworkUrl}\" alt=\"Artwork\" class=\"soundsky-cover-img max-h-24 max-w-24 min-h-24 min-w-24 rounded-lg object-contain mx-auto\" style=\"max-width:96px;max-height:96px;background:#f3f4f6;\" loading=\"lazy\" onerror=\"this.onerror=null;this.src='/favicon.ico';\"></div>`;
    } else {
        // Placeholder for missing cover
        artworkHtml = `<div class=\"mb-2\"><img src=\"/favicon.ico\" alt=\"Artwork\" class=\"soundsky-cover-img max-h-24 max-w-24 min-h-24 min-w-24 rounded-lg object-contain mx-auto\" style=\"max-width:96px;max-height:96px;background:#f3f4f6;\" loading=\"lazy\"></div>`;
    }
    // --- Player HTML ---
    let audioPlayerHtml = '';
    if (isLexicon && options && options.lazyWaveformId && displayAudioBlob) {
        audioPlayerHtml = `
          <div class=\"flex items-center gap-2 mt-3 audioplayerbox\">${artworkHtml}
            <button class=\"wavesurfer-play-btn soundsky-play-btn\" data-waveid=\"${options.lazyWaveformId}\" data-post-uri=\"${post.uri}\" data-did=\"${did}\" data-soundskyid=\"${soundskyRkey ? soundskyRkey : ''}\" data-lexicon=\"true\">\n          <svg class=\"wavesurfer-play-icon\" width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\">\n            <circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#3b82f6\"/>\n            <polygon class=\"play-shape\" points=\"11,9 21,14 11,19\" fill=\"white\"/>\n          </svg>\n        </button>\n        <div id=\"${options.lazyWaveformId}\" class=\"wavesurfer waveform flex-1 h-12 relative soundsky-waveform-placeholder\">\n          <div class=\"soundsky-placeholder-content\">
            <i class=\"fa fa-chart-simple\"></i>\n            <span>play to load</span>\n          </div>\n        </div>\n      </div>\n    `;
    } else if (audioHtml) {
        audioPlayerHtml = `${artworkHtml}${audioHtml}`;
    } else if (options && options.lazyWaveformId) {
        audioPlayerHtml = `
          <div class=\"flex items-center gap-2 mt-3 audioplayerbox\">${artworkHtml}
            <button class=\"wavesurfer-play-btn soundsky-play-btn\" data-waveid=\"${options.lazyWaveformId}\" data-post-uri=\"${post.uri}\">\n              <svg class=\"wavesurfer-play-icon\" width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\">\n                <circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#3b82f6\"/>\n                <polygon class=\"play-shape\" points=\"11,9 21,14 11,19\" fill=\"white\"/>\n              </svg>\n                                    </button>\n            <div id=\"${options.lazyWaveformId}\" class=\"wavesurfer waveform flex-1 h-12 relative soundsky-waveform-placeholder\">\n              <div class=\"soundsky-placeholder-content\">\n                <i class=\"fa fa-chart-simple\"></i>\n                <span>play to load</span>\n                </div>\n            </div>\n        </div>\n    `;
    }
    // --- Title Row ---
    let titleRowHtml = '';
    if (isLexicon) {
        if (displayArtist && displayTitle) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayArtist}: <span class=\"font-normal\">${displayTitle}</span></a>`;
        } else if (displayTitle) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayTitle}</a>`;
        } else if (displayArtist) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayArtist}</a>`;
        }
    } else {
        if (displayTitle || displayArtist) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayTitle}${displayArtist ? ' <span class=\"text-gray-500 font-normal\">by ' + displayArtist + '</span>' : ''}</a>`;
        }
    }
    // --- Social Buttons ---
    const likeCount = post.likeCount || 0;
    const liked = post.viewer && post.viewer.like;
    const reposted = post.viewer && post.viewer.repost;
    const repostCount = post.repostCount || 0;
    const commentCount = post.replyCount || 0;
    const likeBtnHtml = `<button class=\"like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}\" data-uri=\"${post.uri}\" data-cid=\"${post.cid}\" data-liked=\"${!!liked}\" data-likeuri=\"${liked ? liked : ''}\"><i class=\"${liked ? 'fas' : 'far'} fa-heart\"></i><span>${likeCount}</span></button>`;
    const repostBtnHtml = `<button class=\"repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}\" data-uri=\"${post.uri}\" data-cid=\"${post.cid}\" data-reposted=\"${!!reposted}\" data-reposturi=\"${reposted ? reposted : ''}\"><i class=\"fa fa-retweet\"></i><span>${repostCount}</span></button>`;
    const commentBtnHtml = `<button class=\"comment-post-btn flex items-center space-x-1 text-sm text-gray-500 hover:text-purple-500\" data-post-uri=\"${post.uri}\"><i class=\"fa fa-comment\"></i><span>${commentCount}</span></button>`;
    // --- Share button for embed link ---
    // Always use the Bluesky post URI for the embed link, even for lexicon posts
    const embedUrl = `/embed/?url=${encodeURIComponent(post.uri)}`;
    const shareBtnHtml = `<button class=\"share-post-btn flex items-center space-x-1 text-sm text-gray-400 hover:text-blue-500\" data-shareurl=\"${embedUrl}\" title=\"Copy embed link\"><i class=\"fa fa-share-nodes\"></i></button>`;
    // --- FIX: Correct debug button URL for atproto-browser ---
    let debugUrl = '';
    // Prefer lexicon record if available
    let soundskyRkeyFinal = null;
    const tags = post.record && post.record.tags;
    if (tags && Array.isArray(tags)) {
        for (const tag of tags) {
            if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                soundskyRkeyFinal = tag.split('=')[1];
                break;
            }
        }
    }
    if (soundskyRkeyFinal) {
        debugUrl = `https://www.atproto-browser.dev/at/${user.did}/cloud.soundsky.audio/${soundskyRkeyFinal}`;
    } else {
        // Fallback: link to the Bluesky post
        const uriParts = String(post.uri).replace('at://', '').split('/');
        if (uriParts.length === 3) {
            const did = uriParts[0];
            const collection = uriParts[1];
            const rkey = uriParts[2];
            debugUrl = `https://www.atproto-browser.dev/at/${did}/${collection}/${rkey}`;
        }
    }
    const debugBtnHtml = `<a href="${debugUrl}" target="_blank" class="ml-2 text-gray-400 hover:text-red-500" title="Debug in atproto-browser"><i class="fa fa-bug"></i></a>`;
    let deleteBtnHtml = '';
    if (agent && agent.session && agent.session.did && user.did === agent.session.did) {
        deleteBtnHtml = `<button class=\"delete-post-btn flex items-center space-x-1 text-sm text-red-500 hover:text-red-700\" data-uri=\"${post.uri}\" title=\"Delete post\"><i class=\"fa fa-trash\"></i></button>`;
    }
    // --- Play Counter UI ---
    let playCounterHtml = '';
    if (isLexicon) {
        playCounterHtml = `<div class=\"soundsky-playcount-row flex items-center text-gray-700 mr-3\"><i class=\"fa fa-play\"></i><span class=\"ml-1\">${playCount}</span></div>`;
    } else {
        playCounterHtml = `<img src=\"https://counterapi.com/counter.svg?key=${post.cid}&action=play&ns=soundskycloud&color=ff0000&label=Plays&readOnly=false\" class=\"mr-3\">`;
    }
    // --- Render ---
    return `
        <div class=\"bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out\" data-post-uri=\"${String(post.uri)}\">\n            <div class=\"p-4\">\n                <div class=\"flex items-start\">\n                    <img class=\"h-10 w-10 rounded-full\" src=\"${avatar}\" alt=\"${user.handle}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\">\n                    <div class=\"ml-3 flex-1\">
                        <div class=\"flex items-center\">\n                            <button class=\"artist-link font-medium text-gray-900 dark:text-gray-100 hover:underline\" data-did=\"${did}\">${user.displayName || user.handle || 'Unknown'}</button>\n                            <span class=\"mx-1 text-gray-500 dark:text-gray-400\">·</span>\n                            <span class=\"text-sm text-gray-500 dark:text-gray-400\">${formatRelativeTime(post.indexedAt)}</span>\n                        </div>\n                        ${titleRowHtml}\n                        ${audioPlayerHtml}\n                        <div class=\"mt-3 flex items-center space-x-3\">\n                            ${playCounterHtml}\n                            ${likeBtnHtml}\n                            ${repostBtnHtml}\n                            ${commentBtnHtml}\n                            ${shareBtnHtml}\n                            ${debugBtnHtml}\n                            ${deleteBtnHtml}\n                        </div>\n                    </div>\n                </div>\n            </div>\n        </div>\n    `;
}

// --- New: Increment play count for custom lexicon posts ---
async function incrementLexiconPlayCount(post) {
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
        // Ensure stats exists and increment
        if (!record.stats) record.stats = {};
        if (typeof record.stats.plays !== 'number') record.stats.plays = 0;
        record.stats.plays++;
        // Write back the updated record
        await agent.api.com.atproto.repo.putRecord({
            repo: did,
            collection,
            rkey,
            record
        });
        // Update the UI immediately
        const playCountEls = document.querySelectorAll(`[data-post-uri="${post.uri}"] .flex.items-center.text-gray-700 span.ml-1`);
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
function initWaveSurfer(audioWaveformId, audioBlobUrl, blobSize) {
                const container = document.getElementById(audioWaveformId);
    if (!container || !audioBlobUrl) return;
    // Fallback for huge files: use a hidden <audio> element instead of WaveSurfer
    if (blobSize && blobSize > 10 * 1024 * 1024) {
        console.warn('File too large for WaveSurfer, using fallback audio player:', blobSize);
        // Remove any existing fallback audio
        let fallbackAudio = container.querySelector('audio.soundsky-fallback-audio');
        if (fallbackAudio) {
            fallbackAudio.pause();
            fallbackAudio.remove();
        }
        // Create hidden audio element
        fallbackAudio = document.createElement('audio');
        fallbackAudio.className = 'soundsky-fallback-audio';
        fallbackAudio.src = audioBlobUrl;
        fallbackAudio.preload = 'none';
        fallbackAudio.style.display = 'none';
        container.appendChild(fallbackAudio);
        // Setup play/pause logic on play button
        const playBtn = document.querySelector(`button[data-waveid="${audioWaveformId}"]`);
        if (playBtn) {
            const svg = playBtn.querySelector('.wavesurfer-play-icon');
            // Immediately reset the play button to the play icon (not loading)
            svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
            playBtn.onclick = () => {
                // Pause all other players
                document.querySelectorAll('audio.soundsky-fallback-audio').forEach(aud => {
                    if (aud !== fallbackAudio) aud.pause();
                });
                if (fallbackAudio.paused) {
                    fallbackAudio.play();
                    svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                } else {
                    fallbackAudio.pause();
                    svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                }
            };
            fallbackAudio.onended = () => {
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
            };
        }
        container.innerHTML += `<div class="text-xs text-gray-400 mt-2">Waveform unavailable for large files</div>`;
        return;
    }
    if (container && window.WaveSurfer && audioBlobUrl) {
        // Destroy any existing instance for this id before creating a new one
        if (window.soundskyWavesurfers[audioWaveformId]) {
            try { window.soundskyWavesurfers[audioWaveformId].destroy(); } catch {}
            delete window.soundskyWavesurfers[audioWaveformId];
        }
        try {
        // Create canvas for gradients
                    const canvas = document.createElement('canvas');
                    canvas.width = 32; canvas.height = 48;
                    const ctx = canvas.getContext('2d');
        // SoundCloud-style waveform gradient
                    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
                    gradient.addColorStop(0, '#656666');
                    gradient.addColorStop((canvas.height * 0.7) / canvas.height, '#656666');
                    gradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
                    gradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
                    gradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#B1B1B1');
                    gradient.addColorStop(1, '#B1B1B1');
        // Progress gradient
                    const progressGradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
                    progressGradient.addColorStop(0, '#EE772F');
                    progressGradient.addColorStop((canvas.height * 0.7) / canvas.height, '#EB4926');
                    progressGradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
                    progressGradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
                    progressGradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#F6B094');
                    progressGradient.addColorStop(1, '#F6B094');
            // Ensure duration and time overlays exist
            let timeEl = container.querySelector('.wavesurfer-time');
            let durationEl = container.querySelector('.wavesurfer-duration');
            if (!timeEl) {
                timeEl = document.createElement('div');
                timeEl.className = 'wavesurfer-time';
                timeEl.textContent = '0:00';
                container.appendChild(timeEl);
            }
            if (!durationEl) {
                durationEl = document.createElement('div');
                durationEl.className = 'wavesurfer-duration';
                durationEl.textContent = '0:00';
                container.appendChild(durationEl);
            }
                    const wavesurfer = window.WaveSurfer.create({
                        container: `#${audioWaveformId}`,
                        waveColor: gradient,
                        progressColor: progressGradient,
                        height: 48,
                        barWidth: 2,
                        responsive: true,
                        cursorColor: '#3b82f6',
                        backend: 'MediaElement',
                    });
                    wavesurfer.load(audioBlobUrl);
                    window.soundskyWavesurfers[audioWaveformId] = wavesurfer;
                    const playBtn = document.querySelector(`button[data-waveid="${audioWaveformId}"]`);
                    let hasCountedPlay = false;
                    if (playBtn) {
                        const svg = playBtn.querySelector('.wavesurfer-play-icon');
                        playBtn.onclick = () => {
                            Object.entries(window.soundskyWavesurfers).forEach(([id, ws]) => {
                                if (id !== audioWaveformId && ws && ws.isPlaying && ws.isPlaying()) {
                                    ws.pause();
                                }
                            });
                            if (wavesurfer.isPlaying()) {
                                wavesurfer.pause();
                                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                            } else {
                                wavesurfer.play();
                                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                                if (!hasCountedPlay && playBtn._soundskyPost && playBtn._soundskyLexiconRecord) {
                                    incrementLexiconPlayCount({ uri: playBtn._soundskyPost.uri, value: playBtn._soundskyLexiconRecord });
                                    hasCountedPlay = true;
                                }
                            }
                        };
                        wavesurfer.on('finish', () => {
                            svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                        });
                        wavesurfer.on('pause', () => {
                            svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                        });
                        wavesurfer.on('play', () => {
                            svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                        });
                        wavesurfer.on('click', () => {
                          Object.entries(window.soundskyWavesurfers).forEach(([id, ws]) => {
                                if (id !== audioWaveformId && ws && ws.isPlaying && ws.isPlaying()) {
                                    ws.pause();
                                }
                            });
                            if (wavesurfer.isPlaying()) {
                                // wavesurfer.pause();
                            } else {
                                wavesurfer.play();
                                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                            }
            });
                    }
                    const formatTime = (seconds) => {
                        const minutes = Math.floor(seconds / 60);
                        const secondsRemainder = Math.round(seconds) % 60;
                        const paddedSeconds = `0${secondsRemainder}`.slice(-2);
                        return `${minutes}:${paddedSeconds}`;
                    };
                    wavesurfer.on('decode', (duration) => {
                        if (durationEl) durationEl.textContent = formatTime(duration);
                    });
            wavesurfer.on('ready', () => {
                if (durationEl && wavesurfer.getDuration) durationEl.textContent = formatTime(wavesurfer.getDuration());
                    });
                    wavesurfer.on('timeupdate', (currentTime) => {
                        if (timeEl) timeEl.textContent = formatTime(currentTime);
                    });
            let hoverEl = container.querySelector('.wavesurfer-hover');
            if (!hoverEl) {
                hoverEl = document.createElement('div');
                hoverEl.className = 'wavesurfer-hover';
                container.appendChild(hoverEl);
            }
                    container.addEventListener('pointermove', (e) => {
                        if (hoverEl) hoverEl.style.width = `${e.offsetX}px`;
                    });
                    container.addEventListener('pointerenter', () => {
                        if (hoverEl) hoverEl.style.opacity = 1;
                    });
                    container.addEventListener('pointerleave', () => {
                        if (hoverEl) hoverEl.style.opacity = 0;
                    });
        } catch (err) {
            console.error('WaveSurfer initWaveSurfer error:', err);
            if (container) {
                container.innerHTML = '<div class="text-red-500 text-xs mt-2">Audio unavailable or failed to load waveform.</div>';
            }
        }
    }
}

// --- LAZY AUDIO LOAD: Only load audio blob and WaveSurfer on play ---
// Accept blobSize as an argument
function setupLazyWaveSurfer(audioWaveformId, userDid, blobRef, blobSize) {
    const playBtn = document.querySelector(`button[data-waveid="${audioWaveformId}"]`);
    if (!playBtn) return;
    const svg = playBtn.querySelector('.wavesurfer-play-icon');
    let wavesurfer = null;
    let audioLoaded = false;
    let loading = false;
    let hasCountedPlay = false;

    // Fallback for huge files: show message before play, remove it and show <audio> on play
    if (blobSize && blobSize > 10 * 1024 * 1024) {
        const container = document.getElementById(audioWaveformId);
        if (!container) return;
        let fallbackAudio = null;
        let audioInitialized = false; // Track if <audio> has been created
        // Show the message before play
        if (!container.querySelector('.soundsky-largefile-msg')) {
            const msg = document.createElement('div');
            msg.className = 'text-xs text-gray-400 mt-2 soundsky-largefile-msg';
            msg.textContent = 'Waveform unavailable for large files';
            // container.appendChild(msg);
        }
        svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
        playBtn.onclick = async () => {
            // Remove the waveform placeholder if present (only once)
            const placeholder = container.querySelector('.soundsky-placeholder-content');
            if (placeholder) {
                try { container.removeChild(placeholder); } catch (err) { console.warn('Could not remove placeholder', err); }
            }
            // Remove the message (only once)
            const msg = container.querySelector('.soundsky-largefile-msg');
            if (msg) {
                try { container.removeChild(msg); } catch (err) { console.warn('Could not remove message', err); }
            }
            // Only create <audio> once
            if (!audioInitialized) {
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="10">...</text>`;
                let audioBlobUrl = null;
                try {
                    audioBlobUrl = await fetchAudioBlobUrl(userDid, blobRef);
                } catch (e) {
                    svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#e11d48"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="10">!</text>`;
                    return;
                }
                fallbackAudio = document.createElement('audio');
                fallbackAudio.className = 'soundsky-fallback-audio';
                fallbackAudio.src = audioBlobUrl;
                fallbackAudio.preload = 'none';
                fallbackAudio.controls = true;
                fallbackAudio.style.display = 'block';
                fallbackAudio.style.width = '100%';
                container.appendChild(fallbackAudio);
                fallbackAudio.onended = () => {
                    svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                };
                audioInitialized = true;
            }
            // Pause all other players
            document.querySelectorAll('audio.soundsky-fallback-audio').forEach(aud => {
                if (aud !== fallbackAudio) aud.pause();
            });
            // Toggle play/pause only, never hide/remove <audio>
            if (fallbackAudio.paused) {
                fallbackAudio.play();
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
            } else {
                fallbackAudio.pause();
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
            }
        };
        return;
    }

    playBtn.onclick = async () => {
        if (loading) return;
        if (audioLoaded && wavesurfer) {
            Object.entries(window.soundskyWavesurfers).forEach(([id, ws]) => {
                if (id !== audioWaveformId && ws && ws.isPlaying && ws.isPlaying()) {
                    ws.pause();
                }
            });
            if (wavesurfer.isPlaying()) {
                wavesurfer.pause();
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
            } else {
                wavesurfer.play();
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                if (!hasCountedPlay && playBtn._soundskyPost && playBtn._soundskyLexiconRecord) {
                    incrementLexiconPlayCount({ uri: playBtn._soundskyPost.uri, value: playBtn._soundskyLexiconRecord });
                    hasCountedPlay = true;
                }
            }
            return;
        }
        loading = true;
        svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="10">...</text>`;
        let audioBlobUrl = null;
        try {
            audioBlobUrl = await fetchAudioBlobUrl(userDid, blobRef);
        } catch (e) {
            svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#e11d48"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="10">!</text>`;
            loading = false;
            return;
        }
        const container = document.getElementById(audioWaveformId);
        if (container) {
            const placeholder = container.querySelector('.soundsky-placeholder-content');
            if (placeholder) {
                try { container.removeChild(placeholder); } catch (err) { console.warn('Could not remove placeholder', err); }
            }
            container.style.width = '100%';
            container.style.minWidth = '120px';
            container.style.display = 'block';
        }
        if (window.soundskyWavesurfers[audioWaveformId]) {
            try { window.soundskyWavesurfers[audioWaveformId].destroy(); } catch (err) { console.error('WaveSurfer destroy error', err); }
            delete window.soundskyWavesurfers[audioWaveformId];
        }
        setTimeout(() => {
            try {
                initWaveSurfer(audioWaveformId, audioBlobUrl, blobSize);
                wavesurfer = window.soundskyWavesurfers[audioWaveformId];
                audioLoaded = true;
                loading = false;
                if (wavesurfer) {
                    Object.entries(window.soundskyWavesurfers).forEach(([id, ws]) => {
                        if (id !== audioWaveformId && ws && ws.isPlaying && ws.isPlaying()) {
                            ws.pause();
                        }
                    });
                    wavesurfer.play();
                    svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                    if (!hasCountedPlay && playBtn._soundskyPost && playBtn._soundskyLexiconRecord) {
                        incrementLexiconPlayCount({ uri: playBtn._soundskyPost.uri, value: playBtn._soundskyLexiconRecord });
                        hasCountedPlay = true;
                    }
                }
            } catch (err) {
                console.error('WaveSurfer init error', err);
                svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#e11d48"/><text x="14" y="18" text-anchor="middle" fill="white" font-size="10">!</text>`;
                loading = false;
            }
        }, 0);
    };
}

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
      min-height: 48px;
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
        const res = await agent.api.app.bsky.feed.getActorLikes({ actor: agent.session.did, limit: 100 });
        likedPosts = filterAudioPosts(res.data?.feed || []);
    } catch (e) {
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
    // Lexicon-aware: fetch all lexicon records in parallel
    const postCards = await Promise.all(likedPosts.map(async item => {
        const post = item.post || item;
        const user = post.author;
        let embed = post.record && post.record.embed;
        let tags = post.record && post.record.tags;
        let soundskyRkey = null;
        let playCount = null;
        if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
                if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                    soundskyRkey = tag.split('=')[1];
                    break;
                }
            }
        }
        let lexiconRecord = null;
        if (soundskyRkey) {
            try {
                const did = user.did;
                const lexRes = await fetchSoundSkyRecord(agent, { did, rkey: soundskyRkey });
                if (lexRes.success && lexRes.record) {
                    lexiconRecord = lexRes.record;
                    playCount = await getLexiconPlayCount({ post });
                }
            } catch (err) {
                lexiconRecord = null;
            }
        }
        // --- Artwork ---
        let coverUrl = '';
        if (lexiconRecord && lexiconRecord.artwork && lexiconRecord.artwork.ref) {
            const blobRef = lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.toString ? lexiconRecord.artwork.ref.toString() : lexiconRecord.artwork.ref;
            coverUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
        } else {
            // Legacy artwork logic
            let images = [];
            let soundskyImgId = null;
            if (tags && Array.isArray(tags)) {
                for (const tag of tags) {
                    if (typeof tag === 'string' && tag.startsWith('soundskyimg=')) {
                        soundskyImgId = tag.split('=')[1];
                        break;
                    }
                }
            }
            if (soundskyImgId) {
                coverUrl = `https://i.imgur.com/${soundskyImgId}.png`;
            } else {
                if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
                    images = embed.media.images;
                } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
                    images = embed.images;
                }
                if (images.length > 0) {
                    const img = images[0];
                    if (img.image && img.image.ref) {
                        const blobRef = img.image.ref && img.image.ref.toString ? img.image.ref.toString() : img.image.ref;
                        coverUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
                    }
                }
            }
        }
        // --- Title and Artist ---
        let title = '';
        let artist = '';
        if (lexiconRecord && lexiconRecord.metadata) {
            title = lexiconRecord.metadata.title || '';
            artist = lexiconRecord.metadata.artist || '';
        } else {
            title = (post.record?.text || '').split('\n')[0].slice(0, 40) || 'Untitled';
            artist = user.displayName || user.handle || '';
        }
        // --- Audio ---
        let playBtnHtml = '';
        if (lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref) {
            const blobRef = lexiconRecord.audio.ref && lexiconRecord.audio.ref.toString ? lexiconRecord.audio.ref.toString() : lexiconRecord.audio.ref;
            playBtnHtml = `<button class="album-cover-btn" data-did="${user.did}" data-blob="${blobRef}" title="Play">
                ${coverUrl ? `<img src="${coverUrl}" alt="cover" class="album-cover-img" loading="lazy" onerror="this.onerror=null;this.src='/favicon.ico';">` : `<img src="/favicon.ico" alt="cover" class="album-cover-img" loading="lazy">`}
                <div class="album-cover-overlay"><i class="fas fa-play album-play-icon"></i></div>
            </button>`;
        } else {
            // Legacy audio logic
            const fileEmbed = (embed && embed.$type === 'app.bsky.embed.file') ? embed : (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file' ? embed.media : null);
            if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
                const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
                playBtnHtml = `<button class="album-cover-btn" data-did="${user.did}" data-blob="${blobRef}" title="Play">
                    ${coverUrl ? `<img src="${coverUrl}" alt="cover" class="album-cover-img" loading="lazy" onerror="this.onerror=null;this.src='/favicon.ico';">` : `<img src="/favicon.ico" alt="cover" class="album-cover-img" loading="lazy">`}
                    <div class="album-cover-overlay"><i class="fas fa-play album-play-icon"></i></div>
                </button>`;
            } else {
                playBtnHtml = coverUrl ? `<img src="${coverUrl}" alt="cover" class="album-cover-img" loading="lazy" onerror="this.onerror=null;this.src='/favicon.ico';">` : `<img src="/favicon.ico" alt="cover" class="album-cover-img" loading="lazy">`;
            }
        }
        // --- Play Count (for lexicon posts) ---
        let playCountHtml = '';
        if (typeof playCount === 'number') {
            playCountHtml = `<div class="album-playcount text-xs text-gray-400 mt-1">Plays: ${playCount}</div>`;
        }
        return `<div class="album-tile">
            ${playBtnHtml}
            <div class="album-title-row">
                <a href="#" class="album-title-link" data-post-uri="${post.uri}">${title || 'Untitled'}</a>
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
            } catch (e) { btn.classList.remove('playing'); if (overlayIcon) { overlayIcon.classList.remove('fa-pause'); overlayIcon.classList.add('fa-play'); } return; }
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

// --- Notification Support ---
let latestNotifications = [];
let hasNewNotifications = false;
let lastSeenNotifs = null;

async function fetchNotifications() {
    if (!agent || !agent.session) return;
    try {
        const res = await agent.api.app.bsky.notification.listNotifications({ limit: 20 });
        latestNotifications = res.data.notifications || [];
        // Find if there are any unread notifications
        hasNewNotifications = latestNotifications.some(n => !n.isRead);
        // Update bell icon
        updateNotificationBell();
        // Render dropdown if open
        renderNotificationDropdown();
    } catch (e) {
        // fallback: show error in dropdown
        latestNotifications = [];
        hasNewNotifications = false;
        updateNotificationBell();
        renderNotificationDropdown('Failed to load notifications');
    }
}

function updateNotificationBell() {
    const bell = document.getElementById('notification-bell');
    if (!bell) return;
    if (hasNewNotifications) {
        bell.classList.add('text-orange-500');
    } else {
        bell.classList.remove('text-orange-500');
    }
}

function renderNotificationDropdown(errorMsg) {
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    if (errorMsg) {
        dropdown.innerHTML = `<div class='p-3 text-sm text-red-500'>${errorMsg}</div>`;
        return;
    }
    if (!latestNotifications.length) {
        dropdown.innerHTML = `<div class='p-3 text-sm text-gray-500'>No notifications yet.</div>`;
        return;
    }
    dropdown.innerHTML = latestNotifications.map(n => {
        const actor = n.author || {};
        const avatar = actor.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${actor.did || ''}/@jpeg`;
        const name = actor.displayName || actor.handle || 'Unknown';
        let reason = n.reason;
        let reasonText = '';
        let songTitle = '';
        let postUri = '';
        // Try to extract song title and post URI for all types
        if (n.subject && n.subject.record && typeof n.subject.record.text === 'string') {
            songTitle = n.subject.record.text.split('\n')[0].slice(0, 60);
        }
        if (n.subject && n.subject.uri) {
            postUri = n.subject.uri;
        } else if (n.record && n.record.subject && n.record.subject.uri) {
            postUri = n.record.subject.uri;
        }
        // Compose reason text
        if (['like','repost','reply','mention'].includes(reason)) {
            reasonText = songTitle ? `${reason === 'like' ? 'liked' : reason === 'repost' ? 'reposted' : reason === 'reply' ? 'replied to' : 'mentioned you in'} \"${songTitle}\"` : `${reason === 'like' ? 'liked' : reason === 'repost' ? 'reposted' : reason === 'reply' ? 'replied to' : 'mentioned you in'} your post`;
        } else if (reason === 'follow') {
            reasonText = 'followed you';
        } else {
            reasonText = reason;
        }
        // Show a snippet of the post text if available
        let postText = '';
        if (n.subject && n.subject.record && typeof n.subject.record.text === 'string') {
            postText = n.subject.record.text.slice(0, 80);
        } else if (n.record && n.record.text && reason === 'follow') {
            postText = '';
        } else if (n.record && n.record.text) {
            postText = n.record.text.slice(0, 80);
        }
        let time = '';
        if (n.indexedAt) time = formatRelativeTime(n.indexedAt);
        // Make row clickable if postUri exists
        const rowAttrs = postUri ? `class='notification-row cursor-pointer flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 ${n.isRead ? '' : 'bg-orange-50 dark:bg-orange-900'}' data-post-uri='${postUri}'` : `class='flex items-start gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700 ${n.isRead ? '' : 'bg-orange-50 dark:bg-orange-900'}'`;
        return `<div ${rowAttrs}>
            <img src='${avatar}' class='h-8 w-8 rounded-full' alt='${name}' onerror="this.onerror=null;this.src='/favicon.ico';">
            <div class='flex-1 min-w-0'>
                <div class='font-medium text-gray-900 dark:text-gray-100 text-sm'>${name} <span class='text-gray-500 font-normal'>${reasonText}</span></div>
                ${postText ? `<div class='text-xs text-gray-500 truncate'>${postText}</div>` : ''}
                <div class='text-xs text-gray-400 mt-1'>${time}</div>
            </div>
        </div>`;
    }).join('');
    // Attach click handler robustly
    setTimeout(() => {
        document.querySelectorAll('.notification-row').forEach(row => {
            row.onclick = async function(e) {
                const postUri = row.getAttribute('data-post-uri');
                if (postUri) {
                    // Always resolve to root/top post
                    try {
                        const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: postUri });
                        const rootUri = getRootPostUriFromThread(threadRes.data.thread);
                        if (rootUri) {
                            setPostParamInUrl(rootUri);
                            renderSinglePostView(rootUri);
                        } else {
                            setPostParamInUrl(postUri);
                            renderSinglePostView(postUri);
                        }
                    } catch (err) {
                        setPostParamInUrl(postUri);
                        renderSinglePostView(postUri);
                    }
                    dropdown.classList.add('hidden');
                }
            };
        });
    }, 0);
}

// Show/hide dropdown
function setupNotificationDropdown() {
    const btn = document.getElementById('notification-btn');
    const dropdown = document.getElementById('notification-dropdown');
    if (!btn || !dropdown) return;
    let open = false;
    btn.onclick = async function(e) {
        e.stopPropagation();
        open = !open;
        if (open) {
            dropdown.classList.remove('hidden');
            await fetchNotifications();
            // Mark as seen
            markNotificationsSeen();
        } else {
            dropdown.classList.add('hidden');
        }
    };
    // Hide dropdown on outside click
    document.addEventListener('click', function(e) {
        if (!dropdown.classList.contains('hidden')) {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
                open = false;
            }
        }
    });
}

async function markNotificationsSeen() {
    try {
        await agent.api.app.bsky.notification.updateSeen({ seenAt: new Date().toISOString() });
        hasNewNotifications = false;
        updateNotificationBell();
    } catch (e) {}
}

// Fetch notifications on navigation (after each link click)
function setupNotificationNavRefresh() {
    // Listen for navigation events (sidebar/topnav/artist/title links)
    const navIds = ['nav-feed', 'nav-discover', 'nav-likes', 'topnav-feed', 'topnav-discover'];
    navIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('click', () => {
                setTimeout(fetchNotifications, 500);
            });
        }
    });
    // Also refresh on artist/title link clicks in album grid
    document.addEventListener('click', function(e) {
        if (e.target && (e.target.classList.contains('album-title-link') || e.target.classList.contains('album-artist-link'))) {
            setTimeout(fetchNotifications, 500);
        }
    });
}

// --- Helper: Fetch the latest lexicon record for a given did and rkey ---
async function getLatestLexiconRecord(agent, did, rkey, fallbackRecord = null) {
    try {
        const res = await agent.api.com.atproto.repo.getRecord({
            repo: did,
            collection: 'cloud.soundsky.audio',
            rkey
        });
        return res.data.value;
    } catch (e) {
        return fallbackRecord;
    }
}

// --- Patch notification click handler to always load root/top post ---
function getRootPostUriFromThread(thread) {
    // Recursively walk up to the root
    let node = thread;
    while (node && node.parent) {
        node = node.parent;
    }
    return node && node.post ? node.post.uri : (node && node.uri ? node.uri : null);
}

// --- Add/Update CSS for responsive comments ---
if (!document.getElementById('soundsky-comment-bubble-style')) {
    const style = document.createElement('style');
    style.id = 'soundsky-comment-bubble-style';
    style.textContent = `
    #feed [id^='comments-'], #single-post-content [id^='comments-'] {
      overflow-x: auto;
      position: relative;
      max-width: 100%;
      word-break: break-word;
    }
    .soundsky-comment-bubble {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      border-left: 2.5px solid #3b82f6;
      border-radius: 8px;
      margin-bottom: 0.2rem;
      padding: 0.5rem 0.7rem 0.5rem 0.7rem;
      display: block;
      background: inherit;
    }
    .soundsky-comment-bubble .flex-1 {
      min-width: 0;
      word-break: break-word;
    }
    .soundsky-comment-bubble p {
      margin: 0.1rem 0 0 0;
      word-break: break-word;
    }
    @media (max-width: 600px) {
      .soundsky-comment-bubble {
        padding: 0.4rem 0.3rem 0.4rem 0.5rem;
        border-radius: 6px;
      }
    }
    `;
    document.head.appendChild(style);
}
