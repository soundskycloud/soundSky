// Post rendering module for SoundSky
import { formatRelativeTime } from './utils.js';
// Import agent if needed, or pass as argument if refactoring later

export async function renderPostCard({ post, user, audioHtml, options = {}, lexiconRecord = null, soundskyRkey = null, playCount = null }) {
    // --- Artwork ---
    let coverUrl = '';
    if (lexiconRecord && lexiconRecord.artwork && lexiconRecord.artwork.ref) {
        const blobRef = lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.toString ? lexiconRecord.artwork.ref.toString() : lexiconRecord.artwork.ref;
        coverUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(user.did)}&cid=${encodeURIComponent(blobRef)}`;
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
    let playBtnHtml = '';
    if (lexiconRecord && lexiconRecord.audio && lexiconRecord.audio.ref) {
        const blobRef = lexiconRecord.audio.ref && lexiconRecord.audio.ref.toString ? lexiconRecord.audio.ref.toString() : lexiconRecord.audio.ref;
        playBtnHtml = `<button class="soundsky-play-btn" data-did="${user.did}" data-blob="${blobRef}" title="Play">
            <i class="fas fa-play"></i>
        </button>`;
    }
    // --- Play Count (for lexicon posts) ---
    let playCountHtml = '';
    if (typeof playCount === 'number') {
        playCountHtml = `<div class="soundsky-playcount-row text-xs text-gray-400 mt-1">Plays: <span class="ml-1">${playCount}</span></div>`;
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
                    ${coverUrl ? `<img src="${coverUrl}" alt="cover" style="width:96px;height:96px;object-fit:cover;border-radius:12px;">` : `<img src="/favicon.ico" alt="cover" style="width:96px;height:96px;object-fit:cover;border-radius:12px;">`}
                </div>
                <div class="flex-1 min-w-0">
                    <div class="text-lg font-bold mb-1 post-title-link" data-post-uri="${post.uri}" style="cursor:pointer;">${title || 'Untitled'}</div>
                    <div class="text-sm text-gray-500 mb-2">${artist}</div>
                    <div class="flex items-center gap-2 mb-2">
                        ${playBtnHtml}
                        ${playCountHtml}
                    </div>
                    ${audioHtml || ''}
                </div>
            </div>
        </div>
    </div>
    `;
} 