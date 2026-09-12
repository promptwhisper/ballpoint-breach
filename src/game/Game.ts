import * as THREE from 'three';
import { SettingsPanel } from '../ui/SettingsPanel';
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
import { EffectPool, playerInkTrailProfile } from '../effects/EffectPool';
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
import { SupplySystem, type SupplyPickupEvent } from './SupplySystem';
import { createGameScene } from './createGameScene';
import { InkOutline } from '../render/InkOutline';
import { ACTIVE_INK_VERSION } from '../render/inkSettings';
import { ACTIVE_VISUAL_STYLE } from '../render/visualStyle';

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
  demoReel?: boolean;
  katanaReviewProgress?: number;
  katanaReviewVariant?: KatanaSlashVariant;
  renderSize?: Readonly<{ width: number; height: number }>;
  reviewView?: 'rear' | 'west';
  forcePointerFallback?: boolean;
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

interface BallisticRayResult {
  hit: boolean;
  headshot: boolean;
  endpoint: THREE.Vector3;
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
  private readonly supplies: SupplySystem;
  private readonly raycaster = new THREE.Raycaster();
  private readonly weaponMount = new THREE.Group();
  private readonly aimOrigin = new THREE.Vector3();
  private readonly aimDirection = new THREE.Vector3();
  private readonly aimUp = new THREE.Vector3();
  private readonly playerCenter = new THREE.Vector3();
  private readonly temporary = new THREE.Vector3();
  private readonly pendingShotTrails = new Map<number, THREE.Vector3[]>();
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
  private readonly demoReelMode: boolean;
  private readonly katanaReviewProgress?: number;
  private readonly katanaReviewVariant: KatanaSlashVariant;
  private readonly renderSize?: Readonly<{ width: number; height: number }>;
  private readonly reviewView?: 'rear' | 'west';
  private readonly forcePointerFallback: boolean;
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
  private demoReelTimer = 0;
  private demoReelSegment = -1;
  private demoSpawnSerial = 0;
  private controlRequest = 0;
  private pointerLockRequested = false;
  private wasPointerLocked = false;
  private deathFlashTimeout: number | null = null;
  private readonly inkOutline = ACTIVE_VISUAL_STYLE === 'ink' && ACTIVE_INK_VERSION !== 'current'
    ? new InkOutline() : null;
  private contextLost = false;
  private pageVisible = !document.hidden;
  private lowFpsSeconds = 0;
  private qualityScale = 1;
  private footstepIndex = -1;
  private audioWasGrounded = false;
  private movementAudioPrimed = false;

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
    this.demoReelMode = options.demoReel ?? false;
    this.katanaReviewProgress = options.katanaReviewProgress;
    this.katanaReviewVariant = options.katanaReviewVariant ?? 'forward';
    this.renderSize = options.renderSize;
    this.reviewView = options.reviewView;
    this.forcePointerFallback = options.forcePointerFallback ?? false;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.captureMode,
    });
    this.updatePixelRatio();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = false;
    this.renderer.info.autoReset = false;

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
      if (this.demoReelMode) this.populateDemoReelScene();
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
    this.controlRequest += 1;
    this.pointerLockRequested = false;
    this.settings?.dispose();
    cancelAnimationFrame(this.requestId);
    if (this.deathFlashTimeout !== null) window.clearTimeout(this.deathFlashTimeout);
    document.body.classList.remove('death-hit');
    this.hud.dispose();
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    if (document.pointerLockElement === this.canvas) void document.exitPointerLock();
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.hud.startButton.removeEventListener('click', this.handleStartClick);
    this.hud.restartButton.removeEventListener('click', this.handleRestartClick);
    this.overlay.removeEventListener('click', this.handleOverlayClick);
    for (const event of ['mousedown', 'touchstart', 'touchend', 'keydown']) {
      document.removeEventListener(event, this.handleAudioGesture, true);
    }
    document.querySelector('#sound-toggle')?.removeEventListener('click', this.handleSoundToggle);
    this.audio.dispose();
    this.input.dispose();
    this.arena.dispose();
    this.inkOutline?.dispose();
    this.renderer.dispose();
  }

  private installEvents(): void {
    this.settings = new SettingsPanel(this.input, () => {
      this.resumeAfterSettings = this.state.mode === 'playing' || this.pointerLockRequested;
      if (this.resumeAfterSettings) {
        this.controlRequest += 1;
        this.pointerLockRequested = false;
        this.input.setPointerFallback(false);
        if (document.pointerLockElement === this.canvas) void document.exitPointerLock();
        this.setMode('paused');
      }
    }, () => {
      if (this.resumeAfterSettings && !document.hidden && this.state.mode === 'paused') {
        this.audio.resume(); this.requestGameplayControl();
      }
      this.resumeAfterSettings = false;
    });
    if (!this.settings.values.soundEnabled) this.audio.setEnabled(false);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
    this.hud.startButton.addEventListener('click', this.handleStartClick);
    this.hud.restartButton.addEventListener('click', this.handleRestartClick);
    this.overlay.addEventListener('click', this.handleOverlayClick);
    for (const event of ['mousedown', 'touchstart', 'touchend', 'keydown']) {
      document.addEventListener(event, this.handleAudioGesture, { capture: true, passive: true });
    }
    document.querySelector('#sound-toggle')?.addEventListener('click', this.handleSoundToggle);
    this.audio.onStatus = this.updateSoundButton;
    this.updateSoundButton(this.audio.getStatus());
  }

  private settings?: SettingsPanel;
  private resumeAfterSettings = false;

  private readonly handleAudioGesture = (event: Event): void => {
    if (!event.isTrusted || this.state.mode !== 'playing' || document.hidden) return;
    if (event.target instanceof Element && event.target.closest('#sound-toggle')) return;
    this.audio.resume();
  };

  private readonly handleSoundToggle = (event: Event): void => {
    event.stopPropagation();
    const enable = this.audio.getStatus() === 'blocked' || !this.settings?.values.soundEnabled;
    this.settings?.setSound(enable);
    this.audio.setEnabled(enable);
    if (enable) this.audio.play('reload');
  };

  private readonly updateSoundButton = (status: string): void => {
    const button = document.querySelector<HTMLButtonElement>('#sound-toggle');
    if (!button) return;
    button.textContent = status === 'unsupported' ? '设备不支持' : status === 'blocked' ? '点击重试' : this.settings?.values.soundEnabled ? '已开启' : '已关闭';
    button.disabled = status === 'unsupported';
    button.title = status === 'unsupported' ? '当前容器不支持声音播放。' : status === 'blocked' ? '播放失败，请轻触重试并检查设备媒体音量。' : '';
    button.setAttribute('aria-pressed', String(this.settings?.values.soundEnabled ?? true));
    button.setAttribute('aria-label', this.settings?.values.soundEnabled ? '关闭音效' : '开启音效');
    button.dataset.audioStatus = status;
  };

  private readonly resize = (): void => {
    const internallyRotated = !this.renderSize && window.innerHeight > window.innerWidth;
    const viewportWidth = internallyRotated ? window.innerHeight : window.innerWidth;
    const viewportHeight = internallyRotated ? window.innerWidth : window.innerHeight;
    const width = Math.max(1, this.renderSize?.width ?? viewportWidth);
    const height = Math.max(1, this.renderSize?.height ?? viewportHeight);
    this.updatePixelRatio(width, height);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  private readonly handleStartClick = (event: MouseEvent): void => {
    event.stopPropagation();
    if (!this.roundStarted) this.beginRound();
    this.audio.resume();
    this.requestGameplayControl();
  };

  private readonly handleRestartClick = (event: MouseEvent): void => {
    event.stopPropagation();
    this.beginRound();
    this.audio.resume();
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
    if (this.forcePointerFallback) {
      this.pointerLockRequested = false;
      this.input.setPointerFallback(true);
      this.capturePlayback = false;
      if (this.state.mode === 'start' || this.state.mode === 'paused') this.setMode('playing');
      this.hud.showTip(
        this.settings?.values.fireMode === 'button'
          ? '滑动屏幕转向 · 按射击键开火 · 利用掩体交战'
          : '点击右侧射击 · 滑动转向 · 利用掩体交战',
        5.2,
      );
      return;
    }

    this.pointerLockRequested = true;
    this.input.setPointerFallback(false);
    void this.input.requestPointerLock().then((locked) => {
      if (request !== this.controlRequest) return;
      if (locked) {
        this.wasPointerLocked = true;
        this.input.setPointerFallback(false);
        this.capturePlayback = false;
        if (this.state.mode === 'start' || this.state.mode === 'paused') this.setMode('playing');
        this.hud.showTip('鼠标转向 · 左键射击 · 右键瞄准 · ESC 暂停', 5.2);
        return;
      }
      if (this.state.mode !== 'start' && this.state.mode !== 'paused') return;
      this.pointerLockRequested = false;
      this.input.setPointerFallback(true);
      this.capturePlayback = false;
      this.setMode('playing');
      this.hud.showTip('移动鼠标转向 · 左键射击 · 右键瞄准 · ESC 暂停', 5.2);
    });
  }

  private readonly handlePointerLockChange = (): void => {
    if (this.forcePointerFallback) return;
    const locked = document.pointerLockElement === this.canvas;
    const wasLocked = this.wasPointerLocked;
    this.wasPointerLocked = locked;
    if (locked) {
      if (!this.pointerLockRequested || document.hidden) {
        this.wasPointerLocked = false;
        void document.exitPointerLock();
        return;
      }
      this.input.setPointerFallback(false);
      this.capturePlayback = false;
      if (this.state.mode === 'start' || this.state.mode === 'paused') this.setMode('playing');
    } else if (wasLocked) {
      this.pointerLockRequested = false;
      if (this.state.mode === 'playing' && !this.capturePlayback) this.setMode('paused');
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
    this.pendingShotTrails.clear();
    this.supplies.reset();
    this.arena.resetBreakables();
    this.lastHit.clear();
    this.audioWasGrounded = false;
    this.movementAudioPrimed = false;
    this.footstepIndex = -1;
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
    this.demoReelTimer = 0;
    this.demoReelSegment = -1;
    this.demoSpawnSerial = 0;
    this.qaInkDemoConsumed = false;
    this.qaDamageDemoConsumed = false;
    this.roundStarted = true;
    this.waves.start();
    this.hud.showTip('利用掩体交战 · 长刀可格挡并反弹来袭墨弹', 5.5);
    this.setMode('paused');
  }

  private setMode(mode: GameMode): void {
    if (this.state.mode === 'playing' && mode !== 'playing') this.audio.suspend();
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
    this.updatePerformanceTier(realDelta);
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
    this.requestId = this.pageVisible && !this.contextLost ? requestAnimationFrame(this.frame) : 0;
  };

  private updatePlaying(realDelta: number): void {
    let input = this.input.consumeFrame();
    if (this.demoReelMode) input = this.updateDemoReel(realDelta, input);
    const controlActive = input.controlsActive || this.capturePlayback;
    this.player.enabled = controlActive && (!this.capturePlayback || this.demoReelMode);
    this.weapons.setEnabled(controlActive);
    if (input.pausePressed && !this.capturePlayback) {
      this.controlRequest += 1;
      this.pointerLockRequested = false;
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
    this.updateMovementAudio(playerSnapshot);
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
    const result = this.resolveBallisticRay(
      request.weaponId,
      request.origin,
      request.direction,
      request.damage,
      request.range,
      request.knockback,
    );
    if (ACTIVE_VISUAL_STYLE === 'ink') this.pendingShotTrails.set(request.shotId, [result.endpoint]);
  }

  private handlePellets(request: PelletsRequest): void {
    let registeredHit = false;
    let headshot = false;
    const trailEndpoints: THREE.Vector3[] = [];
    const trailCount = ACTIVE_VISUAL_STYLE === 'ink' ? playerInkTrailProfile('shotgun').trailCount : 0;
    const trailIndices = new Set(Array.from({ length: trailCount }, (_, index) => (
      trailCount <= 1 ? 0 : Math.round(index * (request.rays.length - 1) / (trailCount - 1))
    )));
    for (let index = 0; index < request.rays.length; index += 1) {
      const ray = request.rays[index];
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
      if (trailIndices.has(index)) trailEndpoints.push(result.endpoint);
    }
    if (trailEndpoints.length > 0) this.pendingShotTrails.set(request.shotId, trailEndpoints);
    if (registeredHit) {
      this.hud.flashHit(headshot);
      this.audio.play(headshot ? 'headshot' : 'hit');
    }
  }

  private resolveBallisticRay(
    weaponId: Exclude<WeaponId, 'katana'>,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    damage: number,
    range: number,
    knockback: number,
    flashHud = true,
  ): BallisticRayResult {
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
      if (result && flashHud) {
        this.hud.flashHit(result.headshot);
        this.audio.play(result.headshot ? 'headshot' : 'hit');
      }
      return { hit: Boolean(result), headshot: result?.headshot ?? false, endpoint: enemyHit.point.clone() };
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
      this.audio.play('worldImpact');
      return { hit: false, headshot: false, endpoint: worldHit.point.clone() };
    }
    return { hit: false, headshot: false, endpoint: origin.clone().addScaledVector(direction, range) };
  }

  private handleMelee(request: MeleeRequest): void {
    const threshold = Math.cos(request.arcRadians * 0.5);
    let hit = false;
    let bloodGain = 0;
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
      if (result) bloodGain += result.killed ? 2 : 1;
    }
    if (hit) {
      this.weapons.addKatanaBlood(bloodGain);
      this.hud.flashHit(false);
      this.audio.play('meleeHit');
    }
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
    const endpoints = this.pendingShotTrails.get(request.shotId);
    if (endpoints) {
      endpoints.forEach((endpoint, index) => {
        this.effects.spawnPlayerInkTrail(
          this.temporary,
          endpoint,
          request.origin,
          this.aimUp,
          request.weaponId,
          request.shotId * 5 + index,
        );
      });
      this.pendingShotTrails.delete(request.shotId);
    }
  }

  private handleWeaponEffect(effect: WeaponEffect): void {
    if (effect.kind === 'fire' && effect.weaponId !== 'katana') {
      this.audio.play(weaponSound(effect.weaponId));
      this.player.addRecoil(Math.min(1.35, (effect.strength ?? 0.5) * 0.58), Math.sin(effect.timestamp * 41.7) * 0.06);
    } else if (effect.kind === 'reload-start') {
      this.audio.play('reload');
    } else if (effect.kind === 'dry-fire') {
      this.audio.play('dryFire');
    } else if (effect.kind === 'switch-start') {
      this.audio.play('weaponSwitch');
    } else if (effect.kind === 'pump') {
      this.audio.play('pump');
    } else if (effect.kind === 'bolt') {
      this.audio.play('bolt');
    } else if (effect.kind === 'slash') {
      this.audio.play('katana');
    } else if (effect.kind === 'block-start') {
      this.audio.play('block');
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
      this.audio.play(event.kind === 'boss' ? 'boss' : 'enemyDeath');
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
      if (ACTIVE_VISUAL_STYLE === 'ink') {
        this.effects.spawnInkSplatter(event.position, event.direction ?? new THREE.Vector3(0, 1, 0), 'blue', 3);
      } else this.effects.spawnBurst(event.position, 'red', 0.13, 0.26);
      this.audio.play('worldImpact');
    } else if (event.type === 'projectile-spawn') {
      this.audio.play('enemyFire');
    } else if (event.type === 'boss-phase') {
      this.hud.showBanner('THE DOODLER', 'PHASE TWO · THE LINES GET ANGRY', 2.1);
      this.audio.play('boss');
    } else if (event.type === 'boss-summon') {
      this.hud.showTip('THE DOODLER SKETCHED REINFORCEMENTS', 2.1);
      this.audio.play('boss');
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
      this.audio.play(event.wave === 5 || event.wave === 10 ? 'boss' : 'wave');
    } else if (event.type === 'wave-clear') {
      this.hud.showBanner('WAVE CLEARED', 'CATCH YOUR BREATH · RESTOCKING INK', 2.8);
      this.audio.play('waveClear');
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
    this.audio.play('pickup');
    this.hud.showTip(event.kind === 'mixed' ? 'HEALTH + AMMO' : `${event.kind.toUpperCase()} REFILLED`, 1.25);
  }

  private updateMovementAudio(player: ReturnType<PlayerController['getSnapshot']>): void {
    if (this.state.mode !== 'playing') {
      this.footstepIndex = -1;
      this.audioWasGrounded = player.grounded;
      return;
    }
    if (!this.movementAudioPrimed) {
      this.audioWasGrounded = player.grounded;
      if (player.grounded) this.movementAudioPrimed = true;
      return;
    }
    if (!this.audioWasGrounded && player.grounded) this.audio.play('land');
    this.audioWasGrounded = player.grounded;
    if (!player.grounded || player.speed < 0.9 || player.gaitWeight < 0.08) {
      this.footstepIndex = -1;
      return;
    }
    const next = Math.floor(player.gaitPhase / Math.PI);
    if (next !== this.footstepIndex) {
      this.footstepIndex = next;
      this.audio.play('footstep');
    }
  }

  private finish(mode: 'defeat' | 'victory'): void {
    if (this.state.mode === mode) return;
    this.controlRequest += 1;
    this.pointerLockRequested = false;
    this.input.setPointerFallback(false);
    if (document.pointerLockElement === this.canvas) void document.exitPointerLock();
    this.capturePlayback = false;
    this.setMode(mode);
    this.weapons.setTrigger(false);
    this.weapons.setAimHeld(false);
    this.enemies.projectilePool.clear();
    if (mode === 'victory') this.enemies.reset();
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

  private populateDemoReelScene(): void {
    this.enemies.reset();
    this.weapons.reset('rifle');
    this.demoReelTimer = 0;
    this.demoReelSegment = -1;
    this.demoSpawnSerial = 0;
    this.player.yaw = 0;
    this.player.pitch = -0.02;
    this.player.teleport(this.arena.safePlayerSpawn);
    this.spawnDemoTarget('grunt', 8, -1.5);
    this.spawnDemoTarget('marksman', 13, 2.4);
    this.spawnDemoTarget('rusher', 17, -4.2);
  }

  private spawnDemoTarget(kind: EnemyKind, distance: number, lateral: number): void {
    const player = this.player.body.position;
    const forward = new THREE.Vector3(-Math.sin(this.player.yaw), 0, -Math.cos(this.player.yaw));
    const right = new THREE.Vector3(Math.cos(this.player.yaw), 0, -Math.sin(this.player.yaw));
    const position = player.clone().addScaledVector(forward, distance).addScaledVector(right, lateral);
    position.y = 0;
    this.demoSpawnSerial += 1;
    this.enemies.spawn(kind, position, { id: `demo-${this.demoSpawnSerial}` });
  }

  private updateDemoReel(delta: number, base: InputFrame): InputFrame {
    this.demoReelTimer += delta;
    const t = this.demoReelTimer;
    const boundaries = [0, 18, 34, 48, 62, 75];
    let segment = 0;
    while (segment + 1 < boundaries.length && t >= boundaries[segment + 1]) segment += 1;
    if (segment !== this.demoReelSegment) {
      this.demoReelSegment = segment;
      const weapons: readonly WeaponId[] = ['rifle', 'shotgun', 'revolver', 'sniper', 'katana', 'rifle'];
      this.weapons.selectWeapon(weapons[segment]);
      const positions = [
        this.arena.safePlayerSpawn,
        new THREE.Vector3(-14, 0.25, 5),
        new THREE.Vector3(14, 0.25, -7),
        new THREE.Vector3(-32, 0.32, 20),
        new THREE.Vector3(0, 0.32, -40.65),
        new THREE.Vector3(-24, 0.25, -28),
      ];
      this.player.teleport(positions[segment]);
      const kind: EnemyKind = segment === 5 ? 'boss' : segment === 1 ? 'heavy' : segment === 3 ? 'marksman' : 'grunt';
      const count = segment === 4 ? 4 : segment === 5 ? 1 : 3;
      for (let index = 0; index < count; index += 1) this.spawnDemoTarget(kind, segment === 4 ? 3.4 + index * 0.8 : 8 + index * 3, (index - 1) * 2.1);
      if (segment === 1 || segment === 3) {
        this.handlePlayerDamage({
          amount: 18,
          sourceEnemyId: 'demo-director',
          sourceKind: 'marksman',
          attack: 'projectile',
          origin: this.player.body.position.clone().add(new THREE.Vector3(4, 1, -5)),
          direction: new THREE.Vector3(-0.7, 0, 0.7),
          projectileId: `demo-hit-${segment}`,
        });
      }
    }

    if (this.enemies.livingCount < (segment === 4 ? 2 : 3) && t < 86) {
      const kind: EnemyKind = segment === 4 ? (this.demoSpawnSerial % 2 ? 'rusher' : 'grunt') : segment === 5 ? 'heavy' : segment === 1 ? 'heavy' : 'grunt';
      this.spawnDemoTarget(kind, segment === 4 ? 3.5 : 8 + (this.demoSpawnSerial % 3) * 2.4, ((this.demoSpawnSerial % 3) - 1) * 2.2);
    }

    const player = this.player.body.position;
    const target = [...this.enemies.getLivingEnemies()]
      .sort((a, b) => a.position.distanceToSquared(player) - b.position.distanceToSquared(player))[0];
    if (target) {
      const targetPoint = target.position.clone().add(new THREE.Vector3(0, target.kind === 'boss' ? 1.8 : 1.05, 0));
      const deltaAim = targetPoint.sub(this.camera.position);
      const desiredYaw = Math.atan2(-deltaAim.x, -deltaAim.z);
      const desiredPitch = THREE.MathUtils.clamp(-Math.atan2(deltaAim.y, Math.hypot(deltaAim.x, deltaAim.z)), -0.42, 0.34);
      const turn = 1 - Math.exp(-4.6 * delta);
      this.player.yaw += Math.atan2(Math.sin(desiredYaw - this.player.yaw), Math.cos(desiredYaw - this.player.yaw)) * turn;
      this.player.pitch = THREE.MathUtils.lerp(this.player.pitch, desiredPitch, turn);
    }

    const local = t - boundaries[segment];
    const katana = segment === 4;
    const triggerPeriod = katana ? 0.78 : segment === 1 ? 1.05 : segment === 2 ? 0.72 : segment === 3 ? 1.3 : 0.19;
    const firing = t > 3 && (local % triggerPeriod) < (katana ? 0.09 : segment === 0 || segment === 5 ? 0.12 : 0.08);
    const move = katana ? 0.16 : segment === 3 ? 0.08 : 0.32;
    return {
      ...base,
      moveX: Math.sin(t * 0.72) * (katana ? 0.18 : 0.32),
      moveZ: move,
      sprint: segment === 0 && local < 6,
      primary: firing,
      secondary: (segment === 3 && local > 3 && local < 12) || (katana && local > 8 && local < 11),
      controlsActive: true,
      pointerLocked: false,
      lookX: Math.sin(t * 1.7) * 0.35,
      lookY: Math.cos(t * 1.3) * 0.18,
    };
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

  private updatePixelRatio(width = window.innerWidth, height = window.innerHeight): void {
    if (this.captureMode) {
      this.renderer.setPixelRatio(1);
      return;
    }
    const pixelBudget = this.qualityScale < 1 ? 1_000_000 : 2_000_000;
    const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, width * height));
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5, budgetRatio) * this.qualityScale;
    this.renderer.setPixelRatio(Math.max(0.5, ratio));
  }

  private updatePerformanceTier(delta: number): void {
    if (this.captureMode || this.qualityScale < 1) return;
    this.lowFpsSeconds = this.smoothedFps < 26
      ? this.lowFpsSeconds + delta
      : Math.max(0, this.lowFpsSeconds - delta * 0.5);
    if (this.lowFpsSeconds < 3) return;
    this.qualityScale = 0.75;
    this.lowFpsSeconds = 0;
    this.resize();
    this.hud.showTip('LOW POWER MODE', 2);
  }

  private readonly handleVisibilityChange = (): void => {
    this.pageVisible = !document.hidden;
    if (!this.pageVisible) {
      if (!this.forcePointerFallback && (this.pointerLockRequested || document.pointerLockElement === this.canvas)) {
        this.controlRequest += 1;
        this.pointerLockRequested = false;
        this.input.setPointerFallback(false);
        if (document.pointerLockElement === this.canvas) void document.exitPointerLock();
        if (this.state.mode === 'playing' && !this.capturePlayback) this.setMode('paused');
      }
      this.audio.suspend();
      cancelAnimationFrame(this.requestId);
      this.requestId = 0;
      return;
    }
    this.previousTime = performance.now();
    if (!this.contextLost && this.requestId === 0) this.requestId = requestAnimationFrame(this.frame);
  };

  private readonly handleContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.audio.suspend();
    cancelAnimationFrame(this.requestId);
    this.requestId = 0;
    const title = document.querySelector<HTMLElement>('#overlay-title');
    const copy = document.querySelector<HTMLElement>('#overlay-copy');
    if (title) title.textContent = '图形已暂停';
    if (copy) copy.textContent = '绘图画布暂时中断，正在等待恢复……';
    this.overlay.classList.add('visible');
  };

  private readonly handleContextRestored = (): void => {
    this.contextLost = false;
    this.previousTime = performance.now();
    this.overlay.classList.remove('visible');
    if (this.pageVisible && this.requestId === 0) this.requestId = requestAnimationFrame(this.frame);
  };

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
    this.renderer.info.reset();
    this.renderer.autoClear = true;
    this.camera.layers.set(0);
    if (this.inkOutline) this.inkOutline.render(this.renderer, this.scene, this.camera);
    else this.renderer.render(this.scene, this.camera);
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
    stage.textContent = `第 ${wave} 阵 · ${Math.round(this.smoothedFps)} 帧／秒 · ${this.enemies.livingCount} 名敌人`;
  }
}
