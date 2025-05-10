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

async function fetchSoundskyFeed() {
    feedLoading.classList.remove('hidden');
    feedContainer.innerHTML = '';
    feedContainer.appendChild(feedLoading);
    try {
        // Show all posts from the user's home timeline
        const feed = await agent.getTimeline({ limit: 50 });
        await renderFeed(feed.data.feed);
    } finally {
        feedLoading.classList.add('hidden');
    }
}

async function renderFeed(posts) {
    feedContainer.innerHTML = '';
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
        // Handle audio blobs
        if (post.record.embed) {
            // Log the full post and embed for debugging
            console.log('Full post object:', post);
            console.log('Embed object:', post.record.embed);
            let fileEmbed = null;
            if (post.record.embed.$type === 'app.bsky.embed.file') {
                fileEmbed = post.record.embed;
            } else if (post.record.embed.$type === 'app.bsky.embed.recordWithMedia' && post.record.embed.media && post.record.embed.media.$type === 'app.bsky.embed.file') {
                fileEmbed = post.record.embed.media;
            }
            if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
                const blobRef = fileEmbed.file.ref && fileEmbed.file.ref.toString ? fileEmbed.file.ref.toString() : fileEmbed.file.ref;
                const mimeType = fileEmbed.file.mimeType;
                console.log('Rendering audio:', { did: user.did, blobRef, mimeType });
                console.log('Final blobRef (CID string):', blobRef);
                audioWaveformId = `waveform-${post.cid}`;
                try {
                    const blobRes = await agent.api.com.atproto.sync.getBlob({
                        did: user.did,
                        cid: blobRef,
                    });
                    const blobData = blobRes.data.blob || blobRes.data;
                    const audioBlob = blobData instanceof Blob
                      ? blobData
                      : new Blob([blobData], { type: mimeType });
                    audioBlobUrl = URL.createObjectURL(audioBlob);
                    audioHtml = `
                      <div class="flex items-center gap-2 mt-3">
                        <button class="wavesurfer-play-btn bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center" data-waveid="${audioWaveformId}">
                          <span class="wavesurfer-play-icon">▶️</span>
                        </button>
                        <div id="${audioWaveformId}" class="wavesurfer waveform flex-1 h-12 relative">
                          <div class="wavesurfer-time">0:00</div>
                          <div class="wavesurfer-duration">0:00</div>
                          <div class="wavesurfer-hover"></div>
                        </div>
                      </div>
                    `;
                } catch (e) {
                    // Fallback: try public CDN
                    let ext = 'mp3';
                    if (mimeType === 'audio/wav') ext = 'wav';
                    else if (mimeType === 'audio/ogg') ext = 'ogg';
                    else if (mimeType === 'audio/webm') ext = 'webm';
                    else if (mimeType === 'audio/aac') ext = 'aac';
                    else if (mimeType === 'audio/flac') ext = 'flac';
                    const cdnUrl = `https://cdn.bsky.app/img/file/plain/${user.did}/${blobRef}@${ext}`;
                    console.warn('getBlob failed, trying CDN:', cdnUrl, e);
                    audioBlobUrl = cdnUrl;
                    audioHtml = `
                      <div class="flex items-center gap-2 mt-3">
                        <button class="wavesurfer-play-btn bg-blue-500 text-white rounded-full w-10 h-10 flex items-center justify-center" data-waveid="${audioWaveformId}">
                          <span class="wavesurfer-play-icon">▶️</span>
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
        }
        // Only render posts with real content (text or audio)
        if (text.trim() || audioHtml) {
            // Show delete button if the logged-in user is the author
            let deleteBtnHtml = '';
            if (agent.session && agent.session.did === user.did) {
                deleteBtnHtml = `<button class="ml-2 px-2 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50 delete-post-btn" data-uri="${String(post.uri)}">Delete</button>`;
            }
            // Like and repost buttons
            const liked = post.viewer && post.viewer.like;
            const reposted = post.viewer && post.viewer.repost;
            const likeCount = post.likeCount || 0;
            const repostCount = post.repostCount || 0;
            let likeBtnHtml = `<button class="like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-liked="${!!liked}">
                <i class="${liked ? 'fas' : 'far'} fa-heart"></i><span>${likeCount}</span></button>`;
            let repostBtnHtml = `<button class="repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}" data-uri="${String(post.uri)}" data-cid="${post.cid}" data-reposted="${!!reposted}">
                <i class="fas fa-retweet"></i><span>${repostCount}</span></button>`;
            feedContainer.innerHTML += `
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
        // After rendering, initialize WaveSurfer for this post if audioBlobUrl is set
        if (audioBlobUrl && audioWaveformId) {
            setTimeout(() => {
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
                    // Play/pause button
                    const playBtn = document.querySelector(`button[data-waveid="${audioWaveformId}"]`);
                    if (playBtn) {
                        playBtn.onclick = () => {
                            if (wavesurfer.isPlaying()) {
                                wavesurfer.pause();
                                playBtn.querySelector('.wavesurfer-play-icon').textContent = '▶️';
                            } else {
                                wavesurfer.play();
                                playBtn.querySelector('.wavesurfer-play-icon').textContent = '⏸️';
                            }
                        };
                        wavesurfer.on('finish', () => {
                            playBtn.querySelector('.wavesurfer-play-icon').textContent = '▶️';
                        });
                        wavesurfer.on('pause', () => {
                            playBtn.querySelector('.wavesurfer-play-icon').textContent = '▶️';
                        });
                        wavesurfer.on('play', () => {
                            playBtn.querySelector('.wavesurfer-play-icon').textContent = '⏸️';
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
            }, 0);
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
                try {
                    if (!liked) {
                        await agent.like(uri, cid);
                    } else {
                        await agent.deleteLike(uri, cid);
                    }
                    fetchSoundskyFeed();
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
                try {
                    if (!reposted) {
                        await agent.repost(uri, cid);
                    } else {
                        await agent.deleteRepost(uri, cid);
                    }
                    fetchSoundskyFeed();
                } catch (err) {
                    alert('Failed to repost/unrepost post: ' + (err.message || err));
                }
            };
        });
    }, 0);
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
            const text = `${caption} #soundskyaudio`;
            const embed = {
                $type: 'app.bsky.embed.file',
                file: blob,
                mimeType: file.type,
            };
            const postRes = await agent.post({ text, embed });
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
