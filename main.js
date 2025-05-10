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
            if (postParam) {
                renderSinglePostView(postParam);
            } else {
                fetchSoundskyFeed();
            }
        } catch (e) {
            localStorage.removeItem('bskySession');
        }
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
    }
});

// Add logout button logic
const topNav = document.querySelector('.flex.items-center.space-x-4');
if (topNav) {
    // Upload button
    const uploadBtn = document.createElement('button');
    uploadBtn.textContent = 'Upload';
    uploadBtn.className = 'ml-2 px-3 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50';
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
    logoutBtn.textContent = 'Logout';
    logoutBtn.className = 'ml-2 px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-100';
    logoutBtn.onclick = () => {
        localStorage.removeItem('bskySession');
        window.location.reload();
    };
    topNav.appendChild(logoutBtn);

    // Add volume button and slider to the top bar
    // Volume button and slider container
    const volumeContainer = document.createElement('div');
    volumeContainer.className = 'relative flex items-center';
    // Volume button
    const volumeBtn = document.createElement('button');
    volumeBtn.innerHTML = `<svg width="20" height="20" fill="none" viewBox="0 0 20 20"><path d="M3 8v4h4l5 5V3L7 8H3z" fill="currentColor"/></svg>`;
    volumeBtn.className = 'ml-2 px-2 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-100';
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
if (navFeed) navFeed.onclick = (e) => { e.preventDefault(); clearPostParamInUrl(); setActiveNav('nav-feed'); fetchSoundskyFeed({ mode: 'home' }); };
if (navDiscover) navDiscover.onclick = (e) => { e.preventDefault(); clearPostParamInUrl(); setActiveNav('nav-discover'); fetchSoundskyFeed({ mode: 'discover' }); };
if (navLikes) navLikes.onclick = (e) => {
    e.preventDefault();
    setActiveNav('nav-likes');
    navLikes.classList.add('opacity-50', 'cursor-not-allowed');
    fetchSoundskyFeed({ mode: 'likes' });
};

// Update fetchSoundskyFeed to accept mode
async function fetchSoundskyFeed({ append = false, mode = 'home' } = {}) {
    feedLoading.classList.remove('hidden');
    if (!append) {
        feedContainer.innerHTML = '';
        loadedAudioPosts = [];
        nextCursor = null;
    }
    feedContainer.appendChild(feedLoading);
    try {
        let foundAudio = false;
        let localCursor = nextCursor;
        let newAudioPosts = [];
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
            // Filter for audio posts only
            let audioPosts;
            if (mode === 'home') {
                audioPosts = feed && feed.data && feed.data.feed
                    ? feed.data.feed.filter(item => {
                        const post = item.post || item;
                        const tags = post.record && post.record.tags;
                        if (!tags || !Array.isArray(tags) || !tags.includes('soundskyaudio')) return false;
                        const embed = post.record && post.record.embed;
                        let fileEmbed = null;
                        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
                        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
                        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
                    })
                    : (feed && feed.data && feed.data.posts || []).filter(post => {
                        const tags = post.record && post.record.tags;
                        if (!tags || !Array.isArray(tags) || !tags.includes('soundskyaudio')) return false;
                        const embed = post.record && post.record.embed;
                        let fileEmbed = null;
                        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
                        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
                        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
                    });
            } else {
                audioPosts = feed && feed.data && feed.data.feed
                    ? feed.data.feed.filter(item => {
                        const post = item.post || item;
                        const embed = post.record && post.record.embed;
                        let fileEmbed = null;
                        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
                        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
                        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
                    })
                    : (feed && feed.data && feed.data.posts || []).filter(post => {
                        const embed = post.record && post.record.embed;
                        let fileEmbed = null;
                        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
                        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
                        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
                    });
            }
            if (audioPosts && audioPosts.length > 0) {
                foundAudio = true;
                newAudioPosts = newAudioPosts.concat(audioPosts);
            }
            if (append && audioPosts && audioPosts.length > 0) break;
        } while (!foundAudio && localCursor);
        nextCursor = lastCursor;
        if (append) {
            loadedAudioPosts = loadedAudioPosts.concat(newAudioPosts);
        } else {
            loadedAudioPosts = newAudioPosts;
        }
        await renderFeed(loadedAudioPosts, { showLoadMore: !!nextCursor });
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
    // Build feed HTML in a string
    let html = '';
    // Only render posts with audio content
    const audioPosts = posts.filter(item => {
        const post = item.post || item;
        const embed = post.record && post.record.embed;
        let fileEmbed = null;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
    });
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
    for (const item of audioPosts) {
        const post = item.post || item; // support both timeline and search result
        const user = post.author;
        const text = post.record.text || '';
        const did = user.did;
        let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
        const displayName = user.displayName || user.handle || 'Unknown';
        const time = new Date(post.indexedAt).toLocaleString();
        let audioHtml = '';
        let audioBlobUrl = null;
        let audioWaveformId = null;
        let fileEmbed = null;
        const embed = post.record && post.record.embed;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
            const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
            const mimeType = fileEmbed.file.mimeType;
            audioWaveformId = `waveform-${post.cid}`;
            try {
                // Direct fetch to the public getBlob endpoint
                const blobUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
                let resp = await fetch(blobUrl);
                if (!resp.ok) {
                    // Try with CORS proxy if direct fetch fails
                    const corsProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(blobUrl);
                    resp = await fetch(corsProxyUrl);
                }
                if (!resp.ok) throw new Error('Blob fetch failed');
                const audioBlob = await resp.blob();
                audioBlobUrl = URL.createObjectURL(audioBlob);
            } catch (e) {
                audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
            }
            if (audioBlobUrl && audioWaveformId) {
                audioHtml = `
                  <div class="flex items-center gap-2 mt-3 audioplayerbox">
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
        // Show delete button if the logged-in user is the author
        let deleteBtnHtml = '';
        if (agent.session && agent.session.did === user.did) {
            deleteBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-post-btn" data-uri="${String(post.uri)}">Delete</button>`;
        }
        // Show follow button if not following and not self
        let followBtnHtml = '';
        if (agent.session && agent.session.did !== user.did && (!user.viewer || !user.viewer.following)) {
            followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 follow-user-btn" data-did="${user.did}">Follow</button>`;
        }
        // Like and repost buttons
        const liked = post.viewer && post.viewer.like;
        const reposted = post.viewer && post.viewer.repost;
        const likeCount = post.likeCount || 0;
        const repostCount = post.repostCount || 0;
        let likeBtnHtml = `<button class="like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-liked="${!!liked}" data-likeuri="${liked ? liked : ''}">
            <i class="${liked ? 'fas' : 'far'} fa-heart"></i><span>${likeCount}</span></button>`;
        let repostBtnHtml = `<button class="repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-reposted="${!!reposted}" data-reposturi="${reposted ? reposted : ''}">
            <i class="fas fa-retweet"></i><span>${repostCount}</span></button>`;
        if (text.trim() || audioHtml) {
            // Comment UI IDs
            const commentSectionId = `comments-${post.cid}`;
            const commentFormId = `comment-form-${post.cid}`;
            const commentInputId = `comment-input-${post.cid}`;
            const commentSendId = `comment-send-${post.cid}`;
            const currentUserAvatar = (agent.session && agent.session.did)
                ? (document.getElementById('current-user-avatar')?.src || defaultAvatar)
                : defaultAvatar;
            html += `
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
                                <button class="post-title-link block font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${String(post.uri)}">${text}</button>
                                ${audioHtml}
                                <div class="mt-3 flex items-center space-x-4">
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
    }
    feedContainer.innerHTML = html;
    // After rendering all posts, initialize all WaveSurfer instances
    for (const { audioWaveformId, audioBlobUrl } of wavesurferInitQueue) {
        const container = document.getElementById(audioWaveformId);
        if (container && window.WaveSurfer) {
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
                        // Set to play icon
                        svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                    } else {
                        wavesurfer.play();
                        // Set to pause icon
                        svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
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
    // After rendering all posts, add event listeners for delete, like, and repost buttons
    setTimeout(() => {
        document.querySelectorAll('.delete-post-btn').forEach(btn => {
            btn.onclick = async (e) => {
                let uri = btn.getAttribute('data-uri');
                let deepLog = '';
                try { deepLog = JSON.stringify(uri); } catch { deepLog = String(uri); }
                console.log('Attempting to delete post. URI:', uri, 'Type:', typeof uri, 'Deep:', deepLog);
                if (typeof uri !== 'string') uri = String(uri);
                if (window.confirm('Are you sure you want to delete this post?')) {
                    try {
                        // Parse the AT URI: at://did:plc:.../collection/rkey
                        const uriParts = uri.replace('at://', '').split('/');
                        const did = uriParts[0];
                        const collection = uriParts[1];
                        const rkey = uriParts[2];
                        console.log('Calling deleteRecord with:', { repo: did, collection, rkey });
                        await agent.api.com.atproto.repo.deleteRecord({
                            repo: did,
                            collection,
                            rkey,
                        });
                        fetchSoundskyFeed();
                    } catch (err) {
                        console.error('Delete post error:', err);
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
                        await agent.like(uri, cid);
                        btn.setAttribute('data-liked', 'true');
                        btn.classList.remove('text-gray-500', 'hover:text-blue-500');
                        btn.classList.add('text-blue-500');
                        btn.querySelector('i').classList.remove('far');
                        btn.querySelector('i').classList.add('fas');
                        countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
                    } else {
                        if (likeUri) {
                            await agent.deleteLike(likeUri);
                            btn.setAttribute('data-liked', 'false');
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
        // For each post, fetch and render comments
        audioPosts.forEach(async (item) => {
            const post = item.post || item;
            const commentSection = document.getElementById(`comments-${post.cid}`);
            if (!commentSection) return;
            try {
                // Fetch replies using getPostThread
                const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: post.uri });
                const replies = (threadRes.data.thread?.replies || []).slice(0, 5); // Show up to 5 recent replies
                if (replies.length === 0) {
                    commentSection.innerHTML = '<div class="text-gray-400 text-xs">No comments yet.</div>';
                } else {
                    commentSection.innerHTML = replies.map(reply => {
                        const author = reply.post.author;
                        const avatar = author.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${author.did}/@jpeg`;
                        const name = author.displayName || author.handle || 'Unknown';
                        const text = reply.post.record.text || '';
                        return `<div class=\"flex items-start gap-2\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200\">${text}</p></div></div>`;
                    }).join('');
                }
            } catch (err) {
                commentSection.innerHTML = '<div class=\"text-red-400 text-xs\">Failed to load comments.</div>';
            }
        });
        // For each post, handle comment form submit
        audioPosts.forEach((item) => {
            const post = item.post || item;
            const form = document.getElementById(`comment-form-${post.cid}`);
            const input = document.getElementById(`comment-input-${post.cid}`);
            if (form && input) {
                form.onsubmit = async (e) => {
                    e.preventDefault();
                    const text = input.value.trim();
                    if (!text) return;
                    form.querySelector('button[type="submit"]').disabled = true;
                    try {
                        // Post reply
                        await agent.post({
                            text,
                            reply: {
                                root: { cid: post.cid, uri: post.uri },
                                parent: { cid: post.cid, uri: post.uri }
                            }
                        });
                        input.value = '';
                        // Re-fetch comments
                        const commentSection = document.getElementById(`comments-${post.cid}`);
                        if (commentSection) {
                            commentSection.innerHTML = '<div class=\"text-gray-400 text-xs\">Loading Library...</div>';
                            try {
                                const threadRes = await agent.api.app.bsky.feed.getPostThread({ uri: post.uri });
                                const replies = (threadRes.data.thread?.replies || []).slice(0, 5);
                                if (replies.length === 0) {
                                    commentSection.innerHTML = '<div class=\"text-gray-400 text-xs\">No comments yet.</div>';
                                } else {
                                    commentSection.innerHTML = replies.map(reply => {
                                        const author = reply.post.author;
                                        const avatar = author.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${author.did}/@jpeg`;
                                        const name = author.displayName || author.handle || 'Unknown';
                                        const text = reply.post.record.text || '';
                                        return `<div class=\\\"flex items-start gap-2\\\"><img src=\\\"${avatar}\\\" class=\\\"h-7 w-7 rounded-full\\\" alt=\\\"${name}\\\" onerror=\\\"this.onerror=null;this.src='${defaultAvatar}';\\\"><div><span class=\\\"font-medium text-xs text-gray-900 dark:text-gray-100\\\">${name}</span><p class=\\\"text-xs text-gray-700 dark:text-gray-200\\\">${text}</p></div></div>`;
                                    }).join('');
                                }
                            } catch (err) {
                                commentSection.innerHTML = '<div class=\\\"text-red-400 text-xs\\\">Failed to load comments.</div>';
                            }
                        }
                    } catch (err) {
                        alert('Failed to post comment: ' + (err.message || err));
                    } finally {
                        form.querySelector('button[type="submit"]').disabled = false;
                    }
                };
            }
        });
    }, 0);
    // At the end, add Load More button if needed
    if (showLoadMore) {
        html += `<div class="flex justify-center py-4"><button id="load-more-btn" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">Load More</button></div>`;
    }
    feedContainer.innerHTML = html;
    // After rendering all posts, initialize all WaveSurfer instances
    for (const { audioWaveformId, audioBlobUrl } of wavesurferInitQueue) {
        const container = document.getElementById(audioWaveformId);
        if (container && window.WaveSurfer) {
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
                        // Set to play icon
                        svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                    } else {
                        wavesurfer.play();
                        // Set to pause icon
                        svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
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
    // Load More button event
    if (showLoadMore) {
        const loadMoreBtn = document.getElementById('load-more-btn');
        if (loadMoreBtn) {
            loadMoreBtn.onclick = () => fetchSoundskyFeed({ append: true });
        }
    }
    addSinglePostClickHandlers();
}

const createAudioPost = document.getElementById('create-audio-post');
const audioPostForm = document.getElementById('audio-post-form');
const audioFileInput = document.getElementById('audio-file');
if (audioFileInput) audioFileInput.setAttribute('accept', '.mp3,audio/mpeg');
const audioCaptionInput = document.getElementById('audio-caption');
const audioPostBtn = document.getElementById('audio-post-btn');
const audioPostStatus = document.getElementById('audio-post-status');

// Handle audio post form submit
if (audioPostForm) {
    audioPostForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        audioPostStatus.textContent = '';
        audioPostBtn.disabled = true;
        audioPostBtn.textContent = 'Posting...';
        try {
            const file = audioFileInput.files[0];
            if (!file) throw new Error('Please select an audio file.');
            if (file.type !== 'audio/mpeg' && !file.name.endsWith('.mp3')) {
                throw new Error('Only MP3 files are supported.');
            }
            console.log('Uploading file:', file.name, 'type:', file.type, 'size:', file.size);
            // Upload blob
            const blobRes = await agent.uploadBlob(file, file.type);
            const blob = blobRes.data.blob;
            console.log('Blob uploaded:', blob);
            // Create post with #soundskyaudio tag
            const caption = audioCaptionInput.value || '';
            const text = caption;
            const embed = {
                $type: 'app.bsky.embed.file',
                file: blob,
                mimeType: file.type,
            };
            const postRes = await agent.post({ text, embed, tags: ['soundskyaudio'] });
            console.log('Post created:', postRes);
            audioPostStatus.textContent = 'Posted!';
            audioPostForm.reset();
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

async function renderSinglePostView(postUri) {
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
    const time = new Date(post.indexedAt).toLocaleString();
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
            const blobUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
            let resp = await fetch(blobUrl);
            if (!resp.ok) {
                const corsProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(blobUrl);
                resp = await fetch(corsProxyUrl);
            }
            if (!resp.ok) throw new Error('Blob fetch failed');
            const audioBlob = await resp.blob();
            audioBlobUrl = URL.createObjectURL(audioBlob);
        } catch (e) {
            audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
        }
        if (audioBlobUrl && audioWaveformId) {
            audioHtml = `
              <div class="flex items-center gap-2 mt-3">
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
    if (agent.session && agent.session.did !== user.did && (!user.viewer || !user.viewer.following)) {
        followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 follow-user-btn" data-did="${user.did}">Follow</button>`;
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
                <div class="flex items-start">
                    <img class="h-14 w-14 rounded-full" src="${avatar}" alt="${user.handle}" onerror="this.onerror=null;this.src='${defaultAvatar}';">
                    <div class="ml-4 flex-1">
                        <div class="flex items-center">
                            <button class="artist-link font-bold text-gray-900 dark:text-gray-100 hover:underline" data-did="${did}">${displayName}</button>
                            <span class="mx-2 text-gray-500 dark:text-gray-400">·</span>
                            <span class="text-sm text-gray-500 dark:text-gray-400">${time}</span>
                            ${deleteBtnHtml}
                            ${followBtnHtml}
                        </div>
                        <button class="post-title-link block font-bold text-xl text-gray-900 dark:text-white mt-2 mb-2" data-post-uri="${String(post.uri)}">${text}</button>
                        ${audioHtml}
                        <div class="mt-4 flex items-center space-x-6">
                            ${likeBtnHtml}
                            ${repostBtnHtml}
                        </div>
                        <div class='mt-6 bg-gray-50 dark:bg-gray-800 rounded-lg p-4'>
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
    // Init WaveSurfer
    setTimeout(() => {
        const container = document.getElementById(audioWaveformId);
        if (container && window.WaveSurfer && audioBlobUrl) {
            const canvas = document.createElement('canvas');
            canvas.width = 32; canvas.height = 48;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
            gradient.addColorStop(0, '#656666');
            gradient.addColorStop((canvas.height * 0.7) / canvas.height, '#656666');
            gradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
            gradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
            gradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#B1B1B1');
            gradient.addColorStop(1, '#B1B1B1');
            const progressGradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
            progressGradient.addColorStop(0, '#EE772F');
            progressGradient.addColorStop((canvas.height * 0.7) / canvas.height, '#EB4926');
            progressGradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
            progressGradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
            progressGradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#F6B094');
            progressGradient.addColorStop(1, '#F6B094');
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
            }
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
                        const text = reply.post.record.text || '';
                        return `<div class=\"flex items-start gap-2\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200\">${text}</p></div></div>`;
                    }).join('');
                }
            } catch (err) {
                commentSection.innerHTML = '<div class=\"text-red-400 text-xs\">Failed to load comments.</div>';
            }
        })();
        const form = document.getElementById(`comment-form-${post.cid}`);
        const input = document.getElementById(`comment-input-${post.cid}`);
        if (form && input) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                const text = input.value.trim();
                if (!text) return;
                form.querySelector('button[type="submit"]').disabled = true;
                try {
                    await agent.post({
                        text,
                        reply: {
                            root: { cid: post.cid, uri: post.uri },
                            parent: { cid: post.cid, uri: post.uri }
                        }
                    });
                    input.value = '';
                    const commentSection = document.getElementById(`comments-${post.cid}`);
                    if (commentSection) {
                        commentSection.innerHTML = '<div class="text-gray-400 text-xs">Loading...</div>';
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
                                    const text = reply.post.record.text || '';
                                    return `<div class=\"flex items-start gap-2\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200\">${text}</p></div></div>`;
                                }).join('');
                            }
                        } catch (err) {
                            commentSection.innerHTML = '<div class=\\\"text-red-400 text-xs\\\">Failed to load comments.</div>';
                        }
                    }
                } catch (err) {
                    alert('Failed to post comment: ' + (err.message || err));
                } finally {
                    form.querySelector('button[type="submit"]').disabled = false;
                }
            };
        }
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
                            clearPostParamInUrl();
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
                            await agent.like(uri, cid);
                            btn.setAttribute('data-liked', 'true');
                            btn.classList.remove('text-gray-500', 'hover:text-blue-500');
                            btn.classList.add('text-blue-500');
                            btn.querySelector('i').classList.remove('far');
                            btn.querySelector('i').classList.add('fas');
                            countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
                        } else {
                            if (likeUri) {
                                await agent.deleteLike(likeUri);
                                btn.setAttribute('data-liked', 'false');
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
        clearPostParamInUrl();
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

// --- On page load and popstate, check for ?post=... ---
window.addEventListener('DOMContentLoaded', async () => {
    const postParam = getPostParamFromUrl();
    if (postParam) {
        renderSinglePostView(postParam);
    }
});
window.addEventListener('popstate', () => {
    const postParam = getPostParamFromUrl();
    if (postParam) {
        renderSinglePostView(postParam);
    } else {
        const modal = document.getElementById('single-post-modal');
        if (modal) modal.style.display = 'none';
        document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
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
    container.innerHTML = `<div class='text-center text-gray-400 py-8'>Loading artist...</div>`;
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
    // Filter for audio posts (reuse feed logic)
    const audioPosts = posts.filter(item => {
        const post = item.post || item;
        const tags = post.record && post.record.tags;
        if (!tags || !Array.isArray(tags) || !tags.includes('soundskyaudio')) return false;
        const embed = post.record && post.record.embed;
        let fileEmbed = null;
        if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
        else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
        return fileEmbed && fileEmbed.file && fileEmbed.file.mimeType && fileEmbed.file.mimeType.startsWith('audio/');
    });
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
        <button id="artist-back-btn" class="px-4 py-2 bg-gray-200 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-700">Back</button>
      </div>
    `;
    // Render audio posts (reuse renderFeed, but in this container)
    let tracksHtml = '';
    if (audioPosts.length === 0) {
        tracksHtml = `<div class='text-center text-gray-400 py-8'>No tracks yet.</div>`;
    } else {
        // Use a custom renderFeed-like function for this container
        // We'll call renderFeed but in a special mode
        // Instead, let's reuse the rendering logic inline for now
        // (to avoid breaking global feed state)
        let html = '';
        const wavesurferInitQueue = [];
        for (const item of audioPosts) {
            const post = item.post || item;
            const user = post.author;
            const text = post.record.text || '';
            const did = user.did;
            let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
            const displayName = user.displayName || user.handle || 'Unknown';
            const time = new Date(post.indexedAt).toLocaleString();
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
                    const blobUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
                    let resp = await fetch(blobUrl);
                    if (!resp.ok) {
                        const corsProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(blobUrl);
                        resp = await fetch(corsProxyUrl);
                    }
                    if (!resp.ok) throw new Error('Blob fetch failed');
                    const audioBlob = await resp.blob();
                    audioBlobUrl = URL.createObjectURL(audioBlob);
                } catch (e) {
                    audioHtml = `<div class='text-red-500 text-xs mt-2'>Audio unavailable due to Bluesky CORS restrictions.</div>`;
                }
                if (audioBlobUrl && audioWaveformId) {
                    audioHtml = `
                      <div class="flex items-center gap-2 mt-3 audioplayerbox">
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
            // Like/repost/delete/follow buttons (reuse logic)
            let deleteBtnHtml = '';
            if (agent.session && agent.session.did === user.did) {
                deleteBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-post-btn" data-uri="${String(post.uri)}">Delete</button>`;
            }
            let followBtnHtml = '';
            if (agent.session && agent.session.did !== user.did && (!user.viewer || !user.viewer.following)) {
                followBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-blue-600 border border-blue-200 rounded hover:bg-blue-50 follow-user-btn" data-did="${user.did}">Follow</button>`;
            }
            const liked = post.viewer && post.viewer.like;
            const reposted = post.viewer && post.viewer.repost;
            const likeCount = post.likeCount || 0;
            const repostCount = post.repostCount || 0;
            let likeBtnHtml = `<button class="like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-liked="${!!liked}" data-likeuri="${liked ? liked : ''}">
                <i class="${liked ? 'fas' : 'far'} fa-heart"></i><span>${likeCount}</span></button>`;
            let repostBtnHtml = `<button class="repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-reposted="${!!reposted}" data-reposturi="${reposted ? reposted : ''}">
                <i class="fas fa-retweet"></i><span>${repostCount}</span></button>`;
            if (text.trim() || audioHtml) {
                const commentSectionId = `comments-${post.cid}`;
                const commentFormId = `comment-form-${post.cid}`;
                const commentInputId = `comment-input-${post.cid}`;
                const commentSendId = `comment-send-${post.cid}`;
                const currentUserAvatar = (agent.session && agent.session.did)
                    ? (document.getElementById('current-user-avatar')?.src || defaultAvatar)
                    : defaultAvatar;
                html += `
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
                                    <button class="post-title-link block font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${String(post.uri)}">${text}</button>
                                    ${audioHtml}
                                    <div class="mt-3 flex items-center space-x-4">
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
        }
        tracksHtml = html;
        // After rendering, initialize WaveSurfer instances
        setTimeout(() => {
            for (const { audioWaveformId, audioBlobUrl } of wavesurferInitQueue) {
                const container = document.getElementById(audioWaveformId);
                if (container && window.WaveSurfer) {
                    const canvas = document.createElement('canvas');
                    canvas.width = 32; canvas.height = 48;
                    const ctx = canvas.getContext('2d');
                    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
                    gradient.addColorStop(0, '#656666');
                    gradient.addColorStop((canvas.height * 0.7) / canvas.height, '#656666');
                    gradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
                    gradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
                    gradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#B1B1B1');
                    gradient.addColorStop(1, '#B1B1B1');
                    const progressGradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
                    progressGradient.addColorStop(0, '#EE772F');
                    progressGradient.addColorStop((canvas.height * 0.7) / canvas.height, '#EB4926');
                    progressGradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
                    progressGradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
                    progressGradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#F6B094');
                    progressGradient.addColorStop(1, '#F6B094');
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
            // Like, repost, delete, follow, comment event listeners (reuse from feed)
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
                                renderArtistPage(did);
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
                                await agent.like(uri, cid);
                                btn.setAttribute('data-liked', 'true');
                                btn.classList.remove('text-gray-500', 'hover:text-blue-500');
                                btn.classList.add('text-blue-500');
                                btn.querySelector('i').classList.remove('far');
                                btn.querySelector('i').classList.add('fas');
                                countSpan.textContent = (parseInt(countSpan.textContent, 10) + 1).toString();
                            } else {
                                if (likeUri) {
                                    await agent.deleteLike(likeUri);
                                    btn.setAttribute('data-liked', 'false');
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
                // Comments fetch and post logic (reuse from feed)
                audioPosts.forEach((item) => {
                    const post = item.post || item;
                    const commentSection = document.getElementById(`comments-${post.cid}`);
                    if (!commentSection) return;
                    (async () => {
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
                                    const text = reply.post.record.text || '';
                                    return `<div class=\"flex items-start gap-2\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200\">${text}</p></div></div>`;
                                }).join('');
                            }
                        } catch (err) {
                            commentSection.innerHTML = '<div class=\"text-red-400 text-xs\">Failed to load comments.</div>';
                        }
                    })();
                    const form = document.getElementById(`comment-form-${post.cid}`);
                    const input = document.getElementById(`comment-input-${post.cid}`);
                    if (form && input) {
                        form.onsubmit = async (e) => {
                            e.preventDefault();
                            const text = input.value.trim();
                            if (!text) return;
                            form.querySelector('button[type="submit"]').disabled = true;
                            try {
                                await agent.post({
                                    text,
                                    reply: {
                                        root: { cid: post.cid, uri: post.uri },
                                        parent: { cid: post.cid, uri: post.uri }
                                    }
                                });
                                input.value = '';
                                // Re-fetch comments
                                const commentSection = document.getElementById(`comments-${post.cid}`);
                                if (commentSection) {
                                    commentSection.innerHTML = '<div class="text-gray-400 text-xs">Loading...</div>';
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
                                                const text = reply.post.record.text || '';
                                                return `<div class=\"flex items-start gap-2\"><img src=\"${avatar}\" class=\"h-7 w-7 rounded-full\" alt=\"${name}\" onerror=\"this.onerror=null;this.src='${defaultAvatar}';\"><div><span class=\"font-medium text-xs text-gray-900 dark:text-gray-100\">${name}</span><p class=\"text-xs text-gray-700 dark:text-gray-200\">${text}</p></div></div>`;
                                            }).join('');
                                        }
                                    } catch (err) {
                                        commentSection.innerHTML = '<div class=\\\"text-red-400 text-xs\\\">Failed to load comments.</div>';
                                    }
                                }
                            } catch (err) {
                                alert('Failed to post comment: ' + (err.message || err));
                            } finally {
                                form.querySelector('button[type="submit"]').disabled = false;
                            }
                        };
                    }
                });
            }, 0);
        }, 0);
    }
    container.innerHTML = headerHtml + `<div class='mx-auto'>${tracksHtml}</div>`;
    // Back button handler
    document.getElementById('artist-back-btn').onclick = () => {
        // Show upload form again if on home
        const uploadForm = document.getElementById('create-audio-post');
        if (uploadForm) uploadForm.style.display = '';
        // If we came from a single post, restore it, else go to feed
        if (window._soundskyLastView && window._soundskyLastView.type === 'single') {
            renderSinglePostView(window._soundskyLastView.postUri);
        } else {
            fetchSoundskyFeed();
        }
    };
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
