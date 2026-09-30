import { BALL_SVG } from "./futbolMark";
import { createSceneRoot, sceneCenter, type SceneController } from "./types";

const CLOCK_MS = 600;
const EVENTS = [
  { minute: 12, kind: "ball" },
  { minute: 34, kind: "card" },
  { minute: 60, kind: "sub" },
  { minute: 78, kind: "ball" },
] as const;

const CARD_SVG = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="1.4" fill="#facc15"/></svg>`;
const SUB_SVG = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 14 V7 M5 10 L8 7 L11 10" stroke="#4ade80" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 10 V17 M13 14 L16 17 L19 14" stroke="#f87171" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function eventMark(kind: (typeof EVENTS)[number]["kind"]): string {
  if (kind === "ball") return BALL_SVG;
  if (kind === "card") return CARD_SVG;
  return SUB_SVG;
}

export function createMatchTimelineScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot("unlock-scene-timeline");
  root.innerHTML = `
    <div class="unlock-scene-timeline-board">
      <p class="unlock-scene-clock">0'</p>
      <div class="unlock-scene-track">
        <div class="unlock-scene-track-line"></div>
        <div class="unlock-scene-track-progress"></div>
        <span class="unlock-scene-tick unlock-scene-tick-start" style="left:0">0'</span>
        <span class="unlock-scene-tick unlock-scene-tick-mid" style="left:50%">HT</span>
        <span class="unlock-scene-tick unlock-scene-tick-end" style="left:100%">90'</span>
        ${EVENTS.map(
          (event) => `
            <span class="unlock-scene-event" data-minute="${event.minute}" style="left:${(event.minute / 90) * 100}%">
              <span class="unlock-scene-event-min">${event.minute}'</span>
              <span class="unlock-scene-event-mark">${eventMark(event.kind)}</span>
            </span>
          `,
        ).join("")}
      </div>
    </div>
  `;
  visual.append(root);

  let frame = 0;
  let stopped = false;

  return {
    root,
    play() {
      const clock = root.querySelector(".unlock-scene-clock");
      const progress = root.querySelector(".unlock-scene-track-progress");
      const nodes = [...root.querySelectorAll(".unlock-scene-event")];
      const popped = new Set<Element>();
      const start = performance.now();

      if (progress instanceof HTMLElement) {
        progress.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
          duration: CLOCK_MS,
          easing: "linear",
          fill: "forwards",
        });
      }

      const tick = (now: number) => {
        if (stopped) return;
        const t = Math.min(1, (now - start) / CLOCK_MS);
        const minute = Math.round(t * 90);
        if (clock) clock.textContent = `${minute}'`;
        for (const node of nodes) {
          const eventMinute = Number(node.getAttribute("data-minute"));
          if (minute >= eventMinute && !popped.has(node)) {
            popped.add(node);
            node.classList.add("is-pop");
          }
        }
        if (t < 1) {
          frame = requestAnimationFrame(tick);
        }
      };

      frame = requestAnimationFrame(tick);
    },
    impact() {},
    getImpactOrigin() {
      const track = root.querySelector(".unlock-scene-track");
      if (track instanceof HTMLElement) return sceneCenter(track);
      return sceneCenter(root);
    },
    teardown() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
    },
  };
}
