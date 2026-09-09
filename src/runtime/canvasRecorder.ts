import { isInkStyle, type VisualStyle } from '../render';

export interface CanvasRecorderOptions {
  durationSeconds: number;
  fileName: string;
  frameRate?: number;
  width?: number;
  height?: number;
  notebookOverlay?: boolean;
  /** Optional page/HUD treatment. Omission preserves the legacy notebook compositor. */
  visualStyle?: VisualStyle;
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

function drawInkOverlay(context: CanvasRenderingContext2D, width: number, height: number): void {
  context.save();

  const screenInk = document.querySelector<HTMLCanvasElement>('#ink-damage-overlay');
  if (screenInk && document.body.dataset.gameMode === 'playing') {
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.globalAlpha = .68;
    context.drawImage(screenInk, 0, 0, width, height);
    context.restore();
  }

  // A few long, low-alpha fibres survive video compression without becoming a
  // noisy screen filter. They remain fixed from frame to frame.
  context.globalCompositeOperation = 'multiply';
  context.strokeStyle = 'rgba(73, 65, 54, 0.035)';
  context.lineWidth = 0.6;
  for (let index = 0; index < 14; index += 1) {
    const y = ((index * 83 + 37) % height) + 0.5;
    const bend = (index % 5 - 2) * 2.4;
    context.beginPath();
    context.moveTo(-12, y);
    context.bezierCurveTo(width * 0.3, y + bend, width * 0.72, y - bend * 0.6, width + 12, y + bend * 0.25);
    context.stroke();
  }

  const charcoal = '#292b29';
  const cinnabar = '#9f3b32';
  const indigo = '#3e4b53';
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = charcoal;
  context.strokeStyle = charcoal;
  context.lineWidth = 2;
  context.font = '400 24px "BB WenKai UI", "Kaiti SC", serif';
  context.textAlign = 'left';
  context.fillText(`战绩 ${pageText('[data-hud="score"]', '0')}`, 170, 48);
  context.textAlign = 'right';
  context.font = '400 32px "BB Ink Display", "BB WenKai UI", serif';
  context.fillText(pageText('[data-hud="wave"]', '第一阵'), width - 92, 48);
  context.font = '400 18px "BB WenKai UI", "Kaiti SC", serif';
  context.fillText(pageText('[data-hud="enemies"]', '余敌 3 人'), width - 92, 76);

  const health = Math.max(0, Math.min(100, Number(pageText('[data-hud="health"]', '100')) || 0));
  context.textAlign = 'left';
  context.font = '400 20px "BB WenKai UI", "Kaiti SC", serif';
  context.fillText('生命', 170, height - 145);
  context.strokeRect(215, height - 158, 240, 13);
  context.save();
  context.globalAlpha = 0.82;
  context.fillStyle = indigo;
  context.fillRect(217, height - 156, 236 * health / 100, 9);
  context.restore();
  context.fillText(String(health), 467, height - 145);

  const ammo = pageText('[data-hud="ammo"]', '30');
  const reserve = pageText('[data-hud="reserve"]', '/150');
  context.font = '650 48px "Avenir Next Condensed", "Arial Narrow", sans-serif';
  context.fillText(`${ammo}${reserve}`, 170, height - 55);

  context.textAlign = 'right';
  context.font = '400 30px "BB Ink Display", "BB WenKai UI", serif';
  context.fillText(pageText('[data-hud="weapon-name"]', '突击步枪'), width - 92, height - 91);
  context.font = '400 15px "BB WenKai UI", "Kaiti SC", serif';
  context.fillStyle = indigo;
  context.fillText(pageText('[data-hud="weapon-description"]', '按住左键连射'), width - 92, height - 61);

  const centerX = width / 2;
  const centerY = height / 2;
  context.strokeStyle = cinnabar;
  context.lineWidth = 2;
  for (const [x1, y1, x2, y2] of [[-13, 0, -5, 0], [5, 0, 13, 0], [0, -13, 0, -5], [0, 5, 0, 13]]) {
    context.beginPath();
    context.moveTo(centerX + x1, centerY + y1);
    context.lineTo(centerX + x2, centerY + y2);
    context.stroke();
  }

  const vignette = context.createRadialGradient(centerX, centerY, width * 0.22, centerX, centerY, width * 0.66);
  vignette.addColorStop(0, 'rgba(24, 26, 25, 0)');
  vignette.addColorStop(0.82, 'rgba(24, 26, 25, 0.012)');
  vignette.addColorStop(1, 'rgba(24, 26, 25, 0.16)');
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
  status.textContent = `正在录制 · ${durationSeconds.toFixed(1)} 秒`;
  document.body.append(status);

  const width = Math.max(1, Math.round(options.width ?? canvas.width));
  const height = Math.max(1, Math.round(options.height ?? canvas.height));
  const recordingCanvas = document.createElement('canvas');
  recordingCanvas.width = width;
  recordingCanvas.height = height;
  const context = recordingCanvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Unable to create the recording compositor');
  const visualStyle = options.visualStyle ?? 'ballpoint';
  let animationFrame = 0;
  const paint = (): void => {
    context.drawImage(canvas, 0, 0, width, height);
    if (options.notebookOverlay) {
      if (isInkStyle(visualStyle)) drawInkOverlay(context, width, height);
      else drawNotebookOverlay(context, width, height);
    }
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
    status.textContent = '录制失败，请重试';
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
    link.textContent = '保存实机视频';
    status.replaceChildren(link);
    document.documentElement.dataset.recordingReady = 'true';
  });
  recorder.start(250);
  window.setTimeout(() => {
    if (recorder.state !== 'inactive') recorder.stop();
  }, durationSeconds * 1000);
}
