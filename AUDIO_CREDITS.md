# Sampled FPS audio

The game uses downloaded sound samples, not oscillators, noise generators, or AI-generated audio. Normal web builds bundle independent short MP3 files. Mini-tool builds compile their bytes into external `audio-data.js`, decode them in memory with Web Audio, and include no audio-file extensions. Neither adapter makes audio fetch/XHR requests, CDN requests, or data/blob media URLs.

## Sources and permissions

- **Chaingun, pistol, rifle, shotgun shots** — Michel Baradari, apollo-music.de. [Source](https://opengameart.org/content/chaingun-pistol-rifle-shotgun-shots), [download](https://opengameart.org/sites/default/files/shots.7z), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Attribution from the pack: “Sounds (c) by Michel Baradari apollo-music.de”. The downloaded `shots/info.txt` confirms this license. The samples remain CC BY 3.0; the code license does not replace their license. No endorsement implied.
- **Fantasy Sound Effects (Tinysized SFX)** — Jan Schupke / Vehicle, vehiclemusic.eu. [Source](https://opengameart.org/content/fantasy-sound-effects-tinysized-sfx), [download](https://opengameart.org/sites/default/files/tinysized.zip), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The author describes these as organic recordings, normalized but otherwise unprocessed.
- **Gun Reload Sound Effects** — Brian MacIntosh / BMacZero. [Source](https://opengameart.org/content/gun-reload-sound-effects), [download](https://opengameart.org/sites/default/files/clipload1.wav), [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

| Game cue | Original file | Use |
| --- | --- | --- |
| Rifle | shots/cg1.wav | Automatic gunshot |
| Shotgun | shots/shotgun.wav | Shotgun shot and mechanism |
| Revolver | shots/pistol.wav | Pistol shot, adapted for the revolver |
| Sniper | shots/rifle.wav | Rifle shot, adapted for the sniper |
| Katana | tube-plastic-whoosh-01.wav | Recorded swing foley |
| Hit | apple-cut-01.wav | Soft impact foley |
| Headshot | wood-twigs-break-01.wav | Sharp impact foley |
| Reload | clipload1.wav | Magazine insertion |
| Hurt | boots-leather-jump-01.wav | Heavy impact foley, not a vocal grunt |
| Wave | metal-hammer-hit-02.wav | Metal announcement cue |
| Boss | sword-clash-01.wav | Metallic warning cue |
| Footstep | boots-leather-step-01.wav | Player movement |
| Landing | mud-steps-03.wav | Player landing |
| Dry fire | scissors-close-01.wav | Empty firearm click |
| Weapon switch | knife-unsheathe-02.wav | Draw / switch foley |
| Pickup | coins-shake-01.wav | Supply collection |
| Enemy fire | shots/pistol.wav | Shortened pistol report, 5.5 kHz low-pass and reduced gain; replaces the former electrical discharge |
| World impact | metal-hammer-hit-01.wav | Bullet and projectile impact |
| Enemy death | cover-paper-tear-01.wav | Paper-character death accent |
| Pump | drawer-close-01.wav | Shotgun pump mechanism |
| Bolt | keyhole-lockbox-turn-01.wav | Sniper bolt mechanism |
| Wave clear | chimes-wood-rattle.wav | Wave completion |
| Melee hit | apple-cut-02.wav | Katana contact |
| Block | sword-clash-02.wav | Katana guard |

Changes: selected excerpts, shortened tails, 40 ms fade-outs, gain reduction, mono conversion, and 44.1 kHz / 96 kbps MP3 encoding. No effect waveform was synthesized. The separate 0.2-second silent `unlock.mp3` is only a user-gesture activation primer, never a game cue.

The mini-tool build excludes that primer. Base64 encoding preserves each prepared MP3 file byte-for-byte; it is packaging, not waveform synthesis. The authors and licenses above apply to the embedded data as well as the original files.

## Rebuilding the audio

Extract `shots.7z` into `sources/guns/` and `tinysized.zip` into `sources/tinysized/`; place `clipload1.wav` in `sources/`. With FFmpeg installed:

```sh
node scripts/prepare-audio.mjs /path/to/sources
```

The script keeps existing prepared files and creates only missing ones. The shipped `public/audio/` directory is sufficient to build and run the game; downloading source packs is optional. Clip durations are defined in `src/audio/clips.ts` and checked by tests.

## Playback and recovery

Click Start to enable audio. The right-side gear opens settings, including a sound toggle and blocked-playback retry. Device media volume still controls audibility. The web adapter reuses at most six unlocked HTML audio elements. The mini-tool adapter uses one AudioContext, cached decoded AudioBuffers, and at most six simultaneous sources. Playback errors are caught. Leaving the page or pausing stops audio; the next game gesture re-unlocks it. The sound preference is saved locally when storage is available. Delayed decode requests are cancelled on pause/mute/disposal and stale shots are dropped instead of played as a backlog.

## Mini-tool build and validation

The uploader confirmed that v6's independent MP3 files are rejected, so do not upload v6. The user reported no sound from v7; v8 established working playback on the user's device after adding optional playback-session routing. v9 keeps that routing, removes the temporary diagnostic UI, and expands the sampled gameplay soundscape.

The mini-tool adapter requests `navigator.audioSession.type = 'playback'` synchronously during activation when that optional API is available. WebKit documents that the default ambient session can respect the iPhone silent switch: [WebKit issue 237322](https://bugs.webkit.org/show_bug.cgi?id=237322). A denied or missing API does not break gameplay. The previous session type is restored when this adapter owns the change and sound is muted, paused or disposed. No microphone permission or undocumented native bridge is used.

The temporary v8 AUDIO CHECK panel and test-sound control are not included in v9. `SOUND · ON/OFF/RETRY` remains the only audio control. Resume and decode operations stay time-bounded; ordinary gameplay sounds expire after 350 ms instead of replaying a stale backlog.

`npm run build:minitool` generates `audio-data.js` as a build asset, inserts its classic deferred script before the app, and disables copying `public/` files into that build. Sources remain in `public/audio/` for normal web builds and reproducible asset compilation. To regenerate only the data after building, use `node scripts/build-audio-data.mjs public/audio dist`.

`node scripts/check-minitool.mjs` checks the actual upload extension allowlist, script order, sample sizes, and byte equality with the original MP3 files. Each sample must be nonempty and at most 100 KiB, with at most 512 KiB total. The Base64 is plain JS data, not a `data:` URI or a renamed MP3.

`scripts/verify-minitool-audio.mjs` tests browser activation, decode/playback, bounded sources, mute, simulated background recovery, the prefixed constructor fallback, and missing-Web-Audio fallback under restrictive CSP and offline file loading. It does not validate Xiaohongshu client policy, real iOS silent-switch behavior, or native speaker output. Upload preview and physical-device testing are still required. If Web Audio is missing, the game remains playable and shows `SOUND · N/A`.
