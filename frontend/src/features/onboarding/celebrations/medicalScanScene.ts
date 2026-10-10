import { BUILD_MS } from "./timings";
import { createSceneRoot, sceneCenter, type SceneController } from "./types";

/** Ionicons `IoBody` (react-icons/io5) — used if the mannequin PNG is not ready. */
const BODY_SHAPES = `
  <circle cx="256" cy="56" r="56"/>
  <path d="M437 128H75a27 27 0 0 0 0 54h101.88c6.91 0 15 3.09 19.58 15 5.35 13.83 2.73 40.54-.57 61.23l-4.32 24.45a.42.42 0 0 1-.12.35l-34.6 196.81A27.43 27.43 0 0 0 179 511.58a27.06 27.06 0 0 0 31.42-22.29l23.91-136.8S242 320 256 320c14.23 0 21.74 32.49 21.74 32.49l23.91 136.92a27.24 27.24 0 1 0 53.62-9.6L320.66 283a.45.45 0 0 0-.11-.35l-4.33-24.45c-3.3-20.69-5.92-47.4-.57-61.23 4.56-11.88 12.91-15 19.28-15H437a27 27 0 0 0 0-54z"/>
`;

/**
 * Camera constants copied from `smooth-player-snapshot.ts` (not exported there):
 * feet at y = 0, crown at FIGURE_HEIGHT, 6% ortho pad, 200×360, look-at mid-figure.
 */
const SNAPSHOT_FIGURE_HEIGHT = 1.8;
const SNAPSHOT_FRUSTUM_PAD = 1.06;
const SNAPSHOT_RENDER_WIDTH = 200;
const SNAPSHOT_RENDER_HEIGHT = 360;
/** From `body-model.ts` `REGION_PLACEMENTS.knee_left.hotspot` (x, y). */
const KNEE_LEFT_X = 0.07;
const KNEE_LEFT_Y = 0.515;

let readySnapshotUrl: string | null = null;
let snapshotPromise: Promise<string> | null = null;

export function preloadMedicalScanSnapshot(): void {
  if (!snapshotPromise) {
    snapshotPromise = import("@/features/injuries/smooth-player-snapshot")
      .then((mod) => mod.getSmoothPlayerSnapshot())
      .then((url) => {
        readySnapshotUrl = url;
        return url;
      })
      .catch((error) => {
        snapshotPromise = null;
        readySnapshotUrl = null;
        throw error;
      });
  }
  void snapshotPromise.catch(() => {});
}

function snapshotPointPercent(
  worldX: number,
  worldY: number,
): { left: number; top: number } {
  const halfHeight = (SNAPSHOT_FIGURE_HEIGHT / 2) * SNAPSHOT_FRUSTUM_PAD;
  const halfWidth = halfHeight * (SNAPSHOT_RENDER_WIDTH / SNAPSHOT_RENDER_HEIGHT);
  const lookY = SNAPSHOT_FIGURE_HEIGHT / 2;
  const frustumTop = lookY + halfHeight;
  const frustumBottom = lookY - halfHeight;
  return {
    left: (worldX / halfWidth) * 50 + 50,
    top: ((frustumTop - worldY) / (frustumTop - frustumBottom)) * 100,
  };
}

function iconMarkup(): string {
  const clipId = `unlock-scan-clip-${Math.random().toString(36).slice(2, 9)}`;
  return `
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
  `;
}

function snapshotMarkup(kneeLeft: number, kneeTop: number): string {
  return `
    <div class="unlock-scene-scan-figure">
      <img class="unlock-scene-scan-photo" alt="" />
      <div class="unlock-scene-scan-fill"></div>
      <div class="unlock-scene-scan-beam"></div>
      <span class="unlock-scene-figure-spot-wrap" style="left:${kneeLeft}%;top:${kneeTop}%">
        <span class="unlock-scene-spot unlock-scene-figure-spot"></span>
      </span>
    </div>
  `;
}

export function createMedicalScanScene(visual: HTMLElement): SceneController {
  const snapshotUrl = readySnapshotUrl;
  const root = createSceneRoot("unlock-scene-scan");
  const knee = snapshotPointPercent(KNEE_LEFT_X, KNEE_LEFT_Y);
  root.innerHTML = `
    <div class="unlock-scene-scan-layout">
      ${snapshotUrl ? snapshotMarkup(knee.left, knee.top) : iconMarkup()}
      <p class="unlock-scene-scan-readout">SCAN 0%</p>
    </div>
    <p class="unlock-scene-recovered">RECOVERED</p>
  `;
  visual.append(root);

  if (snapshotUrl) {
    const photo = root.querySelector(".unlock-scene-scan-photo");
    if (photo instanceof HTMLImageElement) photo.src = snapshotUrl;
    const fill = root.querySelector(".unlock-scene-scan-fill");
    if (fill instanceof HTMLElement) {
      const mask = `url("${snapshotUrl}")`;
      fill.style.maskImage = mask;
      fill.style.webkitMaskImage = mask;
    }
  }

  let frame = 0;
  let stopped = false;

  return {
    root,
    play() {
      const clip = root.querySelector(".unlock-scene-scan-clip");
      const svgLine = root.querySelector(".unlock-scene-scan-line");
      const fill = root.querySelector(".unlock-scene-scan-fill");
      const beam = root.querySelector(".unlock-scene-scan-beam");
      const spot = root.querySelector(".unlock-scene-spot");
      const readout = root.querySelector(".unlock-scene-scan-readout");
      const badge = root.querySelector(".unlock-scene-recovered");
      const start = performance.now();
      const scanTop = 8;
      const scanBottom = 504;
      const iconKneeY = 418;
      const photoKneeTop = snapshotPointPercent(KNEE_LEFT_X, KNEE_LEFT_Y).top;

      const tick = (now: number) => {
        if (stopped) return;
        try {
          const t = Math.min(1, (now - start) / BUILD_MS);
          const pct = t * 100;
          if (clip instanceof SVGRectElement) {
            const y = scanTop + (scanBottom - scanTop) * t;
            clip.setAttribute("height", String(y));
            if (svgLine instanceof SVGRectElement) svgLine.setAttribute("y", String(y));
            if (spot && y >= iconKneeY) spot.classList.add("is-healed");
          } else {
            if (fill instanceof HTMLElement) {
              fill.style.clipPath = `inset(0 0 ${100 - pct}% 0)`;
            }
            if (beam instanceof HTMLElement) {
              beam.style.top = `${pct}%`;
            }
            if (spot && pct >= photoKneeTop) spot.classList.add("is-healed");
          }
          if (readout) readout.textContent = `SCAN ${Math.round(pct)}%`;
          if (t < 1) {
            frame = requestAnimationFrame(tick);
            return;
          }
          badge?.classList.add("is-on");
        } catch {
          stopped = true;
        }
      };

      frame = requestAnimationFrame(tick);
    },
    impact() {},
    getImpactOrigin() {
      const body =
        root.querySelector(".unlock-scene-scan-figure") ??
        root.querySelector(".unlock-scene-body-svg");
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
      frame = 0;
    },
  };
}
