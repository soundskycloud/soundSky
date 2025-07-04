// Audio player module for SoundSky

export function initWaveSurfer(audioWaveformId, audioBlobUrl, blobSize) {
    const container = document.getElementById(audioWaveformId);
    console.log('[initWaveSurfer] called', { audioWaveformId, audioBlobUrl, blobSize, container });
    if (container) {
        console.log('[initWaveSurfer] container size', { width: container.offsetWidth, height: container.offsetHeight, style: container.style.cssText });
    } else {
        console.log('[initWaveSurfer] container not found for', audioWaveformId);
    }
    if (!container || !audioBlobUrl) return;
    // Fallback for huge files: use a hidden <audio> element instead of WaveSurfer
    if (blobSize && blobSize > 10 * 1024 * 1024) {
        console.log('File too large for WaveSurfer, using fallback audio player:', blobSize);
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
            if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
            playBtn.onclick = () => {
                document.querySelectorAll('audio.soundsky-fallback-audio').forEach(aud => {
                    if (aud !== fallbackAudio) aud.pause();
                });
                if (fallbackAudio.paused) {
                    fallbackAudio.play();
                    if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                } else {
                    fallbackAudio.pause();
                    if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                }
            };
            fallbackAudio.onended = () => {
                if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
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
            const wavesurfer = window.WaveSurfer.create({
                container: `#${audioWaveformId}`,
                waveColor: '#4F4A85',
                progressColor: '#383351',
                url: audioBlobUrl
            });
            console.log('[initWaveSurfer] WaveSurfer instance created', wavesurfer);
            window.soundskyWavesurfers[audioWaveformId] = wavesurfer;
            // Minimal play button logic
            const playBtn = document.querySelector(`button[data-waveid="${audioWaveformId}"]`);
            if (playBtn) {
                playBtn.onclick = () => {
                    if (wavesurfer.isPlaying()) {
                        wavesurfer.pause();
                    } else {
                        wavesurfer.play();
                    }
                };
            }
        } catch (err) {
            console.log('WaveSurfer initWaveSurfer error:', err);
            if (container) {
                container.innerHTML = '<div class="text-red-500 text-xs mt-2">Audio unavailable or failed to load waveform.</div>';
            }
        }
    }
}

export function setupLazyWaveSurfer(audioWaveformId, userDid, blobRef, blobSize) {
    // No-op for feed/discovery, handled by click. For single post view, can fetch and call initWaveSurfer.
    // Optionally, implement lazy loading if needed.
} 