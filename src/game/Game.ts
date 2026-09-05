import * as THREE from 'three';
import { AudioSystem, type GameSound } from '../audio/AudioSystem';
import {
  WEAPON_DEFINITIONS,
  WEAPON_IDS,
  WeaponSystem,
  type KatanaSlashVariant,
  type HitscanRequest,
  type MeleeRequest,
  type MuzzleRequest,
  type PelletsRequest,
  type ReflectRequest,
  type WeaponEffect,
  type WeaponId,
} from '../combat';
import { EffectPool } from '../effects/EffectPool';
import {
  EnemyManager,
  type EnemyDamageType,
  type EnemyEvent,
  type EnemyKind,
  type PlayerDamageEvent,
} from '../enemies';
import { InputManager, type InputFrame } from '../input/InputManager';
import { ArenaBuilder, type EnemySpawnPoint } from '../level';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController } from '../player/PlayerController';
import { Hud, type HudSnapshot } from '../ui/Hud';
import { DEFAULT_WAVES, WaveDirector, type SpawnPointTag, type WaveEvent, type WaveRecovery } from '../waves';
import { ArenaQueries } from './ArenaQueries';
import { GameState, type GameMode } from './GameState';
import { GrappleSystem } from './GrappleSystem';
import { SupplySystem, type SupplyPickupEvent } from './SupplySystem';
import { createGameScene } from './createGameScene';

const BASE_FOV = 68;
const PLAYER_CENTER_HEIGHT = 0.95;
const SHOWCASE_SLASH_TIMES = [1.45, 1.88, 3.45, 3.88, 5.1, 5.53] as const;

export interface GameOptions {
  capture?: boolean;
  stress?: boolean;
  demoAim?: boolean;
  autoplay?: boolean;
  defeat?: boolean;
  damageDemo?: boolean;
  fireDemo?: boolean;
  inkDemo?: boolean;
  showcase?: boolean;
  katanaReviewProgress?: number;
  katanaReviewVariant?: KatanaSlashVariant;
  renderSize?: Readonly<{ width: number; height: number }>;
  reviewView?: 'rear' | 'west';
}

export interface PublicGameSnapshot {
  mode: GameMode;
  score: number;
  wave: number;
  enemies: number;
  playerHealth: number;
  activeWeapon: WeaponId;
  rendererObjects: number;
  effects: ReturnType<EffectPool['getSnapshot']>;
}

function weaponSound(id: Exclude<WeaponId, 'katana'>): GameSound {
  return id;
}

function damageType(id: Exclude<WeaponId, 'katana'>): EnemyDamageType {
  if (id === 'shotgun') return 'shotgun';
  if (id === 'sniper') return 'sniper';
  return 'bullet';
}

function spawnTags(point: EnemySpawnPoint): SpawnPointTag[] {
  const tags: SpawnPointTag[] = [point.elevation === 'ground' ? 'ground' : 'high'];
  if (point.id === 'enemy-spawn-8') tags.push('boss');
  if (point.preferredFor.includes('heavy')) tags.push('covered');
  return tags;
}

function scoreForEnemy(kind: EnemyKind): number {
  const scores: Record<EnemyKind, number> = {
    grunt: 100,
    rusher: 125,
    heavy: 250,
    marksman: 175,
    boss: 2000,
  };
  return scores[kind];
}

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly arena;
  readonly player: PlayerController;
  readonly weapons: WeaponSystem;
  readonly enemies: EnemyManager;
  readonly waves: WaveDirector;

  private readonly state = new GameState();
  private readonly physics: PhysicsWorld;
  private readonly input: InputManager;
  private readonly hud: Hud;
  private readonly audio = new AudioSystem();
  private readonly effects: EffectPool;
  private readonly queries: ArenaQueries;
  private readonly grapple: GrappleSystem;
  private readonly supplies: SupplySystem;
  private readonly raycaster = new THREE.Raycaster();
  private readonly weaponMount = new THREE.Group();
  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3();
  private readonly aimUp = new THREE.Vector3();
  private readonly playerCenter = new THREE.Vector3();
  private readonly temporary = new THREE.Vector3();
  private readonly overlay: HTMLElement;
  private readonly lastHit = new Map<string, { headshot: boolean; time: number; direction?: THREE.Vector3 }>();
  private readonly captureMode: boolean;
  private readonly stressMode: boolean;
  private readonly demoAim: boolean;
  private readonly autoplay: boolean;
  private readonly qaDefeat: boolean;
  private readonly qaDamageDemo: boolean;
  private readonly qaFireDemo: boolean;
  private readonly qaInkDemo: boolean;
  private readonly showcaseMode: boolean;
  private readonly katanaReviewProgress?: number;
  private readonly katanaReviewVariant: KatanaSlashVariant;
  private readonly renderSize?: Readonly<{ width: number; height: number }>;
  private readonly reviewView?: 'rear' | 'west';
  private requestId = 0;
  private previousTime = performance.now();
  private roundStarted = false;
  private capturePlayback = false;
  private smoothedFps = 60;
  private stageUpdateAt = 0;
  private autoplayTimer = 0;
  private defeatTimer = 0;
  private qaDefeatConsumed = false;
  private damageDemoTimer = 0;
  private qaDamageDemoConsumed = false;
  private fireDemoTimer = 0;
  private inkDemoTimer = 0;
  private qaInkDemoConsumed = false;
  private showcaseTimer = 0;
  private showcaseSlashIndex = 0;
  private controlRequest = 0;
  private wasPointerLocked = false;
  private deathFlashTimeout: number | null = null;

  constructor(readonly canvas: HTMLCanvasElement, options: GameOptions = {}) {
    this.captureMode = options.capture ?? false;
    this.stressMode = options.stress ?? false;
    this.demoAim = options.demoAim ?? false;
    this.autoplay = options.autoplay ?? false;
    this.qaDefeat = options.defeat ?? false;
    this.qaDamageDemo = options.damageDemo ?? false;
    this.qaFireDemo = options.fireDemo ?? false;
    this.qaInkDemo = options.inkDemo ?? false;
    this.showcaseMode = options.showcase ?? false;
    this.katanaReviewProgress = options.katanaReviewProgress;
    this.katanaReviewVariant = options.katanaReviewVariant ?? 'forward';
    this.renderSize = options.renderSize;
    this.reviewView = options.reviewView;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.captureMode,
    });
    this.renderer.setPixelRatio(this.captureMode ? 1 : Math.min(window.devicePixelRatio, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = false;

    this.scene = createGameScene();
    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.025, 150);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.arena = new ArenaBuilder().build();
    this.scene.add(this.arena.root);
    this.arena.syncColliderBounds();
    this.physics = new PhysicsWorld(this.arena.colliders);
    this.player = new PlayerController(this.camera, this.physics, this.arena.safePlayerSpawn);
    this.input = new InputManager(canvas);
    this.hud = new Hud();
    this.effects = new EffectPool(this.scene);
    this.queries = new ArenaQueries(this.arena);

    this.enemies = new EnemyManager(this.scene, {
      getPlayer: () => ({
        position: this.getPlayerCenter(),
        velocity: this.player.body.velocity,
        radius: 0.48,
        alive: this.player.health > 0,
      }),
      hasLineOfSight: (from, to) => this.queries.hasLineOfSight(from, to),
      resolveMovement: (enemy, proposed) => this.resolveEnemyMovement(enemy, proposed),
      groundHeight: (position, enemy) => this.queries.groundHeight(position, enemy),
      navigationTarget: (enemy, target) => this.queries.navigationTarget(enemy, target),
      isProjectileBlocked: (from, to) => this.queries.segmentBlocked(from, to),
      onPlayerDamage: (event) => this.handlePlayerDamage(event),
      onEvent: (event) => this.handleEnemyEvent(event),
      fallDeathY: this.arena.killY,
      maxEnemies: 24,
      bossSummonPoints: this.arena.enemySpawnPoints
        .filter((point) => point.elevation === 'ground')
        .map((point) => point.position),
    });

    this.weapons = new WeaponSystem({
      baseFov: BASE_FOV,
      callbacks: {
        onHitscan: (request) => this.handleHitscan(request),
        onPellets: (request) => this.handlePellets(request),
        onMelee: (request) => this.handleMelee(request),
        onReflect: (request) => this.handleReflection(request),
        onMuzzle: (request) => this.handleMuzzle(request),
        onEffect: (effect) => this.handleWeaponEffect(effect),
        onWeaponChanged: (_id, slot) => this.hud.showTip(`weapon ${slot} ready`, 1.05),
      },
    });
    // Keep every stock safely in front of the near plane. The extra mount is a
    // deliberate first-person projection transform, separate from weapon animation.
    this.weaponMount.name = 'first-person-viewmodel-mount';
    this.weaponMount.position.set(0.35, -0.19, -0.8);
    this.weaponMount.scale.setScalar(0.72);
    this.camera.add(this.weaponMount);
    this.weaponMount.add(this.weapons.viewmodelRoot);
    this.weaponMount.traverse((object) => object.layers.set(1));
    this.grapple = new GrappleSystem(this.camera, this.player, this.arena, this.enemies, this.effects);
    this.supplies = new SupplySystem(this.arena, (event) => this.handleSupply(event));

    this.waves = new WaveDirector({
      spawnPoints: this.arena.enemySpawnPoints.map((point) => ({
        id: point.id,
        position: point.position,
        tags: spawnTags(point),
        weight: point.elevation === 'ground' ? 1.1 : 0.9,
      })),
      spawnEnemy: (kind, position) => this.enemies.spawn(kind, position),
      getActiveEnemyCount: () => this.enemies.livingCount,
      getPlayerPosition: () => this.player.body.position,
      clearEnemies: () => this.enemies.reset(),
      onEvent: (event) => this.handleWaveEvent(event),
      onRecovery: (recovery) => this.handleRecovery(recovery),
      definitions: this.autoplay
        ? DEFAULT_WAVES.map((definition) => ({ ...definition, spawnInterval: 0.025 }))
        : undefined,
      announcementDuration: this.autoplay ? 0.06 : undefined,
      intermissionDuration: this.autoplay ? 0.08 : undefined,
    });

    const overlay = document.querySelector<HTMLElement>('#game-overlay');
    if (!overlay) throw new Error('Missing #game-overlay');
    this.overlay = overlay;
    this.installEvents();
    this.resize();
    this.state.reset();
    this.setMode('start');
    this.renderHud();
    this.requestId = requestAnimationFrame(this.frame);
    if (this.captureMode) {
      this.startForCapture();
      if (this.reviewView) this.applyReviewView(this.reviewView);
      if (this.stressMode) this.populateStressScene();
      if (this.showcaseMode) this.populateShowcaseScene();
      if (this.katanaReviewProgress !== undefined) {
        this.weapons.reset('katana');
        this.weapons.setKatanaReviewProgress(this.katanaReviewProgress);
        this.weapons.setKatanaReviewVariant(this.katanaReviewVariant);
      }
    }
  }

  startForCapture(): void {
    this.capturePlayback = true;
    this.beginRound();
    this.setMode('playing');
  }

  getSnapshot(): PublicGameSnapshot {
    const weapon = this.weapons.getSnapshot();
    return {
      mode: this.state.mode,
      score: this.state.score,
      wave: this.state.wave,
      enemies: this.enemies.livingCount,
      playerHealth: this.player.health,
      activeWeapon: weapon.activeWeapon,
      rendererObjects: this.renderer.info.render.calls,
      effects: this.effects.getSnapshot(),
    };
  }

  dispose(): void {
    cancelAnimationFrame(this.requestId);
    if (this.deathFlashTimeout !== null) window.clearTimeout(this.deathFlashTimeout);
    document.body.classList.remove('death-hit');
    this.hud.clearDamageFeedback();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.hud.startButton.removeEventListener('click', this.handleStartClick);
    this.hud.restartButton.removeEventListener('click', this.handleRestartClick);
    this.overlay.removeEventListener('click', this.handleOverlayClick);
    this.input.dispose();
    this.arena.dispose();
    this.renderer.dispose();
  }

  private installEvents(): void {
    window.addEventListener('resize', this.resize);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.hud.startButton.addEventListener('click', this.handleStartClick);
    this.hud.restartButton.addEventListener('click', this.handleRestartClick);
    this.overlay.addEventListener('click', this.handleOverlayClick);
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.renderSize?.width ?? window.innerWidth);
    const height = Math.max(1, this.renderSize?.height ?? window.innerHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private readonly handleStartClick = (event: MouseEvent): void => {
    event.stopPropagation();
    this.audio.resume();
    if (!this.roundStarted) this.beginRound();
    this.requestGameplayControl();
  };

  private readonly handleRestartClick = (event: MouseEvent): void => {
    event.stopPropagation();
    this.audio.resume();
    this.beginRound();
    if (this.captureMode) {
      this.capturePlayback = true;
      this.setMode('playing');
      if (this.stressMode) this.populateStressScene();
      if (this.showcaseMode) this.populateShowcaseScene();
      return;
    }
    this.requestGameplayControl();
  };

  private readonly handleOverlayClick = (): void => {
    if (this.state.mode !== 'paused') return;
    this.audio.resume();
    this.requestGameplayControl();
  };

  private requestGameplayControl(): void {
    const request = ++this.controlRequest;
    this.input.setPointerFallback(false);
    void this.input.requestPointerLock().then((locked) => {
      if (request !== this.controlRequest) return;
      if (locked) {
        this.wasPointerLocked = true;
        this.input.setPointerFallback(false);
        if (this.state.mode === 'start' || this.state.mode === 'paused') this.setMode('playing');
        return;
      }
      if (this.state.mode !== 'start' && this.state.mode !== 'paused') return;
      this.input.setPointerFallback(true);
      this.capturePlayback = false;
      this.setMode('playing');
      this.hud.showTip('POINTER LOCK UNAVAILABLE · MOVE THE CURSOR TO LOOK · ESC PAUSES', 5.5);
    });
  }

  private readonly handlePointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    const wasLocked = this.wasPointerLocked;
    this.wasPointerLocked = locked;
    if (locked) {
      if ((this.state.mode === 'start' || this.state.mode === 'paused') && !this.roundStarted) this.beginRound();
      this.input.setPointerFallback(false);
      this.capturePlayback = false;
      if (this.state.mode === 'start' || this.state.mode === 'paused') this.setMode('playing');
    } else if (wasLocked && !locked && this.state.mode === 'playing' && !this.capturePlayback && !this.input.usingPointerFallback) {
      this.setMode('paused');
    }
  };

  private beginRound(): void {
    this.state.reset();
    this.input.setPointerFallback(false);
    this.player.yaw = 0;
    this.player.pitch = -0.035;
    this.player.restore();
    this.weapons.reset();
    this.enemies.reset();
    this.waves.reset();
    this.effects.clear();
    this.grapple.reset();
    this.supplies.reset();
    this.arena.resetBreakables();
    this.lastHit.clear();
    if (this.deathFlashTimeout !== null) window.clearTimeout(this.deathFlashTimeout);
    this.deathFlashTimeout = null;
    document.body.classList.remove('death-hit');
    this.hud.clearDamageFeedback();
    this.autoplayTimer = 0;
    this.defeatTimer = 0;
    this.damageDemoTimer = 0;
    this.fireDemoTimer = 0;
    this.inkDemoTimer = 0;
    this.showcaseTimer = 0;
    this.showcaseSlashIndex = 0;
    this.qaInkDemoConsumed = false;
    this.qaDamageDemoConsumed = false;
    this.roundStarted = true;
    this.waves.start();
    this.hud.showTip('Q grapples enemies and the blue-ink anchor points', 5.5);
    this.setMode('paused');
  }

  private setMode(mode: GameMode): void {
    this.state.mode = mode;
    const active = mode === 'playing';
    this.input.setEnabled(active);
    this.player.enabled = active && (this.capturePlayback || this.input.controlsActive);
    this.weapons.setEnabled(active);
    this.hud.setMode(mode);
  }

  private readonly frame = (time: number): void => {
    const realDelta = Math.min(0.05, Math.max(0, (time - this.previousTime) / 1000));
    this.previousTime = time;
    this.smoothedFps = THREE.MathUtils.lerp(this.smoothedFps, realDelta > 0 ? 1 / realDelta : 60, 0.045);
    if (this.state.mode === 'playing') {
      this.updatePlaying(realDelta);
    } else {
      this.input.consumeFrame();
      this.arena.update(realDelta);
      this.effects.update(realDelta);
    }
    this.hud.update(realDelta);
    this.updateStage(time);
    this.renderFrame();
    this.requestId = requestAnimationFrame(this.frame);
  };

  private updatePlaying(realDelta: number): void {
    const input = this.input.consumeFrame();
    const controlActive = input.controlsActive || this.capturePlayback;
    this.player.enabled = controlActive && !this.capturePlayback;
    this.weapons.setEnabled(controlActive);
    if (input.pausePressed && !this.capturePlayback) {
      this.controlRequest += 1;
      this.input.setPointerFallback(false);
      if (document.pointerLockElement === this.canvas) void document.exitPointerLock();
      this.setMode('paused');
      return;
    }
    this.state.update(realDelta);
    if (this.qaInkDemo && !this.qaInkDemoConsumed) {
      this.inkDemoTimer += realDelta;
      if (this.inkDemoTimer >= 0.28) {
        this.qaInkDemoConsumed = true;
        this.populateInkDemo();
      }
    }
    if (this.qaDamageDemo && !this.qaDamageDemoConsumed) {
      this.damageDemoTimer += realDelta;
      if (this.damageDemoTimer >= 0.55) {
        this.qaDamageDemoConsumed = true;
        this.handlePlayerDamage({
          amount: 21,
          sourceEnemyId: 'qa-damage-source',
          sourceKind: 'marksman',
          attack: 'projectile',
          origin: this.getPlayerCenter().add(new THREE.Vector3(0, 0.2, -8)),
          direction: new THREE.Vector3(0, 0, 1),
          projectileId: 'qa-damage-projectile',
        });
      }
    }
    if (this.qaDefeat && !this.qaDefeatConsumed) {
      this.defeatTimer += realDelta;
      if (this.defeatTimer >= 0.45) {
        this.qaDefeatConsumed = true;
        this.player.applyDamage(this.player.maxHealth);
        this.finish('defeat');
        this.renderHud();
        return;
      }
    }
    const simulationDelta = realDelta * this.state.timeScale;

    this.applyInputActions(input, controlActive);
    this.player.update(realDelta, input);
    this.camera.getWorldPosition(this.aimOrigin);
    this.camera.getWorldDirection(this.aimDirection).normalize();
    this.aimUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion).normalize();
    const playerSnapshot = this.player.getSnapshot();
    this.weapons.setAimRay(this.aimOrigin, this.aimDirection, this.aimUp);
    this.weapons.setLookDelta(input.lookX, input.lookY);
    this.weapons.setMotion({
      strafe: input.moveX,
      forward: input.moveZ,
      speed: playerSnapshot.speed,
      grounded: playerSnapshot.grounded,
      sprinting: playerSnapshot.sprinting,
      gaitPhase: playerSnapshot.gaitPhase,
      gaitWeight: playerSnapshot.gaitWeight,
    });
    let showcaseSlash = false;
    if (this.showcaseMode && this.katanaReviewProgress === undefined) {
      this.showcaseTimer += simulationDelta;
      const slashAt = SHOWCASE_SLASH_TIMES[this.showcaseSlashIndex];
      if (slashAt !== undefined && this.showcaseTimer >= slashAt && this.weapons.getSnapshot().phase === 'idle') {
        showcaseSlash = true;
        this.showcaseSlashIndex += 1;
      }
    }
    this.fireDemoTimer += realDelta;
    const fireDemoTrigger = this.qaFireDemo && this.fireDemoTimer >= 0.55 && this.fireDemoTimer <= 0.63;
    this.weapons.setTrigger(controlActive && (input.primary || showcaseSlash || fireDemoTrigger));
    this.weapons.setAimHeld(controlActive && (input.secondary || this.demoAim));
    this.weapons.update(simulationDelta);
    const weaponSnapshot = this.weapons.getSnapshot();
    this.weaponMount.visible = weaponSnapshot.scopeState !== 'active';
    this.player.setFovTarget(weaponSnapshot.desiredFov);

    this.grapple.update(simulationDelta);
    this.tryReflectProjectile(weaponSnapshot.katana.blocking);
    this.waves.update(simulationDelta);
    if (this.state.mode === 'playing') this.enemies.update(simulationDelta);
    if (this.autoplay && this.state.mode === 'playing') this.updateAutoplay(simulationDelta);
    this.arena.update(simulationDelta);
    this.effects.update(simulationDelta);
    this.supplies.update(realDelta, this.player.body.position, this.state.mode === 'playing');
    this.renderHud();
  }

  private applyInputActions(input: InputFrame, active: boolean): void {
    if (!active) return;
    if (input.weaponSelection !== null) this.weapons.selectSlot(input.weaponSelection);
    if (input.weaponWheel !== 0) this.weapons.cycleWeapon(input.weaponWheel);
    if (input.reloadPressed) this.weapons.requestReload();
    if (input.grapplePressed) {
      const result = this.grapple.fire();
      if (result.fired) this.audio.play('grapple');
    }
    if (input.restartPressed && (this.state.mode === 'defeat' || this.state.mode === 'victory')) this.beginRound();
  }

  private tryReflectProjectile(blocking: boolean): void {
    if (!blocking) return;
    const center = this.getPlayerCenter();
    const incoming = this.enemies.findIncomingProjectile(center, 1.55);
    if (!incoming) return;
    this.camera.getWorldDirection(this.aimDirection).normalize();
    this.weapons.requestReflection({
      projectileId: incoming.id,
      sourcePosition: incoming.position,
      incomingDirection: incoming.velocity,
      staminaCost: 14,
    });
  }

  private handleHitscan(request: HitscanRequest): void {
    this.resolveBallisticRay(
      request.weaponId,
      request.origin,
      request.direction,
      request.damage,
      request.range,
      request.knockback,
    );
  }

  private handlePellets(request: PelletsRequest): void {
    let registeredHit = false;
    let headshot = false;
    for (const ray of request.rays) {
      const result = this.resolveBallisticRay(
        'shotgun',
        request.origin,
        ray.direction,
        ray.damage,
        request.range,
        request.knockback,
        false,
      );
      registeredHit ||= result.hit;
      headshot ||= result.headshot;
    }
    if (registeredHit) this.hud.flashHit(headshot);
  }

  private resolveBallisticRay(
    weaponId: Exclude<WeaponId, 'katana'>,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    damage: number,
    range: number,
    knockback: number,
    flashHud = true,
  ): { hit: boolean; headshot: boolean } {
    this.raycaster.set(origin, direction);
    this.raycaster.far = range;
    const worldHit = this.queries.firstWorldHit(this.raycaster, range);
    const enemyHit = this.enemies.raycast(this.raycaster, range);
    if (enemyHit && (!worldHit || enemyHit.distance < worldHit.distance - 0.025)) {
      const result = this.enemies.applyDamage(enemyHit, {
        amount: damage,
        type: damageType(weaponId),
        hitZone: enemyHit.hitZone,
        point: enemyHit.point,
        direction,
        impulse: knockback,
        sourceId: `player-${weaponId}`,
      });
      if (result && flashHud) this.hud.flashHit(result.headshot);
      return { hit: Boolean(result), headshot: result?.headshot ?? false };
    }

    if (worldHit) {
      const breakableId = worldHit.object.userData.breakableId as string | undefined;
      if (breakableId) {
        const multiplier = weaponId === 'shotgun' ? 1.55 : weaponId === 'sniper' ? 1.3 : 1;
        const result = this.arena.damageBreakable(breakableId, damage * multiplier, worldHit.point, direction);
        this.effects.spawnBurst(worldHit.point, 'orange', result?.destroyed ? 0.42 : 0.18, 0.28);
        if (result?.destroyed) this.effects.spawnDebris(worldHit.point, direction, 'orange', 10);
      } else {
        this.effects.spawnBurst(worldHit.point, 'blue', 0.13, 0.34);
      }
    }
    return { hit: false, headshot: false };
  }

  private handleMelee(request: MeleeRequest): void {
    const threshold = Math.cos(request.arcRadians * 0.5);
    let hit = false;
    for (const enemy of this.enemies.getLivingEnemies()) {
      const target = enemy.position.clone().add(new THREE.Vector3(0, enemy.kind === 'boss' ? 1.7 : 1.05, 0));
      const delta = target.sub(request.origin);
      const distance = delta.length();
      if (distance > request.range + enemy.collisionRadius || distance <= 0.001) continue;
      const direction = delta.multiplyScalar(1 / distance);
      if (direction.dot(request.direction) < threshold || !this.queries.hasLineOfSight(request.origin, enemy.position.clone().setY(enemy.position.y + 1))) continue;
      const result = this.enemies.applyDamage(enemy.id, {
        amount: request.damage,
        type: 'melee',
        point: enemy.position.clone().add(new THREE.Vector3(0, 1.05, 0)),
        direction: request.direction,
        impulse: request.knockback,
        sourceId: 'player-katana',
      });
      hit ||= Boolean(result);
    }
    if (hit) this.hud.flashHit(false);
    this.raycaster.set(request.origin, request.direction);
    this.raycaster.far = request.range;
    const worldHit = this.queries.firstWorldHit(this.raycaster, request.range);
    const breakableId = worldHit?.object.userData.breakableId as string | undefined;
    if (worldHit && breakableId) {
      const result = this.arena.damageBreakable(breakableId, 58, worldHit.point, request.direction);
      this.effects.spawnBurst(worldHit.point, 'orange', result?.destroyed ? 0.42 : 0.2, 0.28);
    }
  }

  private handleReflection(request: ReflectRequest): void {
    const projectileId = request.projectileId === undefined ? undefined : String(request.projectileId);
    const result = this.enemies.reflectProjectiles(this.getPlayerCenter(), 1.7, request.direction, projectileId);
    if (result.count > 0) {
      this.audio.play('katana');
      this.effects.spawnBurst(request.origin, 'green', request.perfect ? 0.34 : 0.24, 0.2);
      if (request.perfect) this.hud.showTip('PERFECT RETURN!', 0.8);
    }
  }

  private handleMuzzle(request: MuzzleRequest): void {
    request.anchor.updateWorldMatrix(true, false);
    request.anchor.getWorldPosition(this.temporary);
    this.effects.spawnBurst(this.temporary, 'orange', 0.18 + request.intensity * 0.055, 0.09);
    this.effects.spawnFirearmAftermath(
      this.temporary,
      request.direction,
      this.aimUp,
      request.weaponId,
      request.shotId,
    );
  }

  private handleWeaponEffect(effect: WeaponEffect): void {
    if (effect.kind === 'fire' && effect.weaponId !== 'katana') {
      this.audio.play(weaponSound(effect.weaponId));
      this.player.addRecoil(Math.min(1.35, (effect.strength ?? 0.5) * 0.58), Math.sin(effect.timestamp * 41.7) * 0.06);
    } else if (effect.kind === 'reload-start') {
      this.audio.play('reload');
    } else if (effect.kind === 'slash') {
      this.audio.play('katana');
    } else if (effect.kind === 'block-break') {
      this.audio.play('hurt');
      this.hud.showTip('BLOCK BROKEN', 1.1);
    }
  }

  private handlePlayerDamage(event: PlayerDamageEvent): void {
    if (this.state.mode !== 'playing') return;
    const weapon = this.weapons.getSnapshot();
    const blocked = weapon.activeWeapon === 'katana' && weapon.katana.blocking && event.projectileId !== undefined;
    const mitigatedDamage = event.amount * (blocked ? 0.24 : 0.72);
    const amount = this.capturePlayback ? 0 : mitigatedDamage;
    const dead = this.player.applyDamage(amount);
    this.audio.play('hurt');
    const incomingYaw = Math.atan2(event.direction.x, event.direction.z);
    const relative = Math.atan2(Math.sin(incomingYaw - this.player.yaw), Math.cos(incomingYaw - this.player.yaw));
    this.hud.flashDamage(relative, mitigatedDamage);
    if (blocked) this.hud.showTip('BLOCKED', 0.55);
    if (dead) this.finish('defeat');
  }

  private handleEnemyEvent(event: EnemyEvent): void {
    if (event.type === 'hit') {
      this.lastHit.set(event.enemyId, {
        headshot: Boolean(event.headshot),
        time: performance.now(),
        direction: event.direction?.clone(),
      });
      if (event.damageType === 'melee' && !event.killed) {
        this.state.triggerHitStop();
        this.flashImpactFrame();
      }
    } else if (event.type === 'ink-impact') {
      const away = event.position.clone().sub(this.getPlayerCenter()).normalize();
      this.effects.spawnInkSplatter(event.position, away, 'red', event.headshot ? 8 : 5);
    } else if (event.type === 'death') {
      const recent = this.lastHit.get(event.enemyId);
      const headshot = Boolean(recent?.headshot && performance.now() - recent.time < 2200);
      this.state.awardKill(scoreForEnemy(event.kind), {
        headshot,
        fall: event.deathCause === 'fall',
        reflected: event.deathCause === 'reflected',
        boss: event.kind === 'boss',
      });
      if (event.deathCause !== 'fall') this.flashImpactFrame();
      const direction = event.direction?.clone()
        ?? recent?.direction?.clone()
        ?? event.position.clone().sub(this.getPlayerCenter()).normalize();
      const intensity = event.kind === 'boss'
        ? 1.35
        : event.deathCause === 'melee'
          ? 0.82
          : event.deathCause === 'shotgun'
            ? 1.12
          : event.deathCause === 'sniper'
            ? 1.14
            : event.deathCause === 'fall'
              ? 0.82
              : 1;
      this.effects.spawnEnemyDeath(event.position, direction, {
        intensity,
        boss: event.kind === 'boss',
        headshot,
      });
      if (event.deathCause !== 'fall') {
        const wallOrigin = event.position.clone().add(new THREE.Vector3(0, event.kind === 'boss' ? 1.6 : 1.05, 0));
        this.raycaster.set(wallOrigin, direction);
        this.raycaster.far = 4.8;
        const wallHit = this.queries.firstWorldHit(this.raycaster, 4.8);
        if (wallHit) {
          const normal = wallHit.face?.normal.clone().transformDirection(wallHit.object.matrixWorld)
            ?? direction.clone().multiplyScalar(-1);
          this.effects.spawnSurfaceSplat(wallHit.point, normal, event.kind === 'boss' ? 3.2 : 1.25, 58);
        }
      }
      this.waves.notifyEnemyRemoved(event.enemyId);
      this.lastHit.delete(event.enemyId);
    } else if (event.type === 'attack-telegraph') {
      this.effects.spawnBurst(event.position, 'red', event.kind === 'boss' ? 0.55 : 0.22, event.telegraphDuration ?? 0.35);
    } else if (event.type === 'projectile-impact') {
      this.effects.spawnBurst(event.position, 'red', 0.13, 0.26);
    } else if (event.type === 'boss-phase') {
      this.hud.showBanner('THE DOODLER', 'PHASE TWO · THE LINES GET ANGRY', 2.1);
      this.audio.play('boss');
    } else if (event.type === 'boss-summon') {
      this.hud.showTip('THE DOODLER SKETCHED REINFORCEMENTS', 2.1);
    } else if (event.type === 'cleanup') {
      this.lastHit.delete(event.enemyId);
    }
  }

  private flashImpactFrame(): void {
    document.body.classList.remove('death-hit');
    void document.body.offsetWidth;
    document.body.classList.add('death-hit');
    if (this.deathFlashTimeout !== null) window.clearTimeout(this.deathFlashTimeout);
    this.deathFlashTimeout = window.setTimeout(() => {
      document.body.classList.remove('death-hit');
      this.deathFlashTimeout = null;
    }, 84);
  }

  private handleWaveEvent(event: WaveEvent): void {
    if (event.wave > 0) this.state.wave = event.wave;
    if (event.type === 'announcement') {
      this.hud.showBanner(`WAVE ${event.wave}`, event.subtitle, event.duration ?? 2.15);
      this.audio.play(event.wave === 5 ? 'boss' : 'wave');
    } else if (event.type === 'wave-clear') {
      this.hud.showBanner('WAVE CLEARED', 'CATCH YOUR BREATH · RESTOCKING INK', 2.8);
    } else if (event.type === 'victory') {
      this.finish('victory');
    }
  }

  private handleRecovery(recovery: WaveRecovery): void {
    this.player.heal(this.player.maxHealth * recovery.healthFraction);
    for (const id of WEAPON_IDS) {
      if (id === 'katana') continue;
      const reserve = WEAPON_DEFINITIONS[id].initialReserve ?? 0;
      this.weapons.addReserveAmmo(id, Math.max(1, Math.round(reserve * recovery.ammoFraction)));
    }
  }

  private handleSupply(event: SupplyPickupEvent): void {
    if (event.health > 0) this.player.heal(event.health);
    if (event.ammo > 0) {
      this.weapons.addReserveAmmo('rifle', event.ammo);
      this.weapons.addReserveAmmo('shotgun', Math.max(2, Math.round(event.ammo * 0.22)));
      this.weapons.addReserveAmmo('revolver', Math.max(3, Math.round(event.ammo * 0.3)));
      this.weapons.addReserveAmmo('sniper', Math.max(2, Math.round(event.ammo * 0.18)));
    }
    this.effects.spawnBurst(this.player.body.position.clone().add(new THREE.Vector3(0, 0.7, 0)), 'green', 0.34, 0.42);
    this.hud.showTip(event.kind === 'mixed' ? 'HEALTH + AMMO' : `${event.kind.toUpperCase()} REFILLED`, 1.25);
  }

  private finish(mode: 'defeat' | 'victory'): void {
    if (this.state.mode === mode) return;
    this.controlRequest += 1;
    this.input.setPointerFallback(false);
    this.capturePlayback = false;
    this.setMode(mode);
    this.weapons.setTrigger(false);
    this.weapons.setAimHeld(false);
    this.enemies.projectilePool.clear();
    if (mode === 'victory') this.enemies.reset();
    if (document.pointerLockElement === this.canvas) void document.exitPointerLock();
  }

  private populateStressScene(): void {
    const kinds: readonly Exclude<EnemyKind, 'boss'>[] = ['grunt', 'rusher', 'heavy', 'marksman'];
    for (let index = 0; index < 20; index += 1) {
      const point = this.arena.enemySpawnPoints[index % this.arena.enemySpawnPoints.length];
      const kind = kinds[index % kinds.length];
      if (!point || !kind) continue;
      this.enemies.spawn(kind, point.position.clone(), { id: `stress-${index + 1}` });
    }
  }

  private populateInkDemo(): void {
    // QA-only close view: the rear perimeter is a real raycast wall, so this
    // exercises the same death event, world hit, wall decal and floor trail as
    // normal play without changing gameplay placement or camera behaviour.
    const reviewPlayer = new THREE.Vector3(0, 0.32, -40.65);
    const position = new THREE.Vector3(-0.68, 0, -44.15);
    const direction = position.clone().sub(reviewPlayer).setY(0.035).normalize();
    this.player.yaw = Math.atan2(-direction.x, -direction.z) - 0.12;
    this.player.pitch = -0.15;
    this.player.teleport(reviewPlayer);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
    const enemy = this.enemies.spawn('grunt', position, { id: 'qa-ink-death' });
    this.enemies.applyDamage(enemy.id, {
      amount: enemy.maxHealth * 3,
      type: 'shotgun',
      point: position.clone().add(new THREE.Vector3(0, 1.05, 0)),
      direction,
      impulse: 7,
      sourceId: 'qa-ink-demo',
    });
    // Settle only the review capture so the persistent wall/floor composition is
    // readable in a single still instead of being hidden by flying body pieces.
    this.effects.update(1.65);
  }

  private populateShowcaseScene(): void {
    this.waves.reset();
    this.enemies.reset();
    this.weapons.reset('katana');
    this.showcaseTimer = 0;
    this.showcaseSlashIndex = 0;
    this.player.yaw = 0;
    this.player.pitch = -0.025;
    this.player.teleport(this.arena.safePlayerSpawn);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
    const player = this.arena.safePlayerSpawn;
    this.enemies.spawn('grunt', new THREE.Vector3(player.x, 0, player.z - 4.02), { id: 'showcase-front', yaw: 0 });
    this.enemies.spawn('grunt', new THREE.Vector3(player.x - 1.65, 0, player.z - 5.25), { id: 'showcase-left', yaw: 0 });
    this.enemies.spawn('marksman', new THREE.Vector3(player.x + 1.75, 0, player.z - 5.7), { id: 'showcase-right', yaw: 0 });
  }

  private applyReviewView(view: 'rear' | 'west'): void {
    if (view === 'rear') {
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = -0.035;
      this.player.teleport(new THREE.Vector3(-33, 0.32, -32));
    } else {
      this.player.yaw = -0.69;
      this.player.pitch = -0.025;
      this.player.teleport(new THREE.Vector3(-32, 0.32, 20));
    }
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0, 'YXZ');
  }

  private updateAutoplay(delta: number): void {
    this.autoplayTimer += delta;
    if (this.autoplayTimer < 0.11) return;
    this.autoplayTimer = 0;
    for (const enemy of this.enemies.getLivingEnemies()) {
      this.enemies.applyDamage(enemy.id, {
        amount: enemy.maxHealth * 4,
        type: 'environment',
        point: enemy.position.clone().add(new THREE.Vector3(0, 1, 0)),
        sourceId: 'qa-autoplay',
      });
    }
  }

  private resolveEnemyMovement(
    enemy: ReturnType<EnemyManager['getLivingEnemies']>[number],
    proposed: THREE.Vector3,
  ): THREE.Vector3 {
    const resolved = this.queries.resolveEnemyMovement(enemy, proposed);
    const playerPosition = this.player.body.position;
    if (Math.abs(resolved.y - playerPosition.y) > 2.4) return resolved;
    const separation = resolved.clone().sub(playerPosition).setY(0);
    const minimum = enemy.kind === 'rusher'
      ? enemy.collisionRadius + 0.52
      : Math.max(2, enemy.collisionRadius + 1.35);
    if (separation.lengthSq() >= minimum * minimum) return resolved;
    if (separation.lengthSq() < 0.0001) separation.set(Math.sin(enemy.id.length * 2.3), 0, Math.cos(enemy.id.length * 2.3));
    separation.normalize().multiplyScalar(minimum);
    const pushed = resolved.clone().set(playerPosition.x + separation.x, resolved.y, playerPosition.z + separation.z);
    return this.queries.resolveEnemyMovement(enemy, pushed);
  }

  private renderHud(): void {
    const weapon = this.weapons.getSnapshot();
    const enemies = this.enemies.getSnapshot();
    const wave = this.waves.getSnapshot();
    const playerSpeed = Math.hypot(this.player.body.velocity.x, this.player.body.velocity.z);
    const reticleSpread = playerSpeed <= 8.4
      ? 22 + THREE.MathUtils.clamp(playerSpeed / 8.4, 0, 1) * 16
      : 38 + THREE.MathUtils.clamp((playerSpeed - 8.4) / 1.8, 0, 1) * 39;
    const snapshot: HudSnapshot = {
      score: this.state.score,
      wave: Math.max(1, wave.wave || this.state.wave),
      enemiesLeft: wave.enemiesRemaining,
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      grappleRatio: this.grapple.readyRatio,
      blockRatio: weapon.activeWeapon === 'katana' ? weapon.katana.stamina / weapon.katana.maxStamina : undefined,
      scoped: weapon.scopeState === 'active' || weapon.scopeState === 'entering',
      reticleSpread,
      boss: enemies.bossHealth !== null && enemies.bossMaxHealth !== null
        ? { name: 'THE DOODLER', health: enemies.bossHealth, maxHealth: enemies.bossMaxHealth }
        : null,
      weapons: WEAPON_IDS.map((id) => ({
        slot: WEAPON_DEFINITIONS[id].slot,
        name: WEAPON_DEFINITIONS[id].label,
        description: WEAPON_DEFINITIONS[id].hint,
        ammo: weapon.ammo[id].magazine ?? 0,
        reserve: weapon.ammo[id].reserve ?? 0,
        selected: weapon.activeWeapon === id,
      })),
    };
    this.hud.render(snapshot);
  }

  private renderFrame(): void {
    this.renderer.autoClear = true;
    this.camera.layers.set(0);
    this.renderer.render(this.scene, this.camera);
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.camera.layers.set(1);
    const background = this.scene.background;
    this.scene.background = null;
    this.renderer.render(this.scene, this.camera);
    this.scene.background = background;
    this.camera.layers.enableAll();
    this.renderer.autoClear = true;
  }

  private getPlayerCenter(): THREE.Vector3 {
    return this.playerCenter.copy(this.player.body.position).add(new THREE.Vector3(0, PLAYER_CENTER_HEIGHT, 0));
  }

  private updateStage(time: number): void {
    if (time < this.stageUpdateAt) return;
    this.stageUpdateAt = time + 500;
    const stage = document.querySelector<HTMLElement>('#stage');
    if (!stage) return;
    const wave = Math.max(1, this.waves.wave || this.state.wave);
    stage.textContent = `WAVE ${wave} · ${Math.round(this.smoothedFps)} FPS · ${this.enemies.livingCount} ACTORS`;
  }
}
