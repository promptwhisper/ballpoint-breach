export type GameSound = 'rifle' | 'shotgun' | 'revolver' | 'sniper' | 'katana' | 'hit' | 'headshot' | 'reload' | 'grapple' | 'hurt' | 'wave' | 'boss';

export class AudioSystem {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  resume(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.12;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') void this.context.resume();
  }

  play(sound: GameSound): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    const settings: Record<GameSound, [number, number, OscillatorType, number]> = {
      rifle: [145, 62, 'square', 0.055],
      shotgun: [92, 38, 'sawtooth', 0.16],
      revolver: [118, 52, 'square', 0.11],
      sniper: [78, 28, 'sawtooth', 0.22],
      katana: [620, 190, 'sawtooth', 0.12],
      hit: [760, 520, 'sine', 0.06],
      headshot: [1160, 710, 'triangle', 0.11],
      reload: [310, 240, 'square', 0.08],
      grapple: [420, 105, 'sawtooth', 0.18],
      hurt: [120, 68, 'sawtooth', 0.13],
      wave: [330, 660, 'triangle', 0.32],
      boss: [72, 42, 'sawtooth', 0.48],
    };
    const [from, to, type, duration] = settings[sound];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + duration);
    gain.gain.setValueAtTime(sound === 'boss' ? 0.7 : 0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  }
}
