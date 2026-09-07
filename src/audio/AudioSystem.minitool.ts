import { AUDIO_CUES, type GameSound } from './clips';
import type { AudioStatus } from './AudioSystem';
import { PlaybackSession, audioTimeout } from './PlaybackSession';
export type { GameSound } from './clips';

type AudioData = Partial<Record<GameSound, string>>;
interface Voice { source: AudioBufferSourceNode; gain: GainNode; release: () => void }

function createContext(): AudioContext | null {
  const host = window as Window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Context = host.AudioContext ?? host.webkitAudioContext;
  return Context ? new Context() : null;
}

/** Experimental mini-tool adapter: decode bundled recordings, never synthesize effects. */
export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<GameSound, Promise<AudioBuffer>>();
  private readonly voices = new Set<Voice>();
  private readonly latest = new Map<GameSound, number>();
  private enabled = true;
  private activated = false;
  private disposed = false;
  private generation = 0;
  private serial = 0;
  private pendingResume: Promise<void> | null = null;
  private warming = false;
  private status: AudioStatus = 'locked';
  onStatus: ((status: AudioStatus) => void) | null = null;

  constructor(
    private readonly contextFactory: () => AudioContext | null = createContext,
    private readonly readData: () => AudioData = () => (window as Window & { AUDIO_DATA?: AudioData }).AUDIO_DATA ?? {},
    private readonly now: () => number = () => performance.now(),
    private readonly session = new PlaybackSession(),
  ) {}

  getStatus(): AudioStatus { return this.status; }

  /** Context creation/resume must happen before any await, in a user gesture. */
  resume(): void {
    if (this.disposed || !this.enabled || this.status === 'unsupported') return;
    this.activated = true;
    const epoch = this.generation;
    try {
      this.session.acquire();
      if (!this.context || this.context.state === 'closed') {
        this.buffers.clear();
        this.context = this.contextFactory();
        if (!this.context) { this.setStatus('unsupported'); return; }
        this.master = this.context.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.context.destination);
        this.context.onstatechange = () => {
          if (!this.disposed && this.enabled && this.activated && this.context?.state !== 'running') {
            this.setStatus('blocked');
          }
        };
      }
      if (this.pendingResume) return;
      const context = this.context;
      const result = context.state === 'running' ? Promise.resolve() : context.resume();
      const pending = audioTimeout(Promise.resolve(result), 'Audio resume', 2000).then(() => {
        if (this.disposed || epoch !== this.generation || !this.activated) return;
        this.setStatus(context.state === 'running' ? 'ready' : 'blocked');
        if (context.state === 'running') this.prewarm();
      }).catch(() => {
        if (!this.disposed && epoch === this.generation) this.fail();
      }).then(() => { if (this.pendingResume === pending) this.pendingResume = null; });
      this.pendingResume = pending;
    } catch { this.fail(); }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.suspend();
      this.setStatus('muted');
    } else {
      this.setStatus('locked');
      this.resume();
    }
  }

  play(sound: GameSound): void {
    if (!this.enabled || !this.activated || this.disposed || !this.context) return;
    const epoch = this.generation;
    const request = ++this.serial;
    const requestedAt = this.now();
    this.latest.set(sound, request);
    // Keep only the newest waiting request for each cue. Never replay a backlog.
    // A retry click may request playback before resume() has finished.
    void (this.pendingResume ?? Promise.resolve()).then(() => this.decode(sound)).then((buffer) => {
      if (this.disposed || !this.activated || !this.enabled || epoch !== this.generation
        || this.latest.get(sound) !== request || this.now() - requestedAt > 350) return;
      const context = this.context;
      if (!context || !this.master || context.state !== 'running') {
        this.setStatus('blocked');
        return;
      }
      while (this.voices.size >= 6) this.voices.values().next().value?.release();
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = AUDIO_CUES[sound].gain;
      let released = false;
      const voice: Voice = { source, gain, release: () => {
        if (released) return;
        released = true;
        source.onended = null;
        try { source.stop(); } catch { /* Already ended / not started. */ }
        source.disconnect();
        gain.disconnect();
        this.voices.delete(voice);
      } };
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(this.master);
      source.onended = voice.release;
      this.voices.add(voice);
      try { source.start(); } catch (error) { voice.release(); throw error; }
      this.setStatus('ready');
    }).catch(() => {
      if (!this.disposed && this.enabled && epoch === this.generation) this.fail();
    });
  }

  suspend(): void {
    this.activated = false;
    this.generation += 1;
    this.pendingResume = null;
    this.latest.clear();
    for (const voice of this.voices) voice.release();
    this.session.release();
    if (this.context && this.context.state !== 'closed') {
      try { void Promise.resolve(this.context.suspend()).catch(() => {}); } catch { /* Host interruption. */ }
    }
    if (this.enabled && this.status !== 'unsupported') this.setStatus('locked');
  }

  dispose(): void {
    this.suspend();
    this.disposed = true;
    this.buffers.clear();
    this.master?.disconnect();
    if (this.context) {
      this.context.onstatechange = null;
      try { void Promise.resolve(this.context.close()).catch(() => {}); } catch { /* Already closed. */ }
    }
    this.master = null;
    this.context = null;
    this.onStatus = null;
  }

  private decode(sound: GameSound): Promise<AudioBuffer> {
    const cached = this.buffers.get(sound);
    if (cached) return cached;
    const context = this.context;
    const encoded = this.readData()[sound];
    if (!context || !encoded) return Promise.reject(new Error(`Missing audio sample: ${sound}`));
    const pending = audioTimeout(new Promise<AudioBuffer>((resolve, reject) => {
      try {
        const binary = atob(encoded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        // Callback and Promise forms are both supported; resolving twice is safe.
        const result = context.decodeAudioData(bytes.buffer, resolve, reject);
        if (result && typeof result.then === 'function') void result.then(resolve, reject);
      } catch (error) { reject(error); }
    }), `Decode ${sound}`).catch((error) => {
      if (this.buffers.get(sound) === pending) this.buffers.delete(sound);
      throw error;
    });
    this.buffers.set(sound, pending);
    return pending;
  }

  private prewarm(): void {
    if (this.warming) return;
    this.warming = true;
    const epoch = this.generation;
    // Decode once and sequentially; no sound is played during prewarming.
    void (async () => {
      for (const sound of Object.keys(AUDIO_CUES) as GameSound[]) {
        if (this.disposed || epoch !== this.generation) break;
        try { await this.decode(sound); } catch (error) {
          if (!this.disposed && epoch === this.generation) this.fail();
          break;
        }
      }
    })().then(() => { this.warming = false; }, () => { this.warming = false; });
  }

  private setStatus(status: AudioStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatus?.(status);
  }

  private fail(): void { this.setStatus('blocked'); }
}
