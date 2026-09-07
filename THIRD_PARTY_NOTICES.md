# Third-party notices

## img2threejs

Source: https://github.com/img2threejs/img2threejs at commit
`9fbd0ca5bbcc3b13bebe712745d6784d33db0b85`. Licensed under Apache-2.0. The asset
assessment, procedural specification, build-pass, material, character, rigging, and deterministic
review foundations in this repository are adapted from that project. Apache-licensed source remains
under the repository's Apache-2.0 `LICENSE`.

## video2threejs

Source: https://github.com/cpppppp7/video2threejs at commit
`0b2271768df13edd3bd8319e8d60578364ebb2c0`. Licensed under MIT. The video probe,
frame extraction concepts, spatial fact workflow, camera solver, lighting/live-preview guidance,
motion timeline, user-signal memory, and handoff practices informed the unified Scene Pipeline.
The full MIT notice is preserved at `licenses/video2threejs-MIT.txt`.

No upstream Git metadata, build cache, downloaded model, or upstream repository snapshot is included.

## Sampled sound effects

The local `public/audio/*.mp3` files include gun samples by Michel Baradari
(apollo-music.de), licensed CC BY 3.0, plus CC0 foley by Jan Schupke / Vehicle and
reload audio by Brian MacIntosh / BMacZero. These asset licenses are separate from
the code license. See `AUDIO_CREDITS.md` for source links, exact file mappings,
license links, and modifications. The offline package also includes
`audio/credits.json` so attribution travels with the audio.

Mini-tool builds include these same sample bytes as Base64 in `audio-data.js`
instead of MP3 files. Encoding does not change asset ownership or licensing.
