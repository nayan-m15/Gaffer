/** Yield between construction batches and stop work while the tab is hidden. */
export async function yieldSceneTask(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const visible = () => { if (!document.hidden) { cleanup(); resolve(); } };
    const timer = window.setTimeout(visible, 0);
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      document.removeEventListener('visibilitychange', visible);
    };
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('visibilitychange', visible);
  });
  signal.throwIfAborted();
}
