interface Session { type: string; state?: string }

/** Optional WebKit enhancement, not an undocumented native bridge. */
export class PlaybackSession {
  private owned: Session | null = null;
  private previous = 'auto';

  constructor(private readonly read: () => Session | undefined = () => {
    if (typeof navigator === 'undefined') return undefined;
    return (navigator as Navigator & { audioSession?: Session }).audioSession;
  }) {}

  acquire(): void {
    try {
      const session = this.read();
      if (!session || session.type === 'playback') return;
      // Default ambient playback can be silenced by the iPhone ringer switch.
      if (!this.owned) { this.previous = session.type; this.owned = session; }
      session.type = 'playback';
    } catch { /* Optional host enhancement. */ }
  }

  release(): void {
    try {
      if (this.owned?.type === 'playback') this.owned.type = this.previous;
    } catch { /* An optional host API must never break gameplay. */ }
    this.owned = null;
  }

}

export function audioTimeout<T>(task: Promise<T>, label: string, delay = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), delay);
    task.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
