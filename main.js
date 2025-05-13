import { BskyAgent } from 'https://esm.sh/@atproto/api';

// Change agent to let, not const
let agent = null;

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const feedContainer = document.getElementById('feed');
const feedLoading = document.getElementById('feed-loading');

const defaultAvatar = '/default-avatar.png';

// Immediately hide the upload box if present
const uploadForm = document.getElementById('create-audio-post');
if (uploadForm) uploadForm.style.display = 'none';

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
            const postParam = getPostParamFromUrl();
            const artistParam = getArtistParamFromUrl();
            if (postParam) {
                renderSinglePostView(postParam);
            } else if (artistParam) {
                renderArtistPage(artistParam);
            } else {
                setActiveNav('nav-discover');
                fetchSoundskyFeed({ mode: 'discover' });
            }
        } catch (e) {
            localStorage.removeItem('bskySession');
            loginForm.style.display = 'flex';
        }
    } else {
        loginForm.style.display = 'flex';
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
    } catch (e) {
        loginError.textContent = 'Login failed: ' + (e.message || e);
        loginError.classList.remove('hidden');
        loginBtn.disabled = false;
        loginBtn.textContent = 'Login';
        loginForm.style.display = 'flex';
    }
});

// Add logout button logic
const topNav = document.querySelector('.flex.items-center.space-x-4') || document.getElementById('top-nav-actions');
if (topNav) {
    // Upload button
    const uploadBtn = document.createElement('button');
    uploadBtn.textContent = 'Upload';
    uploadBtn.className = 'ml-2 px-3 py-1 text-xs text-blue-600 rounded hover:bg-blue-50';
    uploadBtn.onclick = () => {
        const uploadForm = document.getElementById('create-audio-post');
        // Only toggle if not in single post mode
        const postParam = typeof getPostParamFromUrl === 'function' ? getPostParamFromUrl() : null;
        if (uploadForm && !postParam) {
            if (uploadForm.style.display === 'none' || uploadForm.style.display === '') {
                uploadForm.style.display = 'block';
            } else {
                uploadForm.style.display = 'none';
            }
        }
    };
    topNav.appendChild(uploadBtn);

    const logoutBtn = document.createElement('button');
    // logoutBtn.textContent = 'Logout';
    const iconLogout = document.createElement('i');
    iconLogout.className = 'fas fa-sign-out-alt'; // Font Awesome class for "logout" icon
    logoutBtn.appendChild(iconLogout);
    logoutBtn.className = 'ml-2 px-3 py-1 text-xs text-gray-600 rounded hover:bg-gray-100';
    logoutBtn.onclick = () => {
        localStorage.removeItem('bskySession');
        loginForm.style.display = 'flex';
        window.location.reload();
    };
    topNav.appendChild(logoutBtn);

    // Add volume button and slider to the top bar
    // Volume button and slider container
    const volumeContainer = document.createElement('div');
    volumeContainer.className = 'relative flex items-center';
    // Volume button
    const volumeBtn = document.createElement('button');
    const iconVolume = document.createElement('i');
    iconVolume.className = 'fas fa-volume-high'; // Font Awesome class for "logout" icon
    volumeBtn.appendChild(iconVolume);
    // volumeBtn.innerHTML = `<svg width="20" height="20" fill="none" viewBox="0 0 20 20"><path d="M3 8v4h4l5 5V3L7 8H3z" fill="currentColor"/></svg>`;
    volumeBtn.className = 'ml-2 px-2 py-1 text-xs text-gray-600 rounded hover:bg-gray-100';
    // Volume slider (vertical, hidden by default)
    const volumeSlider = document.createElement('input');
    volumeSlider.type = 'range';
    volumeSlider.min = '0';
    volumeSlider.max = '1';
    volumeSlider.step = '0.01';
    volumeSlider.className = 'absolute left-1/2 -translate-x-1/2 w-8 h-32 bg-gray-200 rounded-lg appearance-none cursor-pointer hidden z-50 volume-slider';
    volumeSlider.style.top = '100%';
    volumeSlider.style.width = '12px';
    volumeSlider.style.bottom = 'auto';
    volumeSlider.style.display = 'none';
    volumeSlider.style.marginTop = '0.5rem';
    volumeSlider.style.writingMode = 'vertical-lr';
    volumeSlider.style.transform = 'translateX(-50%) rotate(180deg)';
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
        if (!volumeContainer.contains(e.target)) {
            volumeSlider.classList.add('hidden');
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
    // Add to topNav
    volumeContainer.appendChild(volumeBtn);
    volumeContainer.appendChild(volumeSlider);
    topNav.appendChild(volumeContainer);
}

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
    document.querySelectorAll('#nav-feed, #nav-discover').forEach(el => {
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
    setActiveNav('nav-likes');
    navLikes.classList.add('opacity-50', 'cursor-not-allowed');
    fetchSoundskyFeed({ mode: 'likes' });
};

// --- Utility: Fetch audio blob URL with CORS fallback ---
async function fetchAudioBlobUrl(userDid, blobRef) {
    const blobUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
    let resp = await fetch(blobUrl);
    if (!resp.ok) {
        const corsProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(blobUrl);
        resp = await fetch(corsProxyUrl);
    }
    if (!resp.ok) throw new Error('Blob fetch failed');
    const audioBlob = await resp.blob();
    return URL.createObjectURL(audioBlob);
}

// Global flag to cancel feed loading
let _soundskyFeedCancelled = false;

// Helper: attach click handler to .post-title-link buttons
function attachPostTitleLinkHandlers() {
    document.querySelectorAll('.post-title-link').forEach(title => {
        if (!title._soundskyHandlerAttached) {
            title.addEventListener('click', function(e) {
                e.preventDefault();
                // Cancel feed loading/appending
                _soundskyFeedCancelled = true;
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
}

// Helper: progressively append a single audio post card
let _soundskyFirstCardAppended = false;
async function appendAudioPostCard(audioPost) {
    // If feed loading was cancelled, do not append further cards
    if (_soundskyFeedCancelled) return;
    const post = audioPost.post || audioPost;
    const user = post.author;
    let audioHtml = '';
    let audioBlobUrl = null;
    let audioWaveformId = `waveform-${post.cid}`;
    let fileEmbed = null;
    const embed = post.record && post.record.embed;
    if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
    else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;

    // --- Artwork logic (copied from renderPostCard) ---
    let artworkUrl = '';
    let images = [];
    if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
        images = embed.media.images;
    } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
        images = embed.images;
    }
    const facets = post.record && post.record.facets;
    if (facets && Array.isArray(facets)) {
        for (const facet of facets) {
            if (facet.features && Array.isArray(facet.features)) {
                for (const feature of facet.features) {
                    if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
                        if (feature.uri.match(/\.(png|jpe?g|gif)$/i)) {
                            artworkUrl = `<img src="${feature.uri}" style="max-height: 48px;"/>`;
                        }
                    }
                }
            }
        }
    }
    if (images.length > 0) {
        const img = images[0];
        let imgUrl = '';
        if (img.image && img.image.ref) {
            const blobRef = img.image.ref && img.image.ref.toString ? img.image.ref.toString() : img.image.ref;
            const userDid = user.did;
            imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
        }
        artworkUrl = `<img src="${imgUrl}"/>`;
    }

    // --- Audio HTML ---
    if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
        const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
        try {
            audioBlobUrl = await fetchAudioBlobUrl(user.did, blobRef);
        } catch (e) {
            audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
        }
        if (audioBlobUrl && audioWaveformId) {
            audioHtml = `
              <div class="flex items-center gap-2 mt-3 audioplayerbox">
                <!--IMG-FEED-->
                <button class="wavesurfer-play-btn soundsky-play-btn" data-waveid="${audioWaveformId}">
                  <svg class="wavesurfer-play-icon" width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="14" fill="#3b82f6"/>
                    <polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>
                  </svg>
                </button>
                <div id="${audioWaveformId}" class="wavesurfer waveform flex-1 h-12 relative">
                  <div class="wavesurfer-time">0:00</div>
                  <div class="wavesurfer-duration">0:00</div>
                  <div class="wavesurfer-hover"></div>
                </div>
              </div>
            `;
            // Inject artwork
            audioHtml = audioHtml.replace('<!--IMG-FEED-->', artworkUrl);
        }
    }

    const cardHtml = renderPostCard({ post, user, audioHtml });
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHtml;
    feedContainer.appendChild(tempDiv.firstElementChild);

    // Hide feedLoading as soon as the first card is appended
    if (!_soundskyFirstCardAppended) {
        feedLoading.classList.add('hidden');
        _soundskyFirstCardAppended = true;
    }

    // Initialize WaveSurfer for this card
    if (audioBlobUrl && audioWaveformId) {
        setTimeout(() => initWaveSurfer(audioWaveformId, audioBlobUrl), 0);
    }
    // Attach post-title-link click handler for this card
    attachPostTitleLinkHandlers();
}

// Update fetchSoundskyFeed to render each card as soon as it's ready
async function fetchSoundskyFeed({ append = false, mode = 'home' } = {}) {
    feedLoading.classList.remove('hidden');
    if (!append) {
        feedContainer.innerHTML = '';
        loadedAudioPosts = [];
        nextCursor = null;
    }
    // Reset the first card flag and cancel flag
    _soundskyFirstCardAppended = false;
    _soundskyFeedCancelled = false;
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
                    await appendAudioPostCard(audioPost);
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
    // Clean up existing WaveSurfer instances
    if (window.soundskyWavesurfers) {
        Object.values(window.soundskyWavesurfers).forEach(ws => {
            try { ws.destroy(); } catch {}
        });
        window.soundskyWavesurfers = {};
    }
    // Only render posts with audio content
    const audioPosts = filterAudioPosts(posts);
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
    // Store info for initializing WaveSurfer after DOM update
    const wavesurferInitQueue = [];
    let html = '';
    for (const item of audioPosts) {
        const post = item.post || item; // support both timeline and search result
        const user = post.author;
        let audioHtml = '';
        let audioBlobUrl = null;
        let audioWaveformId = `waveform-${post.cid}`;
        let fileEmbed = null;
        const embed = post.record && post.record.embed;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
            const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
            try {
                audioBlobUrl = await fetchAudioBlobUrl(user.did, blobRef);
            } catch (e) {
                audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
            }
            if (audioBlobUrl && audioWaveformId) {
                audioHtml = `
                  <div class="flex items-center gap-2 mt-3 audioplayerbox">
                    <!--IMG-FEED-->
                    <button class="wavesurfer-play-btn soundsky-play-btn" data-waveid="${audioWaveformId}">
                      <svg class="wavesurfer-play-icon" width="28" height="28" viewBox="0 0 28 28" fill="none">
                        <circle cx="14" cy="14" r="14" fill="#3b82f6"/>
                        <polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>
                      </svg>
                    </button>
                    <div id="${audioWaveformId}" class="wavesurfer waveform flex-1 h-12 relative">
                      <div class="wavesurfer-time">0:00</div>
                      <div class="wavesurfer-duration">0:00</div>
                      <div class="wavesurfer-hover"></div>
                    </div>
                  </div>
                `;
                wavesurferInitQueue.push({ audioWaveformId, audioBlobUrl });
            }
        }
        html += renderPostCard({ post, user, audioHtml });
    }
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
    addSinglePostClickHandlers();
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
    artworkLabel.innerHTML = '<i class="fa fa-image mr-1"></i>Choose Artwork...';
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
    // JS: update file name on change
    /*
    artworkInput.addEventListener('change', () => {
        artworkFileName.textContent = artworkInput.files[0]?.name || 'No file chosen';
    });
    */
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

            let embed = null;
            let text = audioCaptionInput.value || '';
            let facets = [];

            // If artwork is present, upload to Imgur and get the URL
            let artworkUrl = null;
            if (artworkFile) {
                // Only allow image types
                if (!['image/png', 'image/jpeg', 'image/gif'].includes(artworkFile.type)) {
                    throw new Error('Artwork must be PNG, JPG, or GIF.');
                }
                // Upload to Imgur using FormData (binary)
                const formData = new FormData();
                formData.append('image', artworkFile);
                const imgurRes = await fetch('https://api.imgur.com/3/image', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Client-ID f0ec4a3ff4491b6',
                        // Do NOT set Content-Type here!
                    },
                    body: formData,
                });
                const imgurData = await imgurRes.json();
                if (!imgurData.success || !imgurData.data || !imgurData.data.link) {
                    throw new Error('Failed to upload artwork to Imgur.');
                }
                artworkUrl = imgurData.data.link;
                // Add the image URL to the post text (on a new line)
                text = text ? (text + '\n' + artworkUrl) : artworkUrl;
                // Add a richtext facet for the image URL
                facets.push({
                    index: {
                        byteStart: text.lastIndexOf(artworkUrl),
                        byteEnd: text.lastIndexOf(artworkUrl) + artworkUrl.length,
                    },
                    features: [
                        {
                            $type: 'app.bsky.richtext.facet#link',
                            uri: artworkUrl,
                        },
                    ],
                });
            }

            if (file) {
                // Audio upload (primary, as before)
                if (file.type !== 'audio/mpeg' && !file.name.endsWith('.mp3')) {
                    throw new Error('Only MP3 files are supported.');
                }
                const blobRes = await agent.uploadBlob(file, file.type);
                const audioBlob = blobRes.data.blob;
                embed = {
                    $type: 'app.bsky.embed.file',
                    file: audioBlob,
                    mimeType: file.type,
                };
            } else if (!artworkUrl) {
                throw new Error('Please select an audio file or artwork image.');
            }

            const postRes = await agent.post({ text, embed, tags: ['soundskyaudio'], facets: facets.length ? facets : undefined });
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
    window.history.replaceState({}, '', url);
}

async function renderSinglePostView(postUri) {
    feedContainer.style.display = '';
    feedLoading.classList.add('hidden');
    // Hide upload form in single mode
    const uploadForm = document.getElementById('create-audio-post');
    if (uploadForm) uploadForm.style.display = 'none';
    // Remove modal/blur logic, render in feed container
    document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
    // Stop and destroy any existing WaveSurfer instances
    if (window.soundskyWavesurfers) {
        Object.values(window.soundskyWavesurfers).forEach(ws => { try { ws.destroy(); } catch {} });
        window.soundskyWavesurfers = {};
    }
    // Clear feed and render single post
    feedContainer.innerHTML = `<div id='single-post-content'></div>`;
    // Fetch post thread
    let postData;
    try {
        const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: postUri });
        postData = threadRes.data.thread && threadRes.data.thread.post ? threadRes.data.thread : threadRes.data.thread;
    } catch (err) {
        document.getElementById('single-post-content').innerHTML = `<div class='text-red-500'>Failed to load post.</div>`;
        return;
    }
    // Render post using a modified version of the feed renderer (single post, full width)
    const post = postData.post || postData;
    const user = post.author;
    const text = post.record.text || '';
    const did = user.did;
    let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
    const displayName = user.displayName || user.handle || 'Unknown';
    const time = formatRelativeTime(post.indexedAt);
    let audioHtml = '';
    let audioBlobUrl = null;
    let audioWaveformId = `waveform-single-${post.cid}`;
    let fileEmbed = null;
    const embed = post.record && post.record.embed;
    if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
    else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
    if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
        const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
        const mimeType = fileEmbed.file.mimeType;
        try {
            audioBlobUrl = await fetchAudioBlobUrl(user.did, blobRef);
        } catch (e) {
            audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
        }
        if (audioBlobUrl && audioWaveformId) {
            audioHtml = `<!--IMG-ARTIST-->
              <div class="flex items-center gap-2 mt-3">
              <!--IMG-FEED-->
                <button class="wavesurfer-play-btn soundsky-play-btn" data-waveid="${audioWaveformId}">
                  <svg class="wavesurfer-play-icon" width="28" height="28" viewBox="0 0 28 28" fill="none">
                    <circle cx="14" cy="14" r="14" fill="#3b82f6"/>
                    <polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>
                  </svg>
                </button>
                <div id="${audioWaveformId}" class="wavesurfer waveform flex-1 h-12 relative">
                  <div class="wavesurfer-time">0:00</div>
                  <div class="wavesurfer-duration">0:00</div>
                  <div class="wavesurfer-hover"></div>
                </div>
              </div>
            `;
        }
    }
    // Like, repost, delete, follow buttons (reuse logic)
    let deleteBtnHtml = '';
    if (agent.session && agent.session.did === user.did) {
        deleteBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-post-btn" data-uri="${String(post.uri)}">Delete</button>`;
    }
    let followBtnHtml = '';
    if (agent.session && agent.session.did !== user.did) {
        const isFollowing = user.viewer && user.viewer.following;
        if (isFollowing) {
            followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded follow-user-btn" data-did="${user.did}" data-following="true">Following</button>`;
        } else {
            followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 follow-user-btn" data-did="${user.did}" data-following="false">Follow</button>`;
        }
    }
    const liked = post.viewer && post.viewer.like;
    const reposted = post.viewer && post.viewer.repost;
    const likeCount = post.likeCount || 0;
    const repostCount = post.repostCount || 0;
    let likeBtnHtml = `<button class="like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-liked="${!!liked}" data-likeuri="${liked ? liked : ''}">
        <i class="${liked ? 'fas' : 'far'} fa-heart"></i><span>${likeCount}</span></button>`;
    let repostBtnHtml = `<button class="repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-reposted="${!!reposted}" data-reposturi="${reposted ? reposted : ''}">
        <i class="fas fa-retweet"></i><span>${repostCount}</span></button>`;
    // Comment UI
    const commentSectionId = `comments-${post.cid}`;
    const commentFormId = `comment-form-${post.cid}`;
    const commentInputId = `comment-input-${post.cid}`;
    const commentSendId = `comment-send-${post.cid}`;
    const currentUserAvatar = (agent.session && agent.session.did)
        ? (document.getElementById('current-user-avatar')?.src || defaultAvatar)
        : defaultAvatar;
    // Render single post content in feed container
    document.getElementById('single-post-content').innerHTML = `
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out mx-auto mt-8 mb-8">
            <div class="p-4">
                ${renderPostCard({ post, user, audioHtml })}
            </div>
        </div>
    `;
    // Init WaveSurfer
    setTimeout(() => {
        const container = document.getElementById(audioWaveformId);
        if (container && window.WaveSurfer && audioBlobUrl) {
            initWaveSurfer(audioWaveformId, audioBlobUrl);
        }
    }, 0);
        // Comments fetch and post logic (reuse from feed)
        (async () => {
            const commentSection = document.getElementById(`comments-${post.cid}`);
            if (!commentSection) return;
            try {
                const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: post.uri });
                const replies = (threadRes.data.thread?.replies || []).slice(0, 5);
                if (replies.length === 0) {
                    commentSection.innerHTML = '<div class="text-gray-400 text-xs">No comments yet.</div>';
                } else {
                    commentSection.innerHTML = replies.map(reply => {
                        const author = reply.post.author;
                        const avatar = author.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${author.did}/@jpeg`;
                        const name = author.displayName || author.handle || 'Unknown';
                        const commentText = reply.post.record.text || '';
                        const isOwnComment = agent.session && agent.session.did === author.did;
                        const deleteBtn = isOwnComment ? `<button class='ml-2 px-1 py-0.5 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-comment-btn' data-uri='${reply.post.uri}' title='Delete comment'><i class='fa-solid fa-trash-can'></i></button>` : '';
                        return `<div class=\"flex items-start gap-2\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200\">${commentText}</p></div>${deleteBtn}</div>`;
                    }).join('');
                }
            } catch (err) {
                commentSection.innerHTML = '<div class=\"text-red-400 text-xs\">Failed to load comments.</div>';
            }
        })();
        const form = document.getElementById(`comment-form-${post.cid}`);
        const input = document.getElementById(`comment-input-${post.cid}`);
        // Remove the inline onsubmit handler; rely on delegated handler
        // if (form && input) {
        //     form.onsubmit = async (e) => { ... }
        // }
    // Like, repost, delete, follow, etc. event listeners (reuse from feed)
    setTimeout(() => {
        document.querySelectorAll('.delete-post-btn').forEach(btn => {
            btn.onclick = async (e) => {
                let uri = btn.getAttribute('data-uri');
                if (typeof uri !== 'string') uri = String(uri);
                if (window.confirm('Are you sure you want to delete this post?')) {
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
                        clearAllParamsInUrl();
                        fetchSoundskyFeed();
                    } catch (err) {
                        alert('Failed to delete post: ' + (err.message || err));
                    }
                }
            };
        });
        document.querySelectorAll('.like-post-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const uri = btn.getAttribute('data-uri');
                const cid = btn.getAttribute('data-cid');
                const liked = btn.getAttribute('data-liked') === 'true';
                const likeUri = btn.getAttribute('data-likeuri');
                const countSpan = btn.querySelector('span');
                try {
                    if (!liked) {
                        const likeRes = await agent.like(uri, cid);
                        btn.setAttribute('data-liked', 'true');
                        btn.setAttribute('data-likeuri', likeRes && likeRes.uri ? likeRes.uri : '');
                        btn.classList.remove('text-gray-500', 'hover:text-blue-500');
                        btn.classList.add('text-blue-500');
                        btn.querySelector('i').classList.remove('far');
                        btn.querySelector('i').classList.add('fas');
                        countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
                    } else {
                        if (likeUri) {
                            await agent.deleteLike(likeUri);
                            btn.setAttribute('data-liked', 'false');
                            btn.setAttribute('data-likeuri', '');
                            btn.classList.remove('text-blue-500');
                            btn.classList.add('text-gray-500', 'hover:text-blue-500');
                            btn.querySelector('i').classList.remove('fas');
                            btn.querySelector('i').classList.add('far');
                            countSpan.textContent = (parseInt(countSpan.textContent, 10) - 1).toString();
                        } else {
                            alert('Could not find like record URI to unlike.');
                        }
                    }
                } catch (err) {
                    alert('Failed to like/unlike post: ' + (err.message || err));
                }
            };
        });
        document.querySelectorAll('.repost-post-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const uri = btn.getAttribute('data-uri');
                const cid = btn.getAttribute('data-cid');
                const reposted = btn.getAttribute('data-reposted') === 'true';
                const repostUri = btn.getAttribute('data-reposturi');
                const countSpan = btn.querySelector('span');
                try {
                    if (!reposted) {
                        await agent.repost(uri, cid);
                        btn.setAttribute('data-reposted', 'true');
                        btn.classList.remove('text-gray-500', 'hover:text-green-500');
                        btn.classList.add('text-green-500');
                        countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
                    } else {
                        if (repostUri) {
                            await agent.deleteRepost(repostUri);
                            btn.setAttribute('data-reposted', 'false');
                            btn.classList.remove('text-green-500');
                            btn.classList.add('text-gray-500', 'hover:text-green-500');
                            countSpan.textContent = (parseInt(countSpan.textContent, 10) - 1).toString();
                        } else {
                            alert('Could not find repost record URI to unrepost.');
                        }
                    }
                } catch (err) {
                    alert('Failed to repost/unrepost post: ' + (err.message || err));
                }
            };
        });
        document.querySelectorAll('.follow-user-btn').forEach(btn => {
            btn.onclick = async (e) => {
                const did = btn.getAttribute('data-did');
                btn.disabled = true;
                btn.textContent = 'Following...';
                try {
                    await agent.follow(did);
                    btn.textContent = 'Following';
                    btn.classList.remove('text-blue-600', 'border-blue-200', 'hover:bg-blue-50');
                    btn.classList.add('text-gray-500', 'border-gray-200');
                } catch (err) {
                    btn.textContent = 'Follow';
                    btn.disabled = false;
                    alert('Failed to follow user: ' + (err.message || err));
                }
            };
        });
    }, 0);
    // Close button
    document.getElementById('close-single-post').onclick = () => {
        // Stop and destroy single post WaveSurfer instance
        if (window.soundskyWavesurfers && window.soundskyWavesurfers[audioWaveformId]) {
            try { window.soundskyWavesurfers[audioWaveformId].destroy(); } catch {};
            delete window.soundskyWavesurfers[audioWaveformId];
        }
        // Show upload form again
        const uploadForm = document.getElementById('create-audio-post');
        if (uploadForm) uploadForm.style.display = '';
        clearAllParamsInUrl();
        fetchSoundskyFeed();
    };
}

// --- Add click handler to each post in the feed ---
function addSinglePostClickHandlers() {
    setTimeout(() => {
        document.querySelectorAll('.post-title-link').forEach(title => {
            title.onclick = (e) => {
                e.preventDefault();
                const postUri = title.getAttribute('data-post-uri');
                if (postUri) {
                    setPostParamInUrl(postUri);
                    renderSinglePostView(postUri);
                }
            };
        });
    }, 0);
}

// --- On page load and popstate, check for ?post=... or ?artist=... ---
window.addEventListener('DOMContentLoaded', async () => {
    const postParam = getPostParamFromUrl();
    const artistParam = getArtistParamFromUrl();
    if (postParam) {
        renderSinglePostView(postParam);
    } else if (artistParam) {
        renderArtistPage(artistParam);
    }
});
window.addEventListener('popstate', () => {
    const postParam = getPostParamFromUrl();
    const artistParam = getArtistParamFromUrl();
    if (postParam) {
        renderSinglePostView(postParam);
    } else if (artistParam) {
        renderArtistPage(artistParam);
    } else {
        const modal = document.getElementById('single-post-modal');
        if (modal) modal.style.display = 'none';
        document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
        fetchSoundskyFeed();
    }
});

/*
// After rendering feed, add click handlers
const origRenderFeed = renderFeed;
renderFeed = async function(...args) {
    await origRenderFeed.apply(this, args);
    addSinglePostClickHandlers();
};
*/

// Add style for .post-title-link if not present
if (!document.getElementById('post-title-link-style')) {
    const style = document.createElement('style');
    style.id = 'post-title-link-style';
    style.textContent = `
    .post-title-link {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      font: inherit;
      padding: 0;
    }
    .post-title-link:hover {
      text-decoration: underline;
    }
    `;
    document.head.appendChild(style);
}

// Add custom CSS for .volume-slider if not present
if (!document.getElementById('volume-slider-style')) {
    const style = document.createElement('style');
    style.id = 'volume-slider-style';
    style.textContent = `
    input[type='range'].volume-slider {
      background: transparent;
      width: 1.25rem;
      min-width: 1.25rem;
      max-width: 1.25rem;
      height: 8rem;
      margin: 0;
      padding: 0;
      display: block;
    }
    input[type='range'].volume-slider::-webkit-slider-thumb {
      width: 1rem;
      height: 1rem;
      background: #2563eb;
      border-radius: 50%;
      border: none;
      box-shadow: 0 0 2px #0003;
      cursor: pointer;
      margin: 0;
      appearance: none;
    }
    input[type='range'].volume-slider::-webkit-slider-runnable-track {
      background: #e5e7eb;
      border-radius: 0.75rem;
      width: 100%;
      height: 100%;
      margin: 0;
    }
    input[type='range'].volume-slider:focus {
      outline: none;
    }
    input[type='range'].volume-slider::-moz-range-thumb {
      width: 1rem;
      height: 1rem;
      background: #2563eb;
      border-radius: 50%;
      border: none;
      box-shadow: 0 0 2px #0003;
      cursor: pointer;
      margin: 0;
    }
    input[type='range'].volume-slider::-moz-range-track {
      background: #e5e7eb;
      border-radius: 0.75rem;
      width: 100%;
      height: 100%;
      margin: 0;
    }
    input[type='range'].volume-slider::-ms-thumb {
      width: 1rem;
      height: 1rem;
      background: #2563eb;
      border-radius: 50%;
      border: none;
      box-shadow: 0 0 2px #0003;
      cursor: pointer;
      margin: 0;
    }
    input[type='range'].volume-slider::-ms-fill-lower,
    input[type='range'].volume-slider::-ms-fill-upper {
      background: #e5e7eb;
      border-radius: 0.75rem;
      margin: 0;
    }
    `;
    document.head.appendChild(style);
}

// --- 2. SINGLE POST: Make username clickable ---
// In renderSinglePostView, replace:
// <span class="font-bold text-gray-900 dark:text-gray-100">${displayName}</span>
// with:
// <button class="artist-link font-bold text-gray-900 dark:text-gray-100 hover:underline" data-did="${did}">${displayName}</button>

// --- 3. Add renderArtistPage(did) ---
async function renderArtistPage(did) {
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
    // Render audio posts (reuse renderFeed, but in this container)
    let tracksHtml = '';
    if (audioPosts.length === 0) {
        tracksHtml = `<div class='text-center text-gray-400 py-8'>No tracks yet.</div>`;
    } else {
        let html = '';
        const wavesurferInitQueue = [];
        for (const item of audioPosts) {
            const post = item.post || item;
            const user = post.author;
            const text = post.record.text || '';
            const did = user.did;
            let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
            const displayName = user.displayName || user.handle || 'Unknown';
            const time = formatRelativeTime(post.indexedAt);
            let audioHtml = '';
            let audioBlobUrl = null;
            let audioWaveformId = `waveform-artist-${post.cid}`;
            let fileEmbed = null;
            const embed = post.record && post.record.embed;
            if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
            else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
            if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
                const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
                const mimeType = fileEmbed.file.mimeType;
                try {
                    audioBlobUrl = await fetchAudioBlobUrl(user.did, blobRef);
                } catch (e) {
                    audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
                }
                if (audioBlobUrl && audioWaveformId) {
                    audioHtml = `
                      <div class="flex items-center gap-2 mt-3 audioplayerbox">
                        <!--IMG-FEED-->
                        <button class="wavesurfer-play-btn soundsky-play-btn" data-waveid="${audioWaveformId}">
                          <svg class="wavesurfer-play-icon" width="28" height="28" viewBox="0 0 28 28" fill="none">
                            <circle cx="14" cy="14" r="14" fill="#3b82f6"/>
                            <polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>
                          </svg>
                        </button>
                        <div id="${audioWaveformId}" class="wavesurfer waveform flex-1 h-12 relative">
                          <div class="wavesurfer-time">0:00</div>
                          <div class="wavesurfer-duration">0:00</div>
                          <div class="wavesurfer-hover"></div>
                        </div>
                      </div>
                    `;
                    wavesurferInitQueue.push({ audioWaveformId, audioBlobUrl });
                }
            }
            html += renderPostCard({ post, user, audioHtml });
        }
        tracksHtml = html;
        // After rendering, initialize WaveSurfer instances
        setTimeout(() => {
            for (const { audioWaveformId, audioBlobUrl } of wavesurferInitQueue) {
                initWaveSurfer(audioWaveformId, audioBlobUrl);
            }
        }, 0);
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
        const embed = post.record && post.record.embed;
        let fileEmbed = null;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
    });
}

// --- Utility: Render a post card (returns HTML string) ---
function renderPostCard({ post, user, audioHtml, options = {} }) {
    const did = user.did;
    let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
    const displayName = user.displayName || user.handle || 'Unknown';
    const time = formatRelativeTime(post.indexedAt);
    const text = post.record.text || '';
    // Like, repost, delete, follow buttons
    let deleteBtnHtml = '';
    if (agent.session && agent.session.did === user.did) {
        deleteBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-post-btn" data-uri="${String(post.uri)}"><i class="fa-solid fa-trash-can"></i></button>`;
    }
    let followBtnHtml = '';
    if (agent.session && agent.session.did !== user.did) {
        const isFollowing = user.viewer && user.viewer.following;
        if (isFollowing) {
            followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-gray-500 border border-gray-200 rounded follow-user-btn" data-did="${user.did}" data-following="true">Following</button>`;
        } else {
            followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 follow-user-btn" data-did="${user.did}" data-following="false">Follow</button>`;
        }
    }
    const liked = post.viewer && post.viewer.like;
    const reposted = post.viewer && post.viewer.repost;
    const likeCount = post.likeCount || 0;
    const repostCount = post.repostCount || 0;
    let likeBtnHtml = `<button class="like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-liked="${!!liked}" data-likeuri="${liked ? liked : ''}"><i class="${liked ? 'fas' : 'far'} fa-heart"></i><span>${likeCount}</span></button>`;
    let repostBtnHtml = `<button class="repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-reposted="${!!reposted}" data-reposturi="${reposted ? reposted : ''}"><i class="fas fa-retweet"></i><span>${repostCount}</span></button>`;
    // Comment UI IDs
    const commentSectionId = `comments-${post.cid}`;
    const commentFormId = `comment-form-${post.cid}`;
    const commentInputId = `comment-input-${post.cid}`;
    const commentSendId = `comment-send-${post.cid}`;
    const currentUserAvatar = (agent.session && agent.session.did)
        ? (document.getElementById('current-user-avatar')?.src || defaultAvatar)
        : defaultAvatar;

    // --- Artwork image logic ---
    let artworkHtml = '';
    let artworkUrl = '';
    let embed = post.record && post.record.embed;
    let images = [];
    // Debug: log the post object when scanning for images
    // console.log('DEBUG: renderPostCard post object:', post);
    // Check for recordWithMedia (audio+image)
    if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
        images = embed.media.images;
    } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
        images = embed.images;
    }
    // New: Check for image links in post text facets
    const facets = post.record && post.record.facets;
    if (facets && Array.isArray(facets)) {
        for (const facet of facets) {
            if (facet.features && Array.isArray(facet.features)) {
                for (const feature of facet.features) {
                    if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
                        // Only show if it's a direct image link
                        if (feature.uri.match(/\.(png|jpe?g|gif)$/i)) {
                            artworkHtml += `<div class=\"mb-2\"><img src=\"${feature.uri}\" alt=\"Artwork\" class=\"max-h-64 rounded-lg object-contain mx-auto\" style=\"max-width:100%;background:#f3f4f6;\" loading=\"lazy\"></div>`;
                            artworkUrl = `<img src="${feature.uri}" style="max-height: 48px;"/>`;
                        }
                    }
                }
            }
        }
    }
    if (images.length > 0) {
        // Only show the first image for now
        const img = images[0];
        // Get blob URL for image
        let imgUrl = '';
        if (img.image && img.image.ref) {
            // Use the same blob fetch logic as audio
            const blobRef = img.image.ref && img.image.ref.toString ? img.image.ref.toString() : img.image.ref;
            const userDid = user.did;
            // Synchronous HTML, so we use the bsky blob endpoint directly
            imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
        }
        artworkHtml = `<div class=\"mb-2\"><img src=\"${imgUrl}\" alt=\"Artwork\" class=\"max-h-64 rounded-lg object-contain mx-auto\" style=\"max-width:100%;background:#f3f4f6;\" loading=\"lazy\"></div>`;
        artworkUrl = `<img src="${imgUrl}"/>`;
    }

    // Remove image links from displayed post text
    let displayText = text;
    if (facets && Array.isArray(facets)) {
        for (const facet of facets) {
            if (facet.features && Array.isArray(facet.features)) {
                for (const feature of facet.features) {
                    if (
                        feature.$type === 'app.bsky.richtext.facet#link' &&
                        feature.uri &&
                        feature.uri.match(/\.(png|jpe?g|gif)$/i)
                    ) {
                        // Remove the image URL from the text
                        displayText = displayText.replace(feature.uri, '').replace(/\n{2,}/g, '\n').trim();
                    }
                }
            }
        }
    }

     // Play counter placeholder (will be filled in after render)
     let playCounterId = `play-counter-${post.cid}`;
     let playCounterHtmlButton = `<button class="play-counter-btn flex items-center space-x-1 text-sm text-gray-500 hover:text-blue-500" id="${playCounterId}"><i class="fas fa-play"></i><span>...</span></button>`;
     let playCounterHtml = `<img src="https://counterapi.com/counter.svg?key=${post.cid}&action=play&ns=soundskycloud&color=ff0000&label=Plays&readOnly=false">`;

    return `
        <div class="bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out" data-post-uri="${String(post.uri)}">
            <div class="p-4">
                <div class="flex items-start">
                    <img class="h-10 w-10 rounded-full" src="${avatar}" alt="${user.handle}" onerror="this.onerror=null;this.src='${defaultAvatar}';">
                    <div class="ml-3 flex-1">
                        <div class="flex items-center">
                            <button class="artist-link font-medium text-gray-900 dark:text-gray-100 hover:underline" data-did="${did}">${displayName}</button>
                            <span class="mx-1 text-gray-500 dark:text-gray-400">·</span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">${time}</span>
                            ${deleteBtnHtml}
                            ${followBtnHtml}
                        </div>
                        <button class="post-title-link block font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${String(post.uri)}">${displayText}</button>
                        <!-- ${artworkHtml} -->
                        ${audioHtml.replace('<!--IMG-FEED-->',artworkUrl).replace('<!--IMG-ARTIST-->',artworkHtml)}
                        <div class="mt-3 flex items-center space-x-4">
                            ${playCounterHtml}
                            ${likeBtnHtml}
                            ${repostBtnHtml}
                        </div>
                        <div class='mt-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-3'>
                            <div class='flex items-center gap-2 mb-2'>
                                <img src='${currentUserAvatar}' class='h-8 w-8 rounded-full' alt='Me' onerror="this.onerror=null;this.src='${defaultAvatar}';">
                                <form id='${commentFormId}' class='flex-1 flex items-center gap-2'>
                                    <input id='${commentInputId}' type='text' placeholder='Write a comment' class='flex-1 bg-gray-100 dark:bg-gray-700 rounded px-3 py-2 text-sm focus:outline-none' maxlength='280' autocomplete='off' />
                                    <button id='${commentSendId}' type='submit' class='p-2 text-blue-500 hover:text-blue-600' title='Send'>
                                        <svg width='20' height='20' fill='none' viewBox='0 0 20 20'><path d='M2.5 17.5l15-7.5-15-7.5v6.25l10 1.25-10 1.25v6.25z' fill='currentColor'/></svg>
                                    </button>
                                </form>
                            </div>
                            <div id='${commentSectionId}' class='space-y-2'></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// --- Utility: Initialize WaveSurfer instance for a given waveform ID and blob URL ---
function initWaveSurfer(audioWaveformId, audioBlobUrl) {
                const container = document.getElementById(audioWaveformId);
    if (container && window.WaveSurfer && audioBlobUrl) {
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
        // Init WaveSurfer
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
        // Store instance globally
                    window.soundskyWavesurfers[audioWaveformId] = wavesurfer;
        // Play/pause button
                    const playBtn = document.querySelector(`button[data-waveid="${audioWaveformId}"]`);
                    let hasCountedPlay = false;
                    if (playBtn) {
                        const svg = playBtn.querySelector('.wavesurfer-play-icon');
                        playBtn.onclick = () => {
                // Pause all other players before playing this one
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
                                if (!hasCountedPlay) {
                                    hasCountedPlay = true;
                                    // Use 'soundskycloud' as namespace, and audioWaveformId as key
                                    incrementCount('soundskycloud', audioWaveformId).catch(() => {});
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
                    // Time/duration overlays
                    const timeEl = container.querySelector('.wavesurfer-time');
                    const durationEl = container.querySelector('.wavesurfer-duration');
                    const formatTime = (seconds) => {
                        const minutes = Math.floor(seconds / 60);
                        const secondsRemainder = Math.round(seconds) % 60;
                        const paddedSeconds = `0${secondsRemainder}`.slice(-2);
                        return `${minutes}:${paddedSeconds}`;
                    };
                    wavesurfer.on('decode', (duration) => {
                        if (durationEl) durationEl.textContent = formatTime(duration);
                    });
                    wavesurfer.on('timeupdate', (currentTime) => {
                        if (timeEl) timeEl.textContent = formatTime(currentTime);
                    });
                    // Hover effect
                    const hoverEl = container.querySelector('.wavesurfer-hover');
                    container.addEventListener('pointermove', (e) => {
                        if (hoverEl) hoverEl.style.width = `${e.offsetX}px`;
                    });
                    container.addEventListener('pointerenter', () => {
                        if (hoverEl) hoverEl.style.opacity = 1;
                    });
                    container.addEventListener('pointerleave', () => {
                        if (hoverEl) hoverEl.style.opacity = 0;
                    });
                }
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
                await agent.api.com.atproto.repo.deleteRecord({
                    repo: did,
                    collection,
                    rkey,
                });
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

// --- Play Counter Helpers ---
/**
 * Get the current count from CounterAPI
 * @param {string} namespace - Your domain or logical grouping (in our case 'soundskycloud')
 * @param {string} key - Unique identifier for the play counter (e.g., did of the post)
 * @returns {Promise<number>} - Resolves to the current count
 */
async function getCount(namespace, key) {
    const url = `https://counterapi.com/api/${namespace}/play/${key}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch count');
    const data = await response.json();
    // console.log('Count:', namespace, key, data);
    return data.value;
  }
  
/**
 * Increment the counter by 1
 * @param {string} namespace - Your domain or logical grouping
 * @param {string} key - Unique identifier for the counter
 * @returns {Promise<number>} - Resolves to the updated count after increment
 */
async function incrementCount(namespace, key) {
    const url = `https://counterapi.com/api/${namespace}/play/${key}?time=${Date.now()}&trackOnly=1`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) throw new Error('Failed to increment count');
    const data = await response.json();
    console.log('Increment:', namespace, key, data.value);
    return data.value;
}
