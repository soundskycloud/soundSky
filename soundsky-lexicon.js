// soundsky-lexicon.js
// Helpers for SoundSky custom lexicon integration
// See: https://gist.github.com/lmangani/fbe15a8507e55b9f901452820ea99075

/**
 * Upload an audio post using the custom lexicon (cloud.soundsky.audio)
 * @param {BskyAgent} agent - The authenticated ATProto agent
 * @param {Object} opts - { audioFile, artworkFile, caption, metadata }
 * @returns {Promise<{success: boolean, uri?: string, error?: string}>}
 */
export async function uploadSoundSkyAudio(agent, { audioFile, artworkFile, caption = '', metadata = {} }) {
  try {
    if (!audioFile) throw new Error('No audio file provided');
    // Upload audio blob
    const audioBlobRes = await agent.uploadBlob(audioFile, audioFile.type);
    const audioBlob = audioBlobRes.data.blob;
    // Optionally upload artwork
    let artworkBlob = null;
    if (artworkFile) {
      const artworkBlobRes = await agent.uploadBlob(artworkFile, artworkFile.type);
      artworkBlob = artworkBlobRes.data.blob;
    }
    // Compose record
    const now = new Date().toISOString();
    const record = {
      text: caption || metadata.title || 'Untitled',
      audio: audioBlob,
      createdAt: now,
      ...(artworkBlob ? { artwork: artworkBlob } : {}),
      ...(metadata ? { metadata } : {})
    };
    // Create the custom record
    const res = await agent.api.com.atproto.repo.createRecord({
      collection: 'cloud.soundsky.audio',
      repo: agent.session.did,
      record
    });
    return { success: true, uri: res.data.uri };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Fetch SoundSky audio posts using the custom lexicon
 * @param {BskyAgent} agent
 * @param {Object} opts - { mode, cursor, limit }
 * @returns {Promise<{success: boolean, posts?: any[], error?: string}>}
 */
export async function fetchSoundSkyPosts(agent, { mode = 'home', cursor = null, limit = 50 } = {}) {
  try {
    // For now, fetch all records of type cloud.soundsky.audio for the current user
    // (You may want to expand this to fetch from others, or use a feed generator)
    const did = agent.session.did;
    const res = await agent.api.com.atproto.repo.listRecords({
      repo: did,
      collection: 'cloud.soundsky.audio',
      limit,
      ...(cursor ? { cursor } : {})
    });
    return { success: true, posts: res.data.records };
  } catch (err) {
    return { success: false, error: err.message || String(err) };
  }
}

/**
 * Fetch a single SoundSky lexicon record by AT URI or by DID and rkey
 * @param {BskyAgent} agent
 * @param {Object} opts - { uri, did, rkey }
 * @returns {Promise<{success: boolean, record?: any, error?: string}>}
 */
export async function fetchSoundSkyRecord(agent, { uri, did, rkey }) {
  try {
    let repo, collection, key;
    if (uri) {
      // Parse AT URI: at://did/collection/rkey
      const parts = uri.replace('at://', '').split('/');
      repo = parts[0];
      collection = parts[1];
      key = parts[2];
    } else if (did && rkey) {
      repo = did;
      collection = 'cloud.soundsky.audio';
      key = rkey;
    } else {
      throw new Error('Must provide either uri or did and rkey');
    }
    let res;
    try {
      res = await agent.api.com.atproto.repo.getRecord({ repo, collection, rkey: key });
    } catch (err) {
      throw err;
    }
    if (res && res.success && res.data && res.data.value) {
      return { success: true, record: res.data.value };
    } else {
      return { success: true, record: undefined };
    }
  } catch (err) {
    console.error('[SoundSky] fetchSoundSkyRecord error:', err);
    return { success: false, error: err.message || String(err) };
  }
} 
