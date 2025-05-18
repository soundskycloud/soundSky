<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/c32acf81-8f14-48a8-a91f-a3eb5c7c4003" width="100%" >
</a>

## SoundSky ☁️
> ATProto/bsky based Soundcloud Alternative for Indie Music Makers 

#### Status
👉 Live at [soundsky.cloud](https://soundsky.cloud)<br>
🔥 Buggy & Experimental <br>

##### Features
- Infraless: exists on top of [bsky.social](https://bsky.social) auth & blob storage
- Supports Upload, Post & Playback of _(legal)_ MP3 files 
- Discovers Audio content with special tag `#soundskyaudio`
- URL parameters for linking to `artist` and `post`

##### Limitations
- Account
  - Works with any `bsky.social` accounts
  - Works with custom `PDS` - _needs testing!_
- Audio Formats
  - Temporary limited to `mp3` files to avoid abusing PDS storage
  - Max filesize `100mb` by default in most PDS
- Audio Player
  - lazy loading of audio blobs on playback
  - wavesurfer w/ waveform display & navigation
  - fallback to `<audio>` for large files


## Live Demo
<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/e0642e37-58b8-4c49-9499-3e79b80116fa" width="100%" >
</a>


> [!WARNING]
> Audio files are stored as blobs. Nobody knows how long they might survive!
