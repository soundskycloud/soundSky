<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/5435b310-9e43-40e6-b125-2cc071099c30" width="600" >
</a>

## SoundSky ☁️
> ATProto/bsky based Soundcloud Alternative for Indie Music Makers

**sounSky** is a bsky app specialized for audio and music. It allows uploading, sharing and discovering decentralized music posted on bluesky with a familiar dedicated interface. soundSky is AGPLv3 and has no commercial aspects or limitations.

**soundSky** is client-side only has no servers. Parallel _soundSkies_ can be created by serving this repo.

#### Status
👉 Login with bsky at [soundsky.cloud](https://soundsky.cloud)<br>
🔥 Experimental! Please report issues<br>

##### Features
- Infraless: exists on top of [bsky.social](https://bsky.social) auth & blob storage
- Supports Upload, Post & Playback of _(legal)_ MP3 files 
- Discovers Audio content using special _(hidden)_ tags
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
- Images
  - Images stored on imgur are linked in kv tags
  - Image IDs are used to locate posts from covers


## Live Beta
<a href="https://soundsky.cloud">
  <img src="https://github.com/user-attachments/assets/f469ba56-8470-4164-8ee6-1f58e99bbd29" width="600" >
</a>

<br>

> [!WARNING]
> Content Disclaimer

> This app displays media sourced from the Bluesky network. We do not host, store, or control the content shown. All media is retrieved directly from external servers and platforms. As such, we are not responsible for the nature, accuracy, or availability of the content, and we do not have the ability to remove or moderate it. If you encounter content that you believe violates your rights or community standards, please report it directly through the original platform where it is hosted.
