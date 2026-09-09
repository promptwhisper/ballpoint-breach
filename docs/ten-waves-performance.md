# Ten-wave mini-tool update

Original waves 1–5 are preserved. Clearing wave 5 now recovers and continues;
victory occurs only after wave 10. Later waves grow through reinforcement queues
and specialist mixes, not an unlimited number of simultaneous enemies.

| Wave | Total authored enemies | Concurrent spawn cap |
| --- | ---: | ---: |
| 6 | 20 | 12 |
| 7 | 23 | 13 |
| 8 | 26 | 14 |
| 9 | 29 | 15 |
| 10 | 32, including one boss | 16 |

Boss summons retain the existing manager-wide 24-enemy limit. Director spawning
counts summons as active enemies and waits when its own cap is reached.

## Performance work

`ColliderGrid` partitions the fixed arena collision bounds into 8-unit cells.
Movement, ground height, detours, and depenetration retain the exact narrowphase
and original collider order. Enabled flags remain live for breakables and reset.
Rebuild the grid if a future feature moves collider bounds or adds colliders.

`npx tsx scripts/benchmark-queries.ts` performs 12,000 mixed ground/movement
probes per batch against 316 real arena colliders. Five timed batches after
warmup measured a median of 108.15 ms before and 23.54 ms after on this development
machine (about 78% lower query time), with identical accumulated result checksums.
This is a CPU microbenchmark, not a claim about phone FPS.

HUD weapon elements are cached and unchanged text is no longer rewritten each
frame. Reticle, scope, feedback, and gameplay updates remain full-rate. No shader,
texture resolution, or input sensitivity reduction is used for these savings.
