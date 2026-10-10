/** The print document owns its DOM, listeners and pending readiness work. */
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function waitForReportReady(element: HTMLElement, signal: AbortSignal): Promise<void> {
  if (document.fonts) await abortable(document.fonts.ready, signal);
  signal.throwIfAborted();
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    let frame = 0;
    const abort = () => { cancelAnimationFrame(frame); signal.removeEventListener("abort", abort); reject(signal.reason); };
    const check = () => {
      if (signal.aborted) { abort(); return; }
      const charts = [...element.querySelectorAll(".stats-chart")];
      const ready = charts.every((chart) => {
        const svg = chart.querySelector(".recharts-wrapper > svg.recharts-surface");
        return svg && svg.getBoundingClientRect().width > 0 && svg.querySelector(".recharts-line, .recharts-area, .recharts-bar");
      });
      if (ready) { signal.removeEventListener("abort", abort); resolve(); }
      else if (performance.now() - started > 10000) {
        signal.removeEventListener("abort", abort);
        reject(new Error("Report charts could not be rendered. Please try again."));
      } else frame = requestAnimationFrame(check);
    };
    signal.addEventListener("abort", abort, { once: true });
    frame = requestAnimationFrame(check);
  });
}

export async function printTeamReport(element: HTMLElement, signal: AbortSignal): Promise<void> {
  await waitForReportReady(element, signal);
  signal.throwIfAborted();
  const frame = document.createElement("iframe");
  frame.title = "Gaffer report print document";
  frame.dataset.gafferReportPrint = "true";
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  // A renderable A4 target; display:none prevents reliable print layout.
  frame.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;pointer-events:none";
  document.body.append(frame);
  const cleanups: Array<() => void> = [];
  const abortFrame = () => frame.remove();
  signal.addEventListener("abort", abortFrame, { once: true });
  try {
    const target = frame.contentDocument;
    const printWindow = frame.contentWindow;
    if (!target || !printWindow) throw new Error("The print document could not be opened.");
    target.title = "Gaffer Team Performance Report";
    const base = target.createElement("base");
    base.href = document.baseURI;
    target.head.append(base);
    const styleLoads: Promise<void>[] = [];
    document.querySelectorAll('style, link[rel="stylesheet"]').forEach((style) => {
      const copy = style.cloneNode(true) as HTMLStyleElement | HTMLLinkElement;
      if (copy instanceof HTMLLinkElement) {
        styleLoads.push(new Promise<void>((resolve, reject) => {
          const loaded = () => resolve();
          const failed = () => reject(new Error("Report styles could not be loaded."));
          copy.addEventListener("load", loaded, { once: true });
          copy.addEventListener("error", failed, { once: true });
          cleanups.push(() => { copy.removeEventListener("load", loaded); copy.removeEventListener("error", failed); });
        }));
      }
      target.head.append(copy);
    });
    target.body.className = "gaffer-report-print-document";
    const report = element.cloneNode(true) as HTMLElement;
    report.querySelectorAll<SVGSVGElement>("svg.recharts-surface").forEach((svg) => {
      if (!svg.getAttribute("viewBox")) svg.setAttribute("viewBox", "0 0 " + svg.getAttribute("width") + " " + svg.getAttribute("height"));
    });
    target.body.append(report);
    await abortable(Promise.all(styleLoads), signal);
    if (target.fonts) await abortable(target.fonts.ready, signal);
    await abortable(Promise.all([...target.images].map((img) => img.decode())), signal);
    signal.throwIfAborted();
    await new Promise<void>((resolve, reject) => {
      const media = printWindow.matchMedia("print");
      let enteredPrint = false;
      const finished = () => resolve();
      const mediaChanged = (event: MediaQueryListEvent) => {
        if (event.matches) enteredPrint = true;
        else if (enteredPrint) finished();
      };
      const aborted = () => reject(signal.reason);
      printWindow.addEventListener("afterprint", finished);
      media.addEventListener("change", mediaChanged);
      signal.addEventListener("abort", aborted, { once: true });
      cleanups.push(() => {
        printWindow.removeEventListener("afterprint", finished);
        media.removeEventListener("change", mediaChanged);
        signal.removeEventListener("abort", aborted);
      });
      // Some browsers return before capture. Close preview is the recovery
      // path if afterprint and matchMedia transitions are unavailable.
      try { printWindow.focus(); printWindow.print(); } catch (error) { reject(error); }
    });
  } finally {
    cleanups.forEach((cleanup) => cleanup());
    signal.removeEventListener("abort", abortFrame);
    frame.remove();
  }
}
