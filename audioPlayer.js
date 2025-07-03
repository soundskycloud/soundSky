// Audio player module for SoundSky

export function initWaveSurfer(audioWaveformId, audioBlobUrl, blobSize) {
    // Remove any previous instance for this ID
    if (!window.soundskyWavesurfers) window.soundskyWavesurfers = {};
    if (window.soundskyWavesurfers[audioWaveformId]) {
        try { window.soundskyWavesurfers[audioWaveformId].destroy(); } catch {}
        delete window.soundskyWavesurfers[audioWaveformId];
    }
    const container = document.getElementById(audioWaveformId);
    if (!container || !window.WaveSurfer) return;
    // Create WaveSurfer instance
    const wavesurfer = window.WaveSurfer.create({
        container: container,
        backend: 'MediaElement',
        height: 96,
        normalize: true,
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
    wavesurfer.load(audioBlobUrl);
    // Set global volume
    let globalVolume = 1.0;
    if (localStorage.getItem('soundskyVolume')) {
        globalVolume = parseFloat(localStorage.getItem('soundskyVolume'));
        if (isNaN(globalVolume)) globalVolume = 1.0;
    }
    wavesurfer.setVolume(globalVolume);
    // Store instance
    window.soundskyWavesurfers[audioWaveformId] = wavesurfer;
    // Add time/duration overlays if present
    let timeEl = container.parentElement.querySelector('.wavesurfer-time');
    let durationEl = container.parentElement.querySelector('.wavesurfer-duration');
    if (!timeEl) {
        timeEl = document.createElement('span');
        timeEl.className = 'wavesurfer-time';
        timeEl.textContent = '0:00';
        container.appendChild(timeEl);
    }
    if (!durationEl) {
        durationEl = document.createElement('span');
        durationEl.className = 'wavesurfer-duration';
        durationEl.textContent = '0:00';
        container.appendChild(durationEl);
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
    wavesurfer.on('timeupdate', (currentTime) => {
        if (timeEl) timeEl.textContent = formatTime(currentTime);
    });
    // Play/pause on click
    container.onclick = () => {
        if (wavesurfer.isPlaying()) {
            wavesurfer.pause();
        } else {
            // Pause all others
            Object.entries(window.soundskyWavesurfers).forEach(([id, ws]) => {
                if (id !== audioWaveformId && ws && ws.pause) ws.pause();
            });
            wavesurfer.play();
        }
    };
    // Clean up on finish
    wavesurfer.on('finish', () => {
        if (timeEl) timeEl.textContent = durationEl.textContent;
    });
}

export function setupLazyWaveSurfer(audioWaveformId, userDid, blobRef, blobSize) {
    // No-op for feed/discovery, handled by click. For single post view, can fetch and call initWaveSurfer.
    // Optionally, implement lazy loading if needed.
} 