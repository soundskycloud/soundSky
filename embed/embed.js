// Parse Bluesky post URI from query param (?uri=at://...)
function getPostUri() {
  const params = new URLSearchParams(window.location.search);
  return params.get('uri');
}

const postUri = getPostUri();
const container = document.getElementById('embed-player');

// Load WaveSurfer.js via CDN if not present
function loadWaveSurferScript(cb) {
  if (window.WaveSurfer) return cb();
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/wavesurfer.js@7/dist/wavesurfer.min.js';
  script.onload = cb;
  document.head.appendChild(script);
}

if (!postUri) {
  container.innerHTML = '<div style="color:red">No track specified.</div>';
} else {
  loadWaveSurferScript(() => renderEmbedPlayer(postUri));
}

async function fetchAudioBlobUrl(userDid, blobRef) {
  // Debug output
  console.log('fetchAudioBlobUrl:', { userDid, blobRef, userDidType: typeof userDid, blobRefType: typeof blobRef, blobRefRaw: blobRef });
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

async function renderEmbedPlayer(uri) {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}`);
    const data = await res.json();
    const post = data.thread?.post || data.thread;
    if (!post) {
      container.innerHTML = '<div style="color:red">Track not found.</div>';
      return;
    }
    // Extract audio info
    let embed = post.record && post.record.embed;
    let fileEmbed = null;
    if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
    else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
    if (!fileEmbed || !fileEmbed.file || !fileEmbed.file.mimeType.startsWith('audio/')) {
      container.innerHTML = '<div style="color:red">No audio file found in this post.</div>';
      return;
    }
    // Fix: ensure blobRef is a string
    let blobRef = fileEmbed.file.ref;
    if (blobRef && typeof blobRef === 'object') {
      if (blobRef['$link']) {
        blobRef = blobRef['$link'];
      } else if (typeof blobRef.toString === 'function' && blobRef.toString() !== '[object Object]') {
        blobRef = blobRef.toString();
      } else {
        console.log('Unknown blobRef object (no $link):', blobRef);
        blobRef = '';
      }
    }
    if (typeof blobRef !== 'string') {
      console.log('blobRef is not a string after extraction:', blobRef);
      blobRef = '';
    }
    // End fix
    const userDid = post.author.did;
    let audioBlobUrl;
    try {
      audioBlobUrl = await fetchAudioBlobUrl(userDid, blobRef);
    } catch (e) {
      container.innerHTML = '<div style="color:red">Audio unavailable due to Bluesky CORS restrictions.</div>';
      return;
    }
    // Render minimal player
    container.innerHTML = renderMinimalPlayer(post);
    // Initialize WaveSurfer
    setTimeout(() => initWaveSurferEmbed(audioBlobUrl), 0);
  } catch (e) {
    container.innerHTML = '<div style="color:red">Error loading track.</div>';
  }
}

function renderMinimalPlayer(post) {
  // Extract artwork (from embed or facets)
  let artworkUrl = '';
  let embed = post.record && post.record.embed;
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
              artworkUrl = feature.uri;
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
      const userDid = post.author.did;
      imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
    }
    artworkUrl = imgUrl;
  }
  // Title and artist
  let title = post.record?.text || '';
  const artist = post.author?.displayName || post.author?.handle || '';
  // Remove image links from displayed post text
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
            title = title.replace(feature.uri, '').replace(/\n{2,}/g, '\n').trim();
          }
        }
      }
    }
  }
  // Audio player area: play button left, waveform right
  const audioHtml = `
    <div class="embed-audio-row">
      <button id="embed-play-btn" class="embed-play-btn" aria-label="Play/Pause">
        <svg id="embed-play-icon" width="36" height="36" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="18" fill="#3b82f6"/>
          <polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>
        </svg>
      </button>
      <div id="embed-waveform" class="embed-waveform"></div>
    </div>
    <div class="embed-time-row"><span id="embed-current">0:00</span> / <span id="embed-duration">0:00</span></div>
  `;
  return `
    <div class="embed-card">
      <div class="embed-artwork">${artworkUrl ? `<img src="${artworkUrl}" alt="Artwork">` : ''}</div>
      <div class="embed-title">${title}</div>
      <div class="embed-artist">${artist}</div>
      ${audioHtml}
    </div>
  `;
}

function initWaveSurferEmbed(audioBlobUrl) {
  const container = document.getElementById('embed-waveform');
  if (!container || !window.WaveSurfer) return;
  // Create a simple gradient for waveform
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
  // Init WaveSurfer
  const wavesurfer = window.WaveSurfer.create({
    container: container,
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
  const playBtn = document.getElementById('embed-play-btn');
  const playIcon = document.getElementById('embed-play-icon');
  if (playBtn && playIcon) {
    playBtn.onclick = () => {
      if (wavesurfer.isPlaying()) {
        wavesurfer.pause();
        playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
      } else {
        wavesurfer.play();
        playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><rect x="16" y="12" width="3" height="12" rx="1" fill="white"/><rect x="22" y="12" width="3" height="12" rx="1" fill="white"/>`;
      }
    };
    wavesurfer.on('finish', () => {
      playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
    });
    wavesurfer.on('pause', () => {
      playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
    });
    wavesurfer.on('play', () => {
      playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><rect x="16" y="12" width="3" height="12" rx="1" fill="white"/><rect x="22" y="12" width="3" height="12" rx="1" fill="white"/>`;
    });
  }
  // Time/duration overlays
  const timeEl = document.getElementById('embed-current');
  const durationEl = document.getElementById('embed-duration');
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
} 
