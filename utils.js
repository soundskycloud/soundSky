// Utility functions for SoundSky

let _soundskyBanlistSet = null;

export async function loadBanlist() {
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

export async function isBannedHandle(handle) {
    if (!handle) return false;
    const banlist = await loadBanlist();
    const hash = await sha256Hex(handle.trim().toLowerCase());
    return banlist.has(hash);
}

export async function sha256Hex(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function formatRelativeTime(dateString) {
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

export function getCurrentPdsUrl(agent) {
    // Try to get from agent if possible
    if (agent && agent.service) return agent.service;
    // Fallback to localStorage or default
    return localStorage.getItem('bskyPds') || 'https://bsky.social';
}