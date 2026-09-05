export interface CanvasRecorderOptions {
  durationSeconds: number;
  fileName: string;
  frameRate?: number;
  width?: number;
  height?: number;
  notebookOverlay?: boolean;
}

function supportedMimeType(): string {
  for (const candidate of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

function pageText(selector: string, fallback: string): string {
  return document.querySelector<HTMLElement>(selector)?.textContent?.trim() || fallback;
}

function drawNotebookOverlay(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();
  context.strokeStyle = 'rgba(74, 101, 158, 0.18)';
  context.lineWidth = 1;
  for (let y = 82; y < height; y += 90) {
    context.beginPath();
    context.moveTo(0, y + 0.5);
    context.lineTo(width, y + 0.5);
    context.stroke();
  }
  context.strokeStyle = 'rgba(190, 76, 91, 0.38)';
  context.beginPath();
  context.moveTo(132.5, 0);
  context.lineTo(132.5, height);
  context.stroke();

  const ink = '#27348f';
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.lineWidth = 2;
  context.font = '700 27px "Patrick Hand", "Comic Sans MS", cursive';
  context.textAlign = 'left';
  context.fillText(`SCORE ${pageText('[data-hud="score"]', '0')}`, 170, 48);
  context.textAlign = 'right';
  context.fillText(pageText('[data-hud="wave"]', 'WAVE 1'), width - 92, 48);
  context.font = '700 20px "Patrick Hand", "Comic Sans MS", cursive';
  context.fillText(pageText('[data-hud="enemies"]', '3 enemies left'), width - 92, 79);

  const health = Math.max(0, Math.min(100, Number(pageText('[data-hud="health"]', '100')) || 0));
  context.textAlign = 'left';
  context.font = '700 22px "Patrick Hand", "Comic Sans MS", cursive';
  context.fillText('HP', 170, height - 145);
  context.strokeRect(215, height - 160, 240, 16);
  context.save();
  context.beginPath();
  context.rect(215, height - 160, 240 * health / 100, 16);
  context.clip();
  for (let x = 195; x < 470; x += 9) {
    context.beginPath();
    context.moveTo(x, height - 143);
    context.lineTo(x + 16, height - 161);
    context.stroke();
  }
  context.restore();
  context.fillText(String(health), 467, height - 145);
  context.font = '900 52px "Patrick Hand", "Comic Sans MS", cursive';
  context.fillText('∞', 170, height - 55);

  context.textAlign = 'right';
  context.font = '700 18px "Patrick Hand", "Comic Sans MS", cursive';
  context.fillText('5  KATANA                         ∞', width - 92, height - 132);
  context.font = '900 37px "Patrick Hand", "Comic Sans MS", cursive';
  context.fillText('KATANA', width - 92, height - 88);
  context.font = '700 17px "Patrick Hand", "Comic Sans MS", cursive';
  context.fillText('slash · hold aim to block & return bullets', width - 92, height - 58);

  const centerX = width / 2;
  const centerY = height / 2;
  context.strokeStyle = '#71315e';
  context.lineWidth = 2;
  for (const [x1, y1, x2, y2] of [[-13, 0, -5, 0], [5, 0, 13, 0], [0, -13, 0, -5], [0, 5, 0, 13]]) {
    context.beginPath();
    context.moveTo(centerX + x1, centerY + y1);
    context.lineTo(centerX + x2, centerY + y2);
    context.stroke();
  }

  const vignette = context.createRadialGradient(centerX, centerY, width * 0.2, centerX, centerY, width * 0.64);
  vignette.addColorStop(0, 'rgba(18, 24, 67, 0)');
  vignette.addColorStop(0.8, 'rgba(18, 24, 67, 0.015)');
  vignette.addColorStop(1, 'rgba(18, 24, 67, 0.2)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.restore();
}

/** Records the live WebGL surface and exposes a deterministic local download. */
export function recordCanvas(canvas: HTMLCanvasElement, options: CanvasRecorderOptions): void {
  const durationSeconds = Math.max(0.5, Math.min(30, options.durationSeconds));
  const frameRate = Math.max(24, Math.min(60, options.frameRate ?? 60));
  const status = document.createElement('div');
  status.id = 'recording-status';
  status.textContent = `RECORDING ${durationSeconds.toFixed(1)}s`;
  document.body.append(status);

  const width = Math.max(1, Math.round(options.width ?? canvas.width));
  const height = Math.max(1, Math.round(options.height ?? canvas.height));
  const recordingCanvas = document.createElement('canvas');
  recordingCanvas.width = width;
  recordingCanvas.height = height;
  const context = recordingCanvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the recording compositor');
  let animationFrame = 0;
  const paint = (): void => {
    context.drawImage(canvas, 0, 0, width, height);
    if (options.notebookOverlay) drawNotebookOverlay(context, width, height);
    animationFrame = requestAnimationFrame(paint);
  };
  paint();

  const mimeType = supportedMimeType();
  const stream = recordingCanvas.captureStream(frameRate);
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 10_000_000,
  });
  const chunks: Blob[] = [];
  recorder.addEventListener('dataavailable', (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  recorder.addEventListener('error', () => {
    status.textContent = 'RECORDING FAILED';
    document.documentElement.dataset.recordingError = 'true';
  });
  recorder.addEventListener('stop', () => {
    cancelAnimationFrame(animationFrame);
    for (const track of stream.getTracks()) track.stop();
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    const link = document.createElement('a');
    link.id = 'recording-download';
    link.href = URL.createObjectURL(blob);
    link.download = options.fileName;
    link.textContent = 'DOWNLOAD EFFECT VIDEO';
    status.replaceChildren(link);
    document.documentElement.dataset.recordingReady = 'true';
  });
  recorder.start(250);
  window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, durationSeconds * 1000);
}
