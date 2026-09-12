# BALLPOINT BREACH completion contract

The project is complete only when each item below has direct build, runtime, screenshot, or automated-test evidence.

## Runtime and controls

- Start screen opens before pointer lock.
- Click starts or resumes pointer lock; Escape pauses and releases it.
- WASD movement, Shift sprint, Space jump, grounded collision, step climbing, air control, and fall reset work.
- Camera includes restrained head bob, landing response, recoil spring, sway, and damage feedback.
- Defeat and victory both offer a working restart.

## Weapons

- Slots 1–5 and mouse wheel switch among rifle, shotgun, revolver, sniper, and katana with guarded state transitions.
- Rifle: 30-round automatic fire, compact square holo, ADS.
- Shotgun: 6-round multi-ray shot, pump delay, close knockback, fast barricade damage.
- Revolver: 6 rounds, accurate high damage, strong controlled recoil.
- Sniper: 5 rounds, bolt delay, FOV near 24 and circular scope overlay.
- Katana: short arc slash, held block, finite stamina, correctly timed projectile reflection.
- Fire-rate, ammo, reload, recoil, muzzle flash, hit marker, wall impact and enemy ink response work for every applicable weapon.

## Arena and enemies

- Arena includes a four-level scaffold, two windowed buildings, multiple stairs, elevated walks, crane, roof platforms, pipes, crates, orange breakable barricades, ledges, 12+ enemy spawns, and 6+ supply points.
- Ground and wall collision is stable; vertical routes connect rather than terminate in excessive dead ends.
- Grunt, Rusher, Heavy, and Marksman use readable procedural bodies and state-driven seek/strafe/attack/stagger/death behaviour.
- Enemies use LOS checks, cooldowns, separation, headshots, knockback, fall death, resource cleanup, and can traverse the waypoint graph.

## Waves and boss

- Five escalating waves advance without manual intervention or stuck counts.
- Intermission shows a wave-clear card and restores moderate health/ammo.
- Wave 5 announces and spawns THE DOODLER.
- Boss has charge, pencil sweep, slam, thrown projectile, summon, stagger, telegraphs, and a faster half-health phase.
- Boss death produces victory and restart works.

## Visual, UI and performance

- Cream screen-space paper, approximately 60–62 px blue rules, 7% red margin, subtle grain, handwritten HUD.
- Procedural geometry only; no downloaded 3D models or texture packs.
- Shared blue outlines and a four-band `gl_FragCoord` cross-hatch shader visibly unify arena, weapons, and characters.
- Red damage/enemy ink, orange construction/breakables, and green supplies remain sparse accents.
- Score, HP, ammo, weapon list, wave, enemies left, contextual tips, block meter, scope and boss bar stay legible at 1280×720 and 1920×1080.
- Effects are pooled or bounded; a 15–20 enemy stress run has no unbounded object growth and remains responsive.
- `npm test` and `npm run build` pass; browser console has no sustained errors.
- README documents installation, port 8901, controls, architecture, and shader design.
