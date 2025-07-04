// Post rendering module for SoundSky
import { formatRelativeTime } from './utils.js';

export async function renderPostCard({ post, user, audioHtml, options = {}, lexiconRecord = null, soundskyRkey = null, playCount = null, coverUrl = null }) {
    const did = user.did;
    let avatar = user.avatar || `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/@jpeg`;
    let displayTitle = '';
    let displayArtist = '';
    let displayAlbum = '';
    let displayGenre = '';
    let displayYear = '';
    let displayArtworkUrl = '';
    let displayAudioBlob = null;
    let displayAudioSize = null;
    let displayText = '';
    let displayMetadata = {};
    let isLexicon = false;
    if (lexiconRecord) {
        isLexicon = true;
        displayTitle = lexiconRecord.metadata?.title || '';
        displayArtist = lexiconRecord.metadata?.artist || '';
        displayAlbum = lexiconRecord.metadata?.album || '';
        displayGenre = lexiconRecord.metadata?.genre || '';
        displayYear = lexiconRecord.metadata?.year || '';
        displayMetadata = lexiconRecord.metadata || {};
        if (lexiconRecord.artwork && lexiconRecord.artwork.ref) {
            const blobRef = lexiconRecord.artwork.ref && lexiconRecord.artwork.ref.$link ? lexiconRecord.artwork.ref.$link : lexiconRecord.artwork.ref;
            displayArtworkUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(blobRef)}`;
        }
        if (lexiconRecord.audio && lexiconRecord.audio.ref) {
            displayAudioBlob = lexiconRecord.audio.ref && lexiconRecord.audio.ref.$link ? lexiconRecord.audio.ref.$link : lexiconRecord.audio.ref;
            displayAudioSize = lexiconRecord.audio.size;
        }
        if (typeof playCount !== 'number') {
            playCount = 0;
        }
    } else {
        displayText = post.record?.text || '';
        displayTitle = displayText.split('\n')[0].slice(0, 100);
        displayArtist = user.displayName || user.handle || 'Unknown';
        // Legacy artwork logic
        let embed = post.record && post.record.embed;
        let images = [];
        if (embed && embed.$type === 'app.bsky.embed.recordWithMedia' && embed.media && embed.media.images && Array.isArray(embed.media.images)) {
            images = embed.media.images;
        } else if (embed && embed.$type === 'app.bsky.embed.file' && embed.images && Array.isArray(embed.images)) {
            images = embed.images;
        }
        if (images.length > 0) {
            const img = images[0];
            let imgUrl = '';
            if (img.image && img.image.ref) {
                const blobRef = img.image.ref && img.image.ref.$link ? img.image.ref.$link : img.image.ref;
                imgUrl = `https://bsky.social/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(blobRef)}`;
            }
            displayArtworkUrl = imgUrl;
        }
    }
    // For legacy: check for Imgur tag
    if (!isLexicon && !displayArtworkUrl) {
        const tags = post.record && post.record.tags;
        let soundskyImgId = null;
        if (tags && Array.isArray(tags)) {
            for (const tag of tags) {
                if (typeof tag === 'string' && tag.startsWith('soundskyimg=')) {
                    soundskyImgId = tag.split('=')[1];
                    break;
                }
            }
        }
        if (soundskyImgId) {
            displayArtworkUrl = `https://i.imgur.com/${soundskyImgId}.png`;
        }
    }
    // Constrain cover size for all posts
    let artworkHtml = '';
    if (displayArtworkUrl) {
        artworkHtml = `<div class=\"mb-2\"><img src=\"${displayArtworkUrl}\" alt=\"Artwork\" class=\"soundsky-cover-img max-h-24 max-w-24 min-h-24 min-w-24 rounded-lg object-contain mx-auto\" style=\"max-width:96px;max-height:96px;background:#f3f4f6;\" loading=\"lazy\" onerror=\"this.onerror=null;this.src='/favicon.ico';\"></div>`;
    } else {
        artworkHtml = `<div class=\"mb-2\"><img src=\"/favicon.ico\" alt=\"Artwork\" class=\"soundsky-cover-img max-h-24 max-w-24 min-h-24 min-w-24 rounded-lg object-contain mx-auto\" style=\"max-width:96px;max-height:96px;background:#f3f4f6;\" loading=\"lazy\"></div>`;
    }
    // --- Player HTML ---
    let audioPlayerHtml = '';
    let waveformId = options.lazyWaveformId || `waveform-${post.cid || post.rkey}`;
    if (isLexicon && waveformId && displayAudioBlob) {
        audioPlayerHtml = `
          <div class=\"flex items-center gap-2 mt-3 audioplayerbox\">${artworkHtml}
            <button class=\"wavesurfer-play-btn soundsky-play-btn\" data-waveid=\"${waveformId}\" data-post-uri=\"${post.uri}\" data-did=\"${did}\" data-soundskyid=\"${soundskyRkey ? soundskyRkey : ''}\" data-lexicon=\"true\">\n          <svg class=\"wavesurfer-play-icon\" width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\">\n            <circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#3b82f6\"/>\n            <polygon class=\"play-shape\" points=\"11,9 21,14 11,19\" fill=\"white\"/>\n          </svg>\n        </button>\n        <div id=\"${waveformId}\" class=\"wavesurfer waveform flex-1 h-12 relative soundsky-waveform-placeholder\">\n          <div class=\"soundsky-placeholder-content\">
            <i class=\"fa fa-chart-simple\"></i>\n            <span>play to load</span>\n          </div>\n        </div>\n      </div>\n    `;
    } else if (audioHtml) {
        audioPlayerHtml = `${artworkHtml}${audioHtml}`;
    } else if (waveformId) {
        audioPlayerHtml = `
          <div class=\"flex items-center gap-2 mt-3 audioplayerbox\">${artworkHtml}
            <button class=\"wavesurfer-play-btn soundsky-play-btn\" data-waveid=\"${waveformId}\" data-post-uri=\"${post.uri}\">\n              <svg class=\"wavesurfer-play-icon\" width=\"28\" height=\"28\" viewBox=\"0 0 28 28\" fill=\"none\">\n                <circle cx=\"14\" cy=\"14\" r=\"14\" fill=\"#3b82f6\"/>\n                <polygon class=\"play-shape\" points=\"11,9 21,14 11,19\" fill=\"white\"/>\n              </svg>\n                                    </button>\n            <div id=\"${waveformId}\" class=\"wavesurfer waveform flex-1 h-12 relative soundsky-waveform-placeholder\">\n              <div class=\"soundsky-placeholder-content\">\n                <i class=\"fa fa-chart-simple\"></i>\n                <span>play to load</span>\n                </div>\n            </div>\n        </div>\n    `;
    }
    // --- Title Row ---
    let titleRowHtml = '';
    if (isLexicon) {
        if (displayArtist && displayTitle) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayArtist}: <span class=\"font-normal\">${displayTitle}</span></a>`;
        } else if (displayTitle) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayTitle}</a>`;
        } else if (displayArtist) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayArtist}</a>`;
        }
    } else {
        if (displayTitle || displayArtist) {
            titleRowHtml = `<a href="#" class="post-title-link font-bold text-lg text-gray-900 dark:text-white mt-1 mb-1" data-post-uri="${post.uri}">${displayTitle}${displayArtist ? ' <span class=\"text-gray-500 font-normal\">by ' + displayArtist + '</span>' : ''}</a>`;
        }
    }
    // --- Social Buttons ---
    const likeCount = post.likeCount || 0;
    const liked = post.viewer && post.viewer.like;
    const reposted = post.viewer && post.viewer.repost;
    const repostCount = post.repostCount || 0;
    const commentCount = post.replyCount || 0;
    const likeBtnHtml = `<button class=\"like-post-btn flex items-center space-x-1 text-sm ${liked ? 'text-blue-500' : 'text-gray-500 hover:text-blue-500'}\" data-uri=\"${post.uri}\" data-cid=\"${post.cid}\" data-liked=\"${!!liked}\" data-likeuri=\"${liked ? liked : ''}\"><i class=\"${liked ? 'fas' : 'far'} fa-heart\"></i><span>${likeCount}</span></button>`;
    const repostBtnHtml = `<button class=\"repost-post-btn flex items-center space-x-1 text-sm ${reposted ? 'text-green-500' : 'text-gray-500 hover:text-green-500'}\" data-uri=\"${post.uri}\" data-cid=\"${post.cid}\" data-reposted=\"${!!reposted}\" data-reposturi=\"${reposted ? reposted : ''}\"><i class=\"fa fa-retweet\"></i><span>${repostCount}</span></button>`;
    const commentBtnHtml = `<button class=\"comment-post-btn flex items-center space-x-1 text-sm text-gray-500 hover:text-purple-500\" data-post-uri=\"${post.uri}\"><i class=\"fa fa-comment\"></i><span>${commentCount}</span></button>`;
    // --- Share button for embed link ---
    const embedUrl = `/embed/?url=${encodeURIComponent(post.uri)}`;
    const shareBtnHtml = `<button class=\"share-post-btn flex items-center space-x-1 text-sm text-gray-400 hover:text-blue-500\" data-shareurl=\"${embedUrl}\" title=\"Copy embed link\"><i class=\"fa fa-share-nodes\"></i></button>`;
    // --- Debug button ---
    let debugUrl = '';
    let soundskyRkeyFinal = null;
    const tags = post.record && post.record.tags;
    if (tags && Array.isArray(tags)) {
        for (const tag of tags) {
            if (typeof tag === 'string' && tag.startsWith('soundskyid=')) {
                soundskyRkeyFinal = tag.split('=')[1];
                break;
            }
        }
    }
    if (soundskyRkeyFinal) {
        debugUrl = `https://www.atproto-browser.dev/at/${user.did}/cloud.soundsky.audio/${soundskyRkeyFinal}`;
    } else {
        const uriParts = String(post.uri).replace('at://', '').split('/');
        if (uriParts.length === 3) {
            const did = uriParts[0];
            const collection = uriParts[1];
            const rkey = uriParts[2];
            debugUrl = `https://www.atproto-browser.dev/at/${did}/${collection}/${rkey}`;
        }
    }
    const debugBtnHtml = `<a href="${debugUrl}" target="_blank" class="ml-2 text-gray-400 hover:text-red-500" title="Debug in atproto-browser"><i class="fa fa-bug"></i></a>`;
    let deleteBtnHtml = '';
    if (window.agent && window.agent.session && window.agent.session.did && user.did === window.agent.session.did) {
        deleteBtnHtml = `<button class=\"delete-post-btn flex items-center space-x-1 text-sm text-red-500 hover:text-red-700\" data-uri=\"${post.uri}\" title=\"Delete post\"><i class=\"fa fa-trash\"></i></button>`;
    }
    // --- Play Counter UI ---
    let playCounterHtml = '';
    if (isLexicon) {
        playCounterHtml = `<div class=\"soundsky-playcount-row flex items-center text-gray-700 mr-3\"><i class=\"fa fa-play\"></i><span class=\"ml-1\">${playCount}</span></div>`;
    } else {
        playCounterHtml = `<img src=\"https://counterapi.com/counter.svg?key=${post.cid}&action=play&ns=soundskycloud&color=ff0000&label=Plays&readOnly=false\" class=\"mr-3\">`;
    }
    // --- Render ---
    return `
        <div class=\"bg-white dark:bg-gray-900 rounded-xl shadow-sm overflow-hidden post-card transition duration-200 ease-in-out\" data-post-uri=\"${String(post.uri)}\">\n            <div class=\"p-4\">\n                <div class=\"flex items-start\">\n                    <img class=\"h-10 w-10 rounded-full\" src=\"${avatar}\" alt=\"${user.handle}\" onerror=\"this.onerror=null;this.src='/favicon.ico';\">\n                    <div class=\"ml-3 flex-1\">
                        <div class=\"flex items-center\">\n                            <button class=\"artist-link font-medium text-gray-900 dark:text-gray-100 hover:underline\" data-did=\"${did}\">${user.displayName || user.handle || 'Unknown'}</button>\n                            <span class=\"mx-1 text-gray-500 dark:text-gray-400\">·</span>\n                            <span class=\"text-sm text-gray-500 dark:text-gray-400\">${formatRelativeTime(post.indexedAt)}<\/span>\n                        <\/div>\n                        ${titleRowHtml}\n                        ${audioPlayerHtml}\n                        <div class=\"mt-3 flex items-center space-x-3\">\n                            ${playCounterHtml}\n                            ${likeBtnHtml}\n                            ${repostBtnHtml}\n                            ${commentBtnHtml}\n                            ${shareBtnHtml}\n                            ${debugBtnHtml}\n                            ${deleteBtnHtml}\n                        <\/div>\n                    <\/div>\n                <\/div>\n            <\/div>\n        <\/div>\n    `;
} 