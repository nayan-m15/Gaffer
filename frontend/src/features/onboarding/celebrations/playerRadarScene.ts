import { createSceneRoot, sceneCenter, type SceneController } from "./types";

const GROW_MS = 480;
const CX = 210;
const CY = 205;
const R = 118;
const VALUES = [0.82, 0.9, 0.78, 0.86, 0.45, 0.74];
const LABELS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY"];

function hexPoint(radius: number, index: number): [number, number] {
  const angle = -Math.PI / 2 + index * (Math.PI / 3);
  return [CX + radius * Math.cos(angle), CY + radius * Math.sin(angle)];
}

function hexPoints(radius: number): string {
  return Array.from({ length: 6 }, (_, index) => hexPoint(radius, index).join(",")).join(
    " ",
  );
}

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

export function createPlayerRadarScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot("unlock-scene-radar");
  const rings = [R / 3, (R * 2) / 3, R]
    .map(
      (radius) =>
        `<polygon class="unlock-scene-radar-ring" points="${hexPoints(radius)}"/>`,
    )
    .join("");
  const axes = Array.from({ length: 6 }, (_, index) => {
    const [x, y] = hexPoint(R, index);
    return `<line class="unlock-scene-radar-axis" x1="${CX}" y1="${CY}" x2="${x}" y2="${y}"/>`;
  }).join("");
  const labels = LABELS.map((label, index) => {
    const [x, y] = hexPoint(R + 24, index);
    return `<text class="unlock-scene-radar-label" x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle">${label}</text>`;
  }).join("");
  const dots = VALUES.map((_, index) => {
    const [x, y] = hexPoint(R * VALUES[index]!, index);
    return `<circle class="unlock-scene-radar-dot" cx="${x}" cy="${y}" r="4"/>`;
  }).join("");

  root.innerHTML = `
    <div class="unlock-scene-radar-board">
      <svg viewBox="0 0 420 400" fill="none" aria-hidden="true">
        ${rings}
        ${axes}
        ${labels}
        <polygon class="unlock-scene-radar-fill" points="${hexPoints(0)}"/>
        ${dots}
        <g class="unlock-scene-radar-rating">
          <circle cx="${CX}" cy="${CY}" r="22"/>
          <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="middle">84</text>
        </g>
      </svg>
    </div>
  `;
  visual.append(root);

  let frame = 0;
  let stopped = false;

  return {
    root,
    play() {
      const fill = root.querySelector(".unlock-scene-radar-fill");
      const rating = root.querySelector(".unlock-scene-radar-rating");
      const start = performance.now();

      const tick = (now: number) => {
        if (stopped) return;
        const t = Math.min(1, (now - start) / GROW_MS);
        const eased = easeOutCubic(t);
        if (fill) {
          const points = VALUES.map((value, index) =>
            hexPoint(R * value * eased, index).join(","),
          ).join(" ");
          fill.setAttribute("points", points);
        }
        if (t < 1) {
          frame = requestAnimationFrame(tick);
          return;
        }
        for (const dot of root.querySelectorAll(".unlock-scene-radar-dot")) {
          dot.classList.add("is-on");
        }
        rating?.classList.add("is-on");
      };

      frame = requestAnimationFrame(tick);
    },
    impact() {},
    getImpactOrigin() {
      const rating = root.querySelector(".unlock-scene-radar-rating");
      if (rating instanceof Element) {
        const rect = rating.getBoundingClientRect();
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
