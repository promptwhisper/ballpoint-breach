import { Game, type PublicGameSnapshot } from './game/Game';
import { recordCanvas } from './runtime/canvasRecorder';
import { installErrorOverlay } from './runtime/errorOverlay';
import './style.css';

installErrorOverlay();

const params = new URLSearchParams(window.location.search);
const capture = params.get('capture') === '1';
const stress = params.get('stress') === '1';
const demoAim = params.get('aim') === '1';
const autoplay = params.get('autoplay') === '1';
const defeat = params.get('defeat') === '1';
const damageDemo = params.get('damage') === '1';
const fireDemo = params.get('fire') === '1';
const inkDemo = params.get('ink') === '1';
const showcase = params.get('showcase') === '1';
const record = params.get('record') === '1';
const requestedRecordDuration = Number(params.get('duration'));
const recordDuration = Number.isFinite(requestedRecordDuration)
  ? Math.min(30, Math.max(0.5, requestedRecordDuration))
  : 6.2;
const slashParam = params.get('slash');
const parsedSlash = slashParam === null ? undefined : Number(slashParam);
const katanaReviewProgress = parsedSlash !== undefined && Number.isFinite(parsedSlash)
  ? Math.min(1, Math.max(0, parsedSlash))
  : undefined;
const katanaReviewVariant = params.get('variant') === 'reverse' ? 'reverse' : 'forward';
const viewParam = params.get('view');
const reviewView = viewParam === 'rear' || viewParam === 'west' ? viewParam : undefined;
document.documentElement.classList.toggle('capture', capture);
document.documentElement.classList.toggle('showcase', showcase);

const canvas = document.querySelector<HTMLCanvasElement>('#app');
if (!canvas) throw new Error('Missing #app canvas');

const game = new Game(canvas, {
  capture,
  stress,
  demoAim,
  autoplay,
  defeat,
  damageDemo,
  fireDemo,
  inkDemo,
  showcase,
  katanaReviewProgress,
  katanaReviewVariant,
  renderSize: record ? { width: 1920, height: 952 } : undefined,
  reviewView,
});

const captureApi = {
  start: (): void => game.startForCapture(),
  snapshot: (): PublicGameSnapshot => game.getSnapshot(),
  capturePass: (): { ok: true; selector: string } => ({ ok: true, selector: 'body' }),
};

const browserWindow = window as unknown as {
  media2threejsReady: boolean;
  __IMG2THREEJS_READY__: boolean;
  __IMG2THREEJS_CAPTURE__: typeof captureApi;
  __SCRIBBLE_SIEGE__: typeof captureApi;
};
browserWindow.media2threejsReady = true;
browserWindow.__IMG2THREEJS_READY__ = true;
browserWindow.__IMG2THREEJS_CAPTURE__ = captureApi;
browserWindow.__SCRIBBLE_SIEGE__ = captureApi;
document.documentElement.dataset.media2threejsReady = 'true';
document.documentElement.dataset.captureApi = 'start,snapshot,capturePass';

if (record) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    recordCanvas(canvas, {
      durationSeconds: recordDuration,
      fileName: 'ballpoint-breach-npc-katana-showcase.webm',
      frameRate: 60,
      width: 1920,
      height: 952,
      notebookOverlay: true,
    });
  }));
}
