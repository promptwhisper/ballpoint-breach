import { AUDIO_CUES, type GameSound } from './clips';
export type { GameSound } from './clips';

export type AudioStatus = 'locked' | 'ready' | 'blocked' | 'muted' | 'unsupported';
interface Voice {
  media: HTMLAudioElement;
  unlocked: boolean;
  pending: boolean;
  serial: number;
  started: number;
  source: string;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Local sampled audio only. Reuse unlocked media elements in restricted WebViews. */
export class AudioSystem {
  private readonly voices: Voice[] = [];
  private enabled = true;
  private activated = false;
  private disposed = false;
  private serial = 0;
  private status: AudioStatus = 'locked';
  onStatus: ((status: AudioStatus) => void) | null = null;

  constructor(private readonly createMedia: () => HTMLAudioElement = () => new Audio()) {}

  getStatus(): AudioStatus { return this.status; }

  /** Call synchronously inside a click/touch/key gesture, not the RAF loop. */
  resume(): void {
    if (!this.enabled || this.disposed) return;
    this.activated = true;
    if (!this.voices.length) {
      for (let i = 0; i < 6; i += 1) {
        const media = this.createMedia();
        media.preload = 'auto';
        media.src = './audio/unlock.mp3';
        media.setAttribute('playsinline', '');
        media.setAttribute('webkit-playsinline', '');
        this.voices.push({ media, unlocked: false, pending: false, serial: 0, started: 0, source: 'unlock', timer: null });
      }
    }
    for (const voice of this.voices) {
      if (voice.unlocked || voice.pending) continue;
      // A short local silent file, NOT muted autoplay: each element needs
      // permission for audible playback, even when effects are triggered in RAF.
      this.startVoice(voice, 'unlock', 0.2, true);
    }
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
    if (!this.enabled || !this.activated || this.disposed || !this.voices.length) return;
    const idle = this.voices.find((voice) => voice.source === sound && voice.unlocked && !voice.pending && voice.timer === null)
      ?? this.voices.find((voice) => voice.unlocked && !voice.pending && voice.timer === null);
    const voice = idle ?? this.voices.reduce((oldest, next) => next.started < oldest.started ? next : oldest);
    const cue = AUDIO_CUES[sound];
    this.startVoice(voice, sound, cue.duration, false);
  }

  suspend(): void {
    this.activated = false;
    for (const voice of this.voices) {
      this.stopVoice(voice);
      voice.unlocked = false;
    }
    if (this.enabled) this.setStatus('locked');
  }

  dispose(): void {
    this.suspend();
    this.disposed = true;
    for (const voice of this.voices) {
      voice.media.removeAttribute('src');
      voice.media.load();
    }
    this.voices.length = 0;
    this.onStatus = null;
  }

  private startVoice(voice: Voice, source: string, duration: number, prime: boolean): void {
    this.stopVoice(voice);
    const ticket = ++this.serial;
    voice.serial = ticket;
    voice.started = ticket;
    voice.pending = true;
    const current = (): boolean => !this.disposed && voice.serial === ticket;
    const fail = (): void => {
      if (!current()) return;
      this.stopVoice(voice);
      voice.unlocked = false;
      this.setStatus('blocked');
    };
    try {
      voice.media.volume = Math.min(1, 0.7 * (prime ? 1 : AUDIO_CUES[source as GameSound]?.gain ?? 1));
      voice.media.muted = false;
      // Reuse the same unlocked element when switching sources. Independent
      // files do not depend on HTTP Range or nonzero seeking in offline hosts.
      if (voice.source !== source) {
        voice.source = source;
        voice.media.src = `./audio/${source}.mp3`;
      } else if (voice.media.readyState > 0) voice.media.currentTime = 0;
      const result = voice.media.play();
      const started = (): void => {
        if (!current()) return;
        if (voice.timer !== null) clearTimeout(voice.timer);
        voice.timer = null;
        voice.pending = false;
        voice.unlocked = true;
        this.setStatus('ready');
        if (prime) {
          this.stopVoice(voice);
          return;
        }
        voice.timer = setTimeout(() => {
          if (current()) this.stopVoice(voice);
        }, (duration + 0.15) * 1000);
      };
      // Older engines can return void. Rejected playback never breaks gameplay.
      if (result && typeof result.then === 'function') void result.then(started).catch(fail);
      else started();
      if (voice.pending) voice.timer = setTimeout(fail, 2000);
    } catch { fail(); }
  }

  private stopVoice(voice: Voice): void {
    voice.serial = ++this.serial;
    voice.pending = false;
    if (voice.timer !== null) clearTimeout(voice.timer);
    voice.timer = null;
    voice.media.pause();
  }

  private setStatus(status: AudioStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.onStatus?.(status);
  }
}
