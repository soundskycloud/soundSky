// Post rendering module for SoundSky
import { formatRelativeTime } from './utils.js';
// Import agent if needed, or pass as argument if refactoring later

export async function renderPostCard({ post, user, audioHtml, options = {}, lexiconRecord = null, soundskyRkey = null, playCount = null, coverUrl = null }) {
    // --- Artwork ---
    let artworkUrl = '';
    if (coverUrl) {
        artworkUrl = coverUrl;
    } else if (lexiconRecord && lexiconRecord.artwork && lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.$link) {
        artworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(lexiconRecord.artwork.ref.$link)}`;
    } else {
        artworkUrl = '/favicon.ico';
    }
    // --- Title and Artist ---
    let title = '';
    let artist = '';
    if (lexiconRecord && lexiconRecord.metadata) {
        title = lexiconRecord.metadata.title || '';
        artist = lexiconRecord.metadata.artist || '';
    } else {
        title = (post.record?.text || '').split('\n')[0].slice(0, 40) || 'Untitled';
        artist = user.displayName || user.handle || '';
    }
    // --- Audio ---
    let audioCid = lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref && lexiconRecord.audio.ref.$link ? lexiconRecord.audio.ref.$link : '';
    // --- Waveform Placeholder ---
    let waveformId = options.lazyWaveformId || `waveform-${post.cid || post.rkey}`;
    // --- Play Button ---
    let playBtnHtml = '';
    if (audioCid) {
        playBtnHtml = `<button class="soundsky-play-btn waveform-play-btn absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 bg-blue-600 text-white rounded-full p-3 shadow-lg hover:bg-blue-700 focus:outline-none transition" data-did="${user.did}" data-blob="${audioCid}" data-waveform-id="${waveformId}" title="Play">
            <i class="fas fa-play"></i>
        </button>`;
    }
    let waveformHtml = `<div id="${waveformId}" class="wavesurfer waveform soundsky-waveform-placeholder relative">
        <div class="soundsky-placeholder-content"><i class="fas fa-wave-square"></i> Waveform will appear here</div>
        ${playBtnHtml}
    </div>`;
    // --- Play Count (for lexicon posts) ---
    let playCountHtml = '';
    if (typeof playCount === 'number') {
        playCountHtml = `<div class="soundsky-playcount-row text-xs text-gray-400 mt-1">Plays: <span class="ml-1">${playCount}</span></div>`;
    }
    // --- Debug/Meta Links ---
    let debugLinksHtml = '';
    if (lexiconRecord) {
        debugLinksHtml = `<div class="soundsky-debug-links text-xs text-gray-400 mt-1">
            <a href="https://bsky.social/profile/${user.did}" target="_blank" class="underline">Profile</a> |
            <a href="https://bsky.social/profile/${user.did}/post/${post.cid || post.rkey}" target="_blank" class="underline">View on Bsky</a> |
            <a href="https://plc.directory/${user.did}" target="_blank" class="underline">DID</a>
        </div>`;
    }
    // --- Post Card HTML ---
    return `
    <div class="post-card bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden transition duration-200 ease-in-out mx-auto mt-1 mb-8" data-post-uri="${post.uri}">
        <div class="p-4">
            <div class="flex items-center mb-2">
                <img src="${user.avatar || '/favicon.ico'}" class="h-10 w-10 rounded-full mr-3" alt="${user.displayName || user.handle}" onerror="this.onerror=null;this.src='/favicon.ico';">
                <div class="flex-1 min-w-0">
                    <span class="font-medium text-gray-900 dark:text-gray-100 artist-link" data-did="${user.did}" style="cursor:pointer;">${user.displayName || user.handle}</span>
                    <div class="text-xs text-gray-500">${formatRelativeTime(post.record?.createdAt || post.createdAt)}</div>
                </div>
            </div>
            <div class="flex flex-col md:flex-row gap-4">
                <div class="flex-shrink-0" style="width:96px;max-width:96px;">
                    <img src="${artworkUrl}" alt="cover" style="width:96px;height:96px;object-fit:cover;border-radius:12px;" onerror="this.onerror=null;this.src='/favicon.ico';">
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-lg font-bold mb-1 post-title-link" data-post-uri="${post.uri}" style="cursor:pointer;">${title || 'Untitled'}</div>
                    <div class="text-sm text-gray-500 mb-2">${artist}</div>
                    <div class="flex items-center gap-2 mb-2">
                        ${playBtnHtml}
                        ${playCountHtml}
                    </div>
                    ${waveformHtml}
                    ${debugLinksHtml}
                </div>
            </div>
        </div>
    </div>
    `;
} 