/** Unknown capabilities retain the regular WebGL initialization/failure path. */
export async function supportsLandingScene(signal: AbortSignal): Promise<boolean> {
  signal.throwIfAborted();
  if (typeof OffscreenCanvas === 'undefined' || typeof Worker === 'undefined') return true;
  return new Promise<boolean>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./scene-capability.worker.ts', import.meta.url), { type: 'module' });
    } catch { resolve(true); return; }
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      worker.terminate();
    };
    const finish = (supported: boolean) => { cleanup(); resolve(supported); };
    const abort = () => { cleanup(); reject(signal.reason); };
    const timer = window.setTimeout(() => finish(true), 3000);
    worker.onmessage = event => finish(event.data !== false);
    worker.onerror = event => { event.preventDefault(); finish(true); };
    signal.addEventListener('abort', abort, { once: true });
  });
}
