<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/5435b310-9e43-40e6-b125-2cc071099c30" width="600" >
</a>

## SoundSky ☁️
> ATProto/bsky based Soundcloud Alternative for Indie Music Makers

**sounSky** is a very simple browser _client-side_ bsky client specialized for audio and music. It allows uploading, sharing and discovering music posted on bluesky with a dedicated interface. All data is stored on the users's PDS without any external dependency. 

**soundSky** has no servers. New _soundSkies_ can be created by forking this repository and serving its contents, anywhere.

#### Status
👉 Login with bsky at [soundsky.cloud](https://soundsky.cloud)<br>
🔥 Experimental! Please report issues<br>

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
  <img src="https://github.com/user-attachments/assets/f469ba56-8470-4164-8ee6-1f58e99bbd29" width="600" >
</a>


> [!WARNING]
> Audio files are stored as blobs. Nobody knows how long they might survive!
