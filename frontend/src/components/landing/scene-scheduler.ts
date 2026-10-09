/** Yield between construction batches and stop work while the tab is hidden. */
export async function yieldSceneTask(signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  await new Promise<void>((resolve, reject) => {
    const channel = typeof MessageChannel === 'undefined' ? null : new MessageChannel();
    let timer: number | undefined;
    const abort = () => { cleanup(); reject(signal.reason); };
    const visible = () => { if (!document.hidden) { cleanup(); resolve(); } };
    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      channel?.port1.close();
      channel?.port2.close();
      signal.removeEventListener('abort', abort);
      document.removeEventListener('visibilitychange', visible);
    };
    signal.addEventListener('abort', abort, { once: true });
    document.addEventListener('visibilitychange', visible);
    // Nested timers are clamped to at least 4 ms by browsers. A posted task
    // still yields to input and painting without adding that delay to every
    // geometry batch and shader variant during the first scene build.
    if (channel) {
      channel.port1.onmessage = visible;
      channel.port2.postMessage(null);
    } else {
      timer = window.setTimeout(visible, 0);
    }
  });
  signal.throwIfAborted();
}
