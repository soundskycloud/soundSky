// Feed/discovery module for SoundSky
// NOTE: Real-time updates are possible via Jetstream:
//   wss://jetstream.fire.hose.cam/subscribe?wantedCollections=cloud.soundsky.audio
// See: https://github.com/bluesky-social/jetstream
// This can be implemented in the future for live feed updates.
import { loadBanlist, sha256Hex } from './utils.js';
import { fetchSoundSkyRecord, fetchSoundSkyPosts } from './soundsky-lexicon.js';

// --- Utility: Robustly extract blob ref string from ATProto blob objects ---
function extractBlobRef(ref) {
    if (!ref) return '';
    if (typeof ref === 'object' && ref.$link) return ref.$link;
    if (typeof ref === 'string') return ref;
    // If we get here, log and return empty string
    console.error('[extractBlobRef] Invalid blob ref structure:', ref);
    return '';
}

export function setActiveNav(id) {
    document.querySelectorAll('#nav-feed, #nav-discover', '#nav-likes').forEach(el => {
        el.classList.remove('bg-blue-500', 'text-white');
        el.classList.add('text-gray-700');
    });
    const active = document.getElementById(id);
    if (active) {
        active.classList.add('bg-blue-500', 'text-white');
        active.classList.remove('text-gray-700');
    }
}

export async function appendAudioPostCard(record, feedGen, agent, renderPostCard, feedContainer, banlist) {
    // Banlist check: skip if author is banned
    const handle = record.metadata?.artist?.toLowerCase() || '';
    if (handle && banlist && banlist.has(await sha256Hex(handle))) return;
    // Strictly extract audio and artwork CIDs
    let audioCid = extractBlobRef(record.audio?.ref);
    if (!audioCid && record.audio) {
        console.error('[appendAudioPostCard] Missing audioCid (.ref.$link) for record', { record });
    }
    let artworkCid = extractBlobRef(record.artwork?.ref);
    if (!artworkCid && record.artwork) {
        console.error('[appendAudioPostCard] Missing artworkCid (.ref.$link) for record', { record });
    }
    // Render post card (all features preserved)
    const cardHtml = await renderPostCard({
        post: { uri: record.uri, cid: record.cid, record, author: { did: record.did || record.repo } },
        user: { did: record.did || record.repo, handle: handle },
        audioHtml: '',
        options: { lazyWaveformId: `waveform-${record.cid || record.rkey}` },
        lexiconRecord: record.record || record,
        soundskyRkey: record.rkey,
        playCount: record.stats?.plays || 0,
        audioCid,
        artworkCid
    });
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = cardHtml;
    const cardEl = tempDiv.firstElementChild;
    feedContainer.appendChild(cardEl);
    // TODO: Setup play button, comments, etc. as in main.js
}

export async function fetchSoundskyFeed({ append = false, mode = 'home', q = false, agent, renderPostCard, feedContainer } = {}) {
    const banlist = await loadBanlist();
    let records = [];
    let error = null;
    if (mode === 'home') {
        // Fetch current user's posts
        const res = await fetchSoundSkyPosts(agent, { limit: 50 });
        if (res.success) records = res.posts;
    } else if (mode === 'discover' || (mode === 'search' && !q)) {
        // Global discovery: fetch from UFOs-API
        try {
            const resp = await fetch('https://ufos-api.microcosm.blue/records?collection=cloud.soundsky.audio&limit=50');
            if (!resp.ok) throw new Error('Failed to fetch global SoundSky records');
            records = await resp.json();
        } catch (e) {
            error = e.message || String(e);
        }
    } else if (mode === 'search' && q) {
        // Search: fetch all, filter by title/artist/metadata
        try {
            const resp = await fetch('https://ufos-api.microcosm.blue/records?collection=cloud.soundsky.audio&limit=200');
            if (!resp.ok) throw new Error('Failed to fetch global SoundSky records');
            let allRecords = await resp.json();
            records = allRecords.filter(r => {
                const meta = r.record?.metadata || {};
                return (
                    (meta.title && meta.title.toLowerCase().includes(q.toLowerCase())) ||
                    (meta.artist && meta.artist.toLowerCase().includes(q.toLowerCase())) ||
                    (meta.album && meta.album.toLowerCase().includes(q.toLowerCase()))
                );
            });
        } catch (e) {
            error = e.message || String(e);
        }
    }
    // Show error if needed
    if (error) {
        feedContainer.innerHTML = `<div class='text-center text-red-500 py-8'>${error}</div>`;
        return;
    }
    // Render all records
    feedContainer.innerHTML = '';
    for (const record of records) {
        await appendAudioPostCard(record, 0, agent, renderPostCard, feedContainer, banlist);
    }
    // TODO: Add Load More button if pagination supported
}

export async function renderFeed(records, { showLoadMore = false, agent, renderPostCard, feedContainer } = {}) {
    const banlist = await loadBanlist();
    feedContainer.innerHTML = '';
    for (const record of records) {
        await appendAudioPostCard(record, 0, agent, renderPostCard, feedContainer, banlist);
    }
    // TODO: Add Load More button if pagination supported
} 