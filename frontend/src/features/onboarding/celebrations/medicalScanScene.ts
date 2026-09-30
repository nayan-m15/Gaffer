import { createSceneRoot, sceneCenter, type SceneController } from "./types";

const SCAN_MS = 560;
/** Ionicons `IoBody` (react-icons/io5) — front-facing standing silhouette. */
const BODY_SHAPES = `
  <circle cx="256" cy="56" r="56"/>
  <path d="M437 128H75a27 27 0 0 0 0 54h101.88c6.91 0 15 3.09 19.58 15 5.35 13.83 2.73 40.54-.57 61.23l-4.32 24.45a.42.42 0 0 1-.12.35l-34.6 196.81A27.43 27.43 0 0 0 179 511.58a27.06 27.06 0 0 0 31.42-22.29l23.91-136.8S242 320 256 320c14.23 0 21.74 32.49 21.74 32.49l23.91 136.92a27.24 27.24 0 1 0 53.62-9.6L320.66 283a.45.45 0 0 0-.11-.35l-4.33-24.45c-3.3-20.69-5.92-47.4-.57-61.23 4.56-11.88 12.91-15 19.28-15H437a27 27 0 0 0 0-54z"/>
`;

export function createMedicalScanScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot("unlock-scene-scan");
  const clipId = `unlock-scan-clip-${Math.random().toString(36).slice(2, 9)}`;
  root.innerHTML = `
    <div class="unlock-scene-scan-layout">
      <svg class="unlock-scene-body-svg" viewBox="0 0 512 512" aria-hidden="true">
        <defs>
          <clipPath id="${clipId}">
            <rect class="unlock-scene-scan-clip" x="0" y="0" width="512" height="0"/>
          </clipPath>
        </defs>
        <g class="unlock-scene-body-muted" fill="#c5cdd6">${BODY_SHAPES}</g>
        <g class="unlock-scene-body-fit" fill="#4ade80" clip-path="url(#${clipId})">${BODY_SHAPES}</g>
        <circle class="unlock-scene-spot" cx="205" cy="418" r="22"/>
        <rect class="unlock-scene-scan-line" x="70" y="8" width="372" height="8" rx="4"/>
      </svg>
      <p class="unlock-scene-scan-readout">SCAN 0%</p>
    </div>
    <p class="unlock-scene-recovered">RECOVERED</p>
  `;
  visual.append(root);

  let frame = 0;
  let stopped = false;

  return {
    root,
    play() {
      const clip = root.querySelector(".unlock-scene-scan-clip");
      const line = root.querySelector(".unlock-scene-scan-line");
      const spot = root.querySelector(".unlock-scene-spot");
      const readout = root.querySelector(".unlock-scene-scan-readout");
      const badge = root.querySelector(".unlock-scene-recovered");
      const start = performance.now();
      const scanTop = 8;
      const scanBottom = 504;
      const kneeY = 418;

      const tick = (now: number) => {
        if (stopped) return;
        const t = Math.min(1, (now - start) / SCAN_MS);
        const y = scanTop + (scanBottom - scanTop) * t;
        if (clip instanceof SVGRectElement) clip.setAttribute("height", String(y));
        if (line instanceof SVGRectElement) line.setAttribute("y", String(y));
        if (readout) readout.textContent = `SCAN ${Math.round(t * 100)}%`;
        if (spot && y >= kneeY) spot.classList.add("is-healed");
        if (t < 1) {
          frame = requestAnimationFrame(tick);
          return;
        }
        badge?.classList.add("is-on");
      };

      frame = requestAnimationFrame(tick);
    },
    impact() {},
    getImpactOrigin() {
      const body = root.querySelector(".unlock-scene-body-svg");
      if (body instanceof Element) {
        const rect = body.getBoundingClientRect();
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
      return sceneCenter(root);
    },
    teardown() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
