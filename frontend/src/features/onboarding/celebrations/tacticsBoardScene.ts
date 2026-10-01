import { BUILD_MS } from "./timings";
import { createSceneRoot, sceneCenter, type SceneController } from "./types";

const MAGNETS = [
  { left: "50%", top: "81%", kind: "gk" },
  { left: "36%", top: "66%", kind: "outfield" },
  { left: "64%", top: "66%", kind: "outfield" },
  { left: "22%", top: "46%", kind: "outfield" },
  { left: "50%", top: "48%", kind: "outfield" },
  { left: "78%", top: "46%", kind: "outfield" },
  { left: "50%", top: "27%", kind: "outfield" },
] as const;

export function createTacticsBoardScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot("unlock-scene-tactics");
  root.innerHTML = `
    <div class="unlock-scene-tactics-board">
      <svg viewBox="0 0 420 260" fill="none" aria-hidden="true">
        <defs>
          <marker id="unlock-scene-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
            <path d="M0 0 L8 4 L0 8 Z" fill="#dc2626"/>
          </marker>
        </defs>
        <rect x="10" y="10" width="400" height="240" rx="8" fill="#f4f4f0" stroke="#b9b49f" stroke-width="8"/>
        <rect x="48" y="32" width="324" height="196" stroke="#15803d" stroke-width="2"/>
        <line x1="210" y1="32" x2="210" y2="228" stroke="#15803d" stroke-width="1.6"/>
        <circle cx="210" cy="130" r="28" stroke="#15803d" stroke-width="1.6"/>
        <circle cx="210" cy="130" r="2.4" fill="#15803d"/>
        <rect x="108" y="188" width="204" height="40" stroke="#15803d" stroke-width="1.5"/>
        <rect x="155" y="208" width="110" height="20" stroke="#15803d" stroke-width="1.2"/>
        <rect x="108" y="32" width="204" height="40" stroke="#15803d" stroke-width="1.5"/>
        <rect x="155" y="32" width="110" height="20" stroke="#15803d" stroke-width="1.2"/>
        <path class="unlock-scene-run" d="M218 122 C 248 108, 252 92, 222 76" marker-end="url(#unlock-scene-arrowhead)"/>
        <path class="unlock-scene-run" d="M318 118 C 286 98, 268 82, 238 72" marker-end="url(#unlock-scene-arrowhead)"/>
      </svg>
      ${MAGNETS.map(
        (magnet) =>
          `<span class="unlock-scene-magnet unlock-scene-magnet-${magnet.kind}" style="left:${magnet.left};top:${magnet.top}"></span>`,
      ).join("")}
    </div>
  `;
  visual.append(root);

  const animations: Animation[] = [];

  return {
    root,
    play() {
      const magnets = root.querySelectorAll(".unlock-scene-magnet");
      const magnetDuration = Math.round(BUILD_MS * 0.48);
      const magnetStagger = Math.round(BUILD_MS * 0.075);
      const runDuration = Math.round(BUILD_MS * 0.32);
      const runDelay = BUILD_MS - runDuration;
      magnets.forEach((node, index) => {
        if (!(node instanceof HTMLElement) || !node.isConnected) return;
        const fromLeft = index % 2 === 0;
        const fromX = fromLeft ? -170 : 170;
        const overshoot = fromLeft ? 12 : -12;
        try {
          animations.push(
            node.animate(
              [
                { transform: `translate(${fromX}px, 0)`, opacity: 0 },
                {
                  transform: `translate(${overshoot}px, 0)`,
                  opacity: 1,
                  offset: 0.78,
                },
                { transform: "translate(0, 0)", opacity: 1 },
              ],
              {
                duration: magnetDuration,
                delay: index * magnetStagger,
                easing: "cubic-bezier(0.22, 1.4, 0.36, 1)",
                fill: "forwards",
              },
            ),
          );
        } catch {
          node.style.opacity = "1";
        }
      });

      for (const path of root.querySelectorAll(".unlock-scene-run")) {
        if (!(path instanceof SVGPathElement) || !path.isConnected) continue;
        let length = 0;
        try {
          length = path.getTotalLength();
        } catch {
          continue;
        }
        if (!Number.isFinite(length) || length <= 0) continue;
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
        try {
          animations.push(
            path.animate([{ strokeDashoffset: `${length}` }, { strokeDashoffset: "0" }], {
              duration: runDuration,
              delay: runDelay,
              easing: "ease-out",
              fill: "forwards",
            }),
          );
        } catch {
          path.style.strokeDashoffset = "0";
        }
      }
    },
    impact() {},
    getImpactOrigin() {
      const board = root.querySelector(".unlock-scene-tactics-board");
      if (board instanceof HTMLElement) return sceneCenter(board);
      return sceneCenter(root);
    },
    teardown() {
      for (const animation of animations) {
        try {
          animation.cancel();
        } catch {
          /* already finished or cancelled */
        }
      }
      animations.length = 0;
    },
  };
}
