import type { CanvasRecorderOptions } from './canvasRecorder';

/** Recording downloads are disabled in the offline mini-tool container. */
export function recordCanvas(_canvas: HTMLCanvasElement, _options: CanvasRecorderOptions): void {
  // Deliberately empty: file downloads and blob media are not supported by the container.
}
