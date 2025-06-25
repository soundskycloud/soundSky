// Parse Bluesky post URI from query param (?uri=at://...)
function getPostUri() {
  const params = new URLSearchParams(window.location.search);
  return params.get('uri') || params.get('url') || params.get('post');
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
  // Look up the user's PDS/serviceEndpoint using PLC directory
  let baseUrl = 'https://bsky.social';
  try {
    const plcResponse = await fetch(`https://plc.directory/${userDid}`);
    if (!plcResponse.ok) throw new Error(`Failed to resolve DID: ${plcResponse.status}`);
    const plcData = await plcResponse.json();
    // The PDS URL is in the 'service' field of the DID document
    const pdsEndpoint = plcData.service.find(s => s.id === '#atproto_pds')?.serviceEndpoint;
    if (pdsEndpoint) {
      baseUrl = pdsEndpoint.replace(/\/$/, '');
    }
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

// --- Lexicon-aware play counter for embed ---
function getLexiconPlayCount(lexiconRecord) {
  return lexiconRecord && lexiconRecord.stats && typeof lexiconRecord.stats.plays === 'number' ? lexiconRecord.stats.plays : 0;
}

async function incrementLexiconPlayCountEmbed(did, rkey) {
  try {
    // Fetch latest record
    const res = await fetch(`https://public.api.bsky.app/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=cloud.soundsky.audio&rkey=${encodeURIComponent(rkey)}`);
    const data = await res.json();
    if (!data.value) return;
    const record = data.value;
    if (!record.stats) record.stats = {};
    if (typeof record.stats.plays !== 'number') record.stats.plays = 0;
    record.stats.plays++;
    // Update record (public API can't write, so this is a no-op for public embeds)
    // Optionally, POST to your own backend or show as optimistic only
    // Optimistically update UI
    const playCountEls = document.querySelectorAll('.embed-playcount span');
    playCountEls.forEach(el => {
      el.textContent = record.stats.plays;
    });
  } catch (err) {
    console.error('Failed to increment play count (embed):', err);
  }
}

// Patch renderMinimalPlayer to show lexicon play count if available
function renderMinimalPlayer(post, { lazy = false, isLargeFile = false, lexiconRecord = null, rkey = null, did = null, artworkOverride = null, postUri = null } = {}) {
  let artworkUrl = artworkOverride || extractArtworkUrl(post);
  let title = post.record?.text || '';
  const artist = post.author?.displayName || post.author?.handle || '';
  const facets = post.record && post.record.facets;
  if (facets && Array.isArray(facets)) {
    for (const facet of facets) {
      if (facet.features && Array.isArray(facet.features)) {
        for (const feature of facet.features) {
          if (
            feature.$type === 'app.bsky.richtext.facet#link' &&
            feature.uri &&
            feature.uri.match(/\.(png|jpe?g|gif)$/i)
          ) {
            title = title.replace(feature.uri, '').replace(/\n{2,}/g, '\n').trim();
          }
        }
      }
    }
  }
  // --- Play Counter UI ---
  let playCounterHtml = '';
  // Only show play counter for legacy posts
  if (!lexiconRecord) {
    playCounterHtml = `<img src="https://counterapi.com/counter.svg?key=${post.cid}&action=play&ns=soundskycloud&color=ff0000&label=Plays&readOnly=false" class="mr-3">`;
  }
  // --- Link to main SoundSky post ---
  const postUrl = `/?post=${encodeURIComponent(postUri)}`;
  // No placeholder for embed
  const audioHtml = `
    <div class=\"embed-audio-row\">
      <button id=\"embed-play-btn\" class=\"embed-play-btn\" aria-label=\"Play/Pause\">
        <svg id=\"embed-play-icon\" width=\"36\" height=\"36\" viewBox=\"0 0 36 36\" fill=\"none\">
          <circle cx=\"18\" cy=\"18\" r=\"18\" fill=\"#3b82f6\"/>
          <polygon class=\"play-shape\" points=\"14,11 27,18 14,25\" fill=\"white\"/>
        </svg>
      </button>
      <div id=\"embed-waveform\" class=\"embed-waveform\"></div>
    </div>
    <div class=\"embed-time-row\"><span id=\"embed-current\">0:00</span> / <span id=\"embed-duration\">0:00</span></div>
  `;
  return `
    <div class=\"embed-card\">
      <div class=\"embed-artwork\">${artworkUrl ? `<a href="${postUrl}" target="_blank"><img src="${artworkUrl}" alt="Artwork"></a>` : ''}</div>
      <div class=\"embed-title\"><a href="${postUrl}" target="_blank">${title}</a></div>
      <div class=\"embed-artist\">${artist}</div>
      <div class=\"flex items-center mt-2\">${playCounterHtml}</div>
      ${audioHtml}
    </div>
  `;
}

// Patch renderEmbedPlayer to use lexicon play counter and increment logic
async function renderEmbedPlayer(uri) {
  try {
    const res = await fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}`);
    const data = await res.json();
    const post = data.thread?.post || data.thread;
    if (!post) {
      container.innerHTML = '<div style="color:red">Track not found.</div>';
      return;
    }
    // --- Lexicon-aware: check for soundskyid tag ---
    let tags = post.record && post.record.tags;
    let soundskyRkey = null;
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
      // Fetch lexicon record via user's PDS (not public API)
      const did = post.author.did;
      let pdsEndpoint = 'https://bsky.social';
      try {
        const plcRes = await fetch(`https://plc.directory/${did}`);
        if (plcRes.ok) {
          const plcData = await plcRes.json();
          const found = plcData.service.find(s => s.id === '#atproto_pds');
          if (found) pdsEndpoint = found.serviceEndpoint.replace(/\/$/, '');
        }
      } catch (e) { }
      try {
        const lexUrl = `${pdsEndpoint}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=cloud.soundsky.audio&rkey=${encodeURIComponent(soundskyRkey)}`;
        let lexRes = await fetch(lexUrl);
        let lexData;
        if (!lexRes.ok) {
          // fallback to CORS proxy
          const corsProxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(lexUrl);
          lexRes = await fetch(corsProxyUrl);
        }
        lexData = await lexRes.json();
        if (lexData && lexData.value) {
          lexiconRecord = lexData.value;
        }
      } catch (err) {
        lexiconRecord = null;
      }
    }
    // --- Extract audio and artwork ---
    let userDid = post.author.did;
    let artworkUrl = '';
    let audioBlobRef = null;
    let audioSize = null;
    let title = '';
    let artist = '';
    if (lexiconRecord) {
      if (lexiconRecord.artwork && lexiconRecord.artwork.ref) {
        let blobRef = lexiconRecord.artwork.ref;
        if (blobRef && typeof blobRef === 'object' && blobRef.$link) {
          blobRef = blobRef.$link;
        } else if (typeof blobRef === 'object' && typeof blobRef.toString === 'function' && blobRef.toString() !== '[object Object]') {
          blobRef = blobRef.toString();
        }
        artworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
      }
      if (lexiconRecord.audio && lexiconRecord.audio.ref) {
        let blobRef = lexiconRecord.audio.ref;
        if (blobRef && typeof blobRef === 'object' && blobRef.$link) {
          blobRef = blobRef.$link;
        } else if (typeof blobRef === 'object' && typeof blobRef.toString === 'function' && blobRef.toString() !== '[object Object]') {
          blobRef = blobRef.toString();
        }
        audioBlobRef = blobRef;
        audioSize = lexiconRecord.audio.size;
      }
      title = lexiconRecord.metadata?.title || lexiconRecord.text || '';
      artist = lexiconRecord.metadata?.artist || post.author.displayName || post.author.handle || '';
    } else {
      let embed = post.record && post.record.embed;
      let fileEmbed = null;
      if (embed && embed.$type === 'app.bsky.embed.file') fileEmbed = embed;
      else if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.$type === 'app.bsky.embed.file') fileEmbed = embed.media;
      if (fileEmbed && fileEmbed.file && fileEmbed.file.mimeType.startsWith('audio/')) {
        let blobRef = fileEmbed.file.ref;
        if (blobRef && typeof blobRef === 'object') {
          if (blobRef['$link']) {
            blobRef = blobRef['$link'];
          } else if (typeof blobRef.toString === 'function' && blobRef.toString() !== '[object Object]') {
            blobRef = blobRef.toString();
          } else {
            blobRef = '';
          }
        }
        if (typeof blobRef === 'string') {
          audioBlobRef = blobRef;
        }
        audioSize = fileEmbed.file.size;
      }
      artworkUrl = extractArtworkUrl(post);
      title = post.record?.text || '';
      artist = post.author?.displayName || post.author?.handle || '';
    }
    if (!audioBlobRef) {
      container.innerHTML = '<div style="color:red">No audio file found in this post.</div>';
      return;
    }
    const isLargeFile = audioSize > 10 * 1024 * 1024;
    // Fetch audio blob immediately
    let audioBlobUrl;
    try {
      audioBlobUrl = await fetchAudioBlobUrl(userDid, audioBlobRef);
    } catch (e) {
      container.innerHTML = '<div style="color:red">Audio unavailable due to Bluesky CORS restrictions.</div>';
      return;
    }
    updateMetaTags({ record: { text: title }, author: { displayName: artist } }, audioBlobUrl, artworkUrl);
    // Render player UI (no lazy, no placeholder)
    // Use oEmbed thumbnail_url as cover if available
    let coverToShow = artworkUrl;
    if (window.oembedResponse && window.oembedResponse.thumbnail_url) {
      coverToShow = window.oembedResponse.thumbnail_url;
    }
    container.innerHTML = renderMinimalPlayer(
      { record: { text: title }, author: { displayName: artist } },
      { lazy: false, isLargeFile, lexiconRecord, rkey: soundskyRkey, did: userDid, artworkOverride: coverToShow, postUri: post.uri }
    );
    // Setup player immediately
    const playBtn = document.getElementById('embed-play-btn');
    const playIcon = document.getElementById('embed-play-icon');
    const waveformDiv = document.getElementById('embed-waveform');
    let hasCountedPlay = false;
    if (isLargeFile) {
      // Fallback <audio> for large files
      const fallbackAudio = document.createElement('audio');
      fallbackAudio.className = 'embed-fallback-audio';
      fallbackAudio.src = audioBlobUrl;
      fallbackAudio.preload = 'none';
      fallbackAudio.controls = true;
      fallbackAudio.style.display = 'block';
      fallbackAudio.style.width = '100%';
      waveformDiv.appendChild(fallbackAudio);
      // Show message
      let msg = document.createElement('div');
      msg.className = 'mt-2 text-xs text-gray-400';
      msg.textContent = 'Waveform unavailable for large files';
      waveformDiv.appendChild(msg);
      // Play/pause button logic
      if (playBtn && playIcon) {
        playBtn.onclick = () => {
          if (fallbackAudio.paused) {
            fallbackAudio.play();
            playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><rect x="16" y="12" width="3" height="12" rx="1" fill="white"/><rect x="22" y="12" width="3" height="12" rx="1" fill="white"/>`;
            if (!hasCountedPlay) {
              if (lexiconRecord && soundskyRkey && userDid) {
                incrementLexiconPlayCountEmbed(userDid, soundskyRkey);
              }
              hasCountedPlay = true;
            }
          } else {
            fallbackAudio.pause();
            playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
          }
        };
        fallbackAudio.onended = () => {
          playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
        };
      }
    } else {
      // WaveSurfer for normal files
      setTimeout(() => {
        initWaveSurferEmbed(audioBlobUrl);
        // Play/pause button logic
        if (playBtn && playIcon && window._embedWavesurfer) {
          playBtn.onclick = () => {
            const ws = window._embedWavesurfer;
            if (ws.isPlaying()) {
              ws.pause();
              playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
            } else {
              ws.play();
              playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><rect x="16" y="12" width="3" height="12" rx="1" fill="white"/><rect x="22" y="12" width="3" height="12" rx="1" fill="white"/>`;
              if (!hasCountedPlay) {
                if (lexiconRecord && soundskyRkey && userDid) {
                  incrementLexiconPlayCountEmbed(userDid, soundskyRkey);
                }
                hasCountedPlay = true;
              }
            }
          };
          window._embedWavesurfer.on('finish', () => {
            playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
          });
          window._embedWavesurfer.on('pause', () => {
            playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><polygon class="play-shape" points="14,11 27,18 14,25" fill="white"/>`;
          });
          window._embedWavesurfer.on('play', () => {
            playIcon.innerHTML = `<circle cx="18" cy="18" r="18" fill="#3b82f6"/><rect x="16" y="12" width="3" height="12" rx="1" fill="white"/><rect x="22" y="12" width="3" height="12" rx="1" fill="white"/>`;
          });
        }
      }, 0);
    }
  } catch (e) {
    console.error('Error rendering player:', e);
    container.innerHTML = '<div style="color:red">Error loading track.</div>';
  }
}

function extractArtworkUrl(post) {
  // 1. Check for soundskyimg=xxxxxx tag
  const tags = post.record && post.record.tags;
  if (tags && Array.isArray(tags)) {
    for (const tag of tags) {
      if (typeof tag === 'string' && tag.startsWith('soundskyimg=')) {
        const imgurId = tag.split('=')[1];
        if (imgurId) {
          return `https://i.imgur.com/${imgurId}.png`;
        }
      }
    }
  }
  // 2. Fallback to existing logic (embed/facets/blobs)
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
      let blobRef = img.image.ref;
      if (blobRef && typeof blobRef === 'object' && blobRef.$link) {
        blobRef = blobRef.$link;
      } else if (typeof blobRef === 'object' && typeof blobRef.toString === 'function' && blobRef.toString() !== '[object Object]') {
        blobRef = blobRef.toString();
      }
      const userDid = post.author.did;
      imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(userDid)}&cid=${encodeURIComponent(blobRef)}`;
    }
    artworkUrl = imgUrl;
  }
  return artworkUrl;
}

function initWaveSurferEmbed(audioBlobUrl) {
  const container = document.getElementById('embed-waveform');
  if (!container || !window.WaveSurfer) return;
  // Create a simple gradient for waveform
  const canvas = document.createElement('canvas');
  canvas.width = 32; canvas.height = 96;

  // Removed Gradient

  // const ctx = canvas.getContext('2d');
  // const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
  // gradient.addColorStop(0, '#656666');
  // gradient.addColorStop((canvas.height * 0.7) / canvas.height, '#656666');
  // gradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
  // gradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
  // gradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#B1B1B1');
  // gradient.addColorStop(1, '#B1B1B1');

  // Progress gradient
  // const progressGradient = ctx.createLinearGradient(0, 0, 0, canvas.height * 1.35);
  // progressGradient.addColorStop(0, '#EE772F');
  // progressGradient.addColorStop((canvas.height * 0.7) / canvas.height, '#EB4926');
  // progressGradient.addColorStop((canvas.height * 0.7 + 1) / canvas.height, '#ffffff');
  // progressGradient.addColorStop((canvas.height * 0.7 + 2) / canvas.height, '#ffffff');
  // progressGradient.addColorStop((canvas.height * 0.7 + 3) / canvas.height, '#F6B094');
  // progressGradient.addColorStop(1, '#F6B094');

  // Init WaveSurfer
  const wavesurfer = window.WaveSurfer.create({
    container: container,
    backend: 'MediaElement',
    // layout
    height: 96,
    normalize: true,
    responsive: true,
    fillParent: true,
    autoCenter: true,
    scrollParent: false,
    dragToSeek: true,

    // cursor
    cursorColor: 'rgb(255, 0, 0, 0.6)',
    cursorWidth: 3,

    // waveform
    waveColor: 'rgb(147, 196, 253)',
    progressColor: 'rgb(37, 100, 235)',
    barGap: 2,
    barHeight: 1,
    barWidth: 3,
    barRadius: 6,
    barAlign: 'bottom',
  });
  wavesurfer.load(audioBlobUrl);
  // Store instance for play control
  window._embedWavesurfer = wavesurfer;
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

// New functions for meta tags and oEmbed

function updateMetaTags(post, audioBlobUrl, artworkUrl) {
  const postUri = getPostUri();
  const title = post.record?.text || 'Audio Track';
  const artist = post.author?.displayName || post.author?.handle || 'Unknown Artist';
  const fullTitle = `${title} by ${artist}`;
  const description = `Listen to ${title} by ${artist} on SoundSky`;
  const currentUrl = window.location.href;
  const embedUrl = currentUrl;

  // Update Open Graph meta tags
  updateMetaTag('og:title', fullTitle);
  updateMetaTag('og:description', description);
  updateMetaTag('og:url', currentUrl);
  updateMetaTag('og:type', 'music.song');
  if (artworkUrl) {
    updateMetaTag('og:image', artworkUrl);
  }
  if (audioBlobUrl) {
    updateMetaTag('og:audio', audioBlobUrl);
    updateMetaTag('og:audio:type', 'audio/mpeg');
  }

  // Update Twitter Card meta tags
  updateMetaTag('twitter:card', 'player');
  updateMetaTag('twitter:title', fullTitle);
  updateMetaTag('twitter:description', description);
  if (artworkUrl) {
    updateMetaTag('twitter:image', artworkUrl);
  }
  updateMetaTag('twitter:player', embedUrl);
  updateMetaTag('twitter:player:width', '420');
  updateMetaTag('twitter:player:height', '240');

  // Update oEmbed discovery link
  const oembedUrl = `${window.location.origin}/oembed?url=${encodeURIComponent(currentUrl)}`;
  updateOEmbedLinkTag(oembedUrl);

  // Generate and add an oEmbed response to the current page for discovery
  generateOEmbedResponse(currentUrl, fullTitle, description, artworkUrl, 420, 240);
}

function updateMetaTag(property, content) {
  let meta = document.querySelector(`meta[property="${property}"], meta[name="${property}"]`);
  if (!meta) {
    meta = document.createElement('meta');
    if (property.startsWith('og:')) {
      meta.setAttribute('property', property);
    } else {
      meta.setAttribute('name', property);
    }
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', content);
}

function updateOEmbedLinkTag(url) {
  let link = document.querySelector('link[rel="alternate"][type="application/json+oembed"]');
  if (!link) {
    link = document.createElement('link');
    link.setAttribute('rel', 'alternate');
    link.setAttribute('type', 'application/json+oembed');
    link.setAttribute('title', 'SoundSky oEmbed');
    document.head.appendChild(link);
  }
  link.setAttribute('href', url);
}

// Create a simple JSON file for oEmbed response
function generateOEmbedResponse(url, title, description, thumbnailUrl, width, height) {
  const oembedResponse = {
    version: "1.0",
    type: "rich",
    provider_name: "SoundSky",
    provider_url: window.location.origin,
    title: title,
    description: description,
    thumbnail_url: thumbnailUrl,
    thumbnail_width: 400,
    thumbnail_height: 400,
    html: `<iframe src="${url}" width="${width}" height="${height}" frameborder="0" allowtransparency="true" allow="encrypted-media"></iframe>`,
    width: width,
    height: height
  };

  // Since we don't have a backend, we'll make this available for the oembed.html page
  window.oembedResponse = oembedResponse;
  console.log('oEmbed response:', oembedResponse);
}
