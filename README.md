<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/5435b310-9e43-40e6-b125-2cc071099c30" width="600" >
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


## Live Beta
<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/4c93ebcc-5a22-47fb-9c73-d270609658a3" width="100%" >
</a>


> [!WARNING]
> Audio files are stored as blobs. Nobody knows how long they might survive!
