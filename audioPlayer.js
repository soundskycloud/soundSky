// Audio player module for SoundSky

// Helper: fetch audio as ArrayBuffer from Blob URL
async function fetchArrayBufferFromBlobUrl(blobUrl) {
    const resp = await fetch(blobUrl);
    if (!resp.ok) throw new Error('Failed to fetch audio for waveform');
    return await resp.arrayBuffer();
}

export async function initWaveSurfer(audioWaveformId, audioBlobUrl, blobSize, _attempt = 0) {
    const container = document.getElementById(audioWaveformId);
    if (!container || !audioBlobUrl) return;
    // Wait until container is visible and has non-zero size
    if ((container.offsetWidth === 0 || container.offsetHeight === 0) && _attempt < 10) {
        setTimeout(() => initWaveSurfer(audioWaveformId, audioBlobUrl, blobSize, _attempt + 1), 60);
        return;
    }
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
            if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
            playBtn.onclick = () => {
                // Pause all other players
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
                backend: 'WebAudio', // Use WebAudio for waveform rendering
                height: 96,
                normalize: false,
                responsive: true,
                fillParent: true,
                autoCenter: true,
                scrollParent: false,
                dragToSeek: true,
                cursorColor: 'rgb(255, 0, 0, 0.6)',
                cursorWidth: 3,
                waveColor: 'rgb(147, 196, 253)',
                progressColor: 'rgb(37, 100, 235)',
                barGap: 2,
                barHeight: 1,
                barWidth: 3,
                barRadius: 6,
                barAlign: 'bottom',
            });
            // --- NEW: Load as ArrayBuffer for WebAudio backend ---
            const arrayBuffer = await fetchArrayBufferFromBlobUrl(audioBlobUrl);
            await wavesurfer.load(arrayBuffer);
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
                        if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                    } else {
                        wavesurfer.play();
                        if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
                        // Play count logic can be added here if needed
                    }
                };
                wavesurfer.on('finish', () => {
                    if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                });
                wavesurfer.on('pause', () => {
                    if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><polygon class="play-shape" points="11,9 21,14 11,19" fill="white"/>`;
                });
                wavesurfer.on('play', () => {
                    if (svg) svg.innerHTML = `<circle cx="14" cy="14" r="14" fill="#3b82f6"/><rect x="12" y="10" width="2.5" height="8" rx="1" fill="white"/><rect x="16" y="10" width="2.5" height="8" rx="1" fill="white"/>`;
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

export function setupLazyWaveSurfer(audioWaveformId, userDid, blobRef, blobSize) {
    // No-op for feed/discovery, handled by click. For single post view, can fetch and call initWaveSurfer.
    // Optionally, implement lazy loading if needed.
} 