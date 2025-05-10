import { BskyAgent } from 'https://esm.sh/@atproto/api';

const agent = new BskyAgent({ service: 'https://bsky.social' });

const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const feedContainer = document.getElementById('feed');
const feedLoading = document.getElementById('feed-loading');

const defaultAvatar = '/default-avatar.png';

// On page load, try to resume session
window.addEventListener('DOMContentLoaded', async () => {
    document.querySelector('.flex.h-screen.overflow-hidden').style.filter = 'blur(2px)';
    const savedSession = localStorage.getItem('bskySession');
    if (savedSession) {
        try {
            await agent.resumeSession(JSON.parse(savedSession));
            loginForm.style.display = 'none';
            document.querySelector('.flex.h-screen.overflow-hidden').style.filter = '';
            setCurrentUserAvatar();
            fetchSoundskyFeed();
        } catch (e) {
            localStorage.removeItem('bskySession');
        }
    }
});

loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    loginError.classList.add('hidden');
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    try {
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
    const logoutBtn = document.createElement('button');
    logoutBtn.textContent = 'Logout';
    logoutBtn.className = 'ml-2 px-3 py-1 text-xs text-gray-600 border border-gray-200 rounded hover:bg-gray-100';
    logoutBtn.onclick = () => {
        localStorage.removeItem('bskySession');
        window.location.reload();
    };
    topNav.appendChild(logoutBtn);
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
if (navFeed) navFeed.onclick = (e) => { e.preventDefault(); setActiveNav('nav-feed'); fetchSoundskyFeed({ mode: 'home' }); };
if (navDiscover) navDiscover.onclick = (e) => { e.preventDefault(); setActiveNav('nav-discover'); fetchSoundskyFeed({ mode: 'discover' }); };
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
        feedContainer.innerHTML = '<div class="text-center text-gray-500 py-8">No audio posts found.</div>';
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
                const resp = await fetch(blobUrl);
                if (!resp.ok) throw new Error('Blob fetch failed');
                const audioBlob = await resp.blob();
                audioBlobUrl = URL.createObjectURL(audioBlob);
            } catch (e) {
                let ext = 'mp3';
                if (mimeType === 'audio/wav') ext = 'wav';
                else if (mimeType === 'audio/ogg') ext = 'ogg';
                else if (mimeType === 'audio/webm') ext = 'webm';
                else if (mimeType === 'audio/aac') ext = 'aac';
                else if (mimeType === 'audio/flac') ext = 'flac';
                audioBlobUrl = `https://cdn.bsky.app/img/file/plain/${user.did}/${blobRef}@${ext}`;
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
            html += `
                <div class="bg-white rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out">
                    <div class="p-4">
                        <div class="flex items-start">
                            <img class="h-10 w-10 rounded-full" src="${avatar}" alt="${user.handle}" onerror="this.onerror=null;this.src='${defaultAvatar}';">
                            <div class="ml-3 flex-1">
                                <div class="flex items-center">
                                    <span class="font-medium text-gray-900">${displayName}</span>
                                    <span class="mx-1 text-gray-500">·</span>
                                    <span class="text-sm text-gray-500">${time}</span>
                                    ${deleteBtnHtml}
                                    ${followBtnHtml}
                                </div>
                                <p class="mt-1 text-gray-700">${text}</p>
                                ${audioHtml}
                                <div class="mt-3 flex items-center space-x-4">
                                    ${likeBtnHtml}
                                    ${repostBtnHtml}
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
