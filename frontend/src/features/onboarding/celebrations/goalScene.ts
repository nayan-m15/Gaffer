import { BALL_SVG } from "./futbolMark";
import { BALL_DELAY_MS, BALL_MS, SCENE_PLAY_DELAY_MS } from "./timings";
import {
  createSceneRoot,
  type ImpactOrigin,
  type SceneController,
} from "./types";

const GOAL_SVG = `
<svg viewBox="0 0 420 260" fill="none" aria-hidden="true">
  <g class="goal-unlock-net">
    <path d="M70 46 L350 46 L332 214 L88 214 Z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.32)" stroke-width="1.2"/>
    <path d="M70 46 L48 28 M350 46 L372 28 M88 214 L48 228 M332 214 L372 228" stroke="rgba(255,255,255,0.28)" stroke-width="1.1"/>
    <path d="M98 46 L110 214 M126 46 L132 214 M154 46 L154 214 M182 46 L176 214 M210 46 L210 214 M238 46 L244 214 M266 46 L266 214 M294 46 L288 214 M322 46 L310 214" stroke="rgba(255,255,255,0.22)" stroke-width="0.9"/>
    <path d="M66 74 L354 74 M64 102 L356 102 M68 130 L352 130 M76 158 L344 158 M82 186 L338 186" stroke="rgba(255,255,255,0.2)" stroke-width="0.9"/>
  </g>
  <rect x="42" y="26" width="16" height="206" rx="4" fill="#fff"/>
  <rect x="362" y="26" width="16" height="206" rx="4" fill="#fff"/>
  <rect x="42" y="18" width="336" height="16" rx="4" fill="#fff"/>
</svg>
`;

export function createGoalScene(visual: HTMLElement): SceneController {
  const root = createSceneRoot();
  root.innerHTML = GOAL_SVG;
  visual.append(root);

  const ball = document.createElement("div");
  ball.className = "goal-unlock-ball";
  ball.innerHTML = BALL_SVG;
  visual.append(ball);

  let setTimer = 0;
  let stopped = false;
  const animations: Animation[] = [];

  return {
    root,
    play() {
      if (stopped || !ball.isConnected) return;
      const startX = kickStartX(root);
      const startY = window.innerHeight - 28;
      const tf = (x: number, y: number, rot: number, scale: number) =>
        `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;

      ball.style.transform = tf(startX, startY, 0, 1);
      ball.classList.add("is-kicking");
      const setMs = BALL_DELAY_MS - SCENE_PLAY_DELAY_MS;
      try {
        animations.push(
          ball.animate(
            [
              { transform: tf(startX, startY, 0, 1) },
              { transform: tf(startX, startY - 11, -12, 1.05) },
              { transform: tf(startX, startY, 0, 1) },
            ],
            {
              duration: setMs,
              easing: "ease-in-out",
            },
          ),
        );
      } catch {
        /* keep the kick even if the set-bounce animation is unavailable */
      }
      setTimer = window.setTimeout(() => {
        if (stopped || !ball.isConnected) return;
        try {
          kickBall(ball, root, animations, () => stopped);
        } catch (error) {
          console.error("Unlock celebration scene.play failed", error);
        }
      }, setMs);
    },
    impact() {
      if (stopped) return;
      ball.classList.add("is-gone");
      root.querySelector(".goal-unlock-net")?.classList.add("is-bulging");
    },
    getImpactOrigin() {
      return goalOrigin(root);
    },
    teardown() {
      stopped = true;
      if (setTimer) window.clearTimeout(setTimer);
      setTimer = 0;
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

function kickBall(
  ball: HTMLElement,
  goalWrap: HTMLElement,
  animations: Animation[],
  isStopped: () => boolean,
): void {
  if (isStopped() || !ball.isConnected) return;
  const startX = kickStartX(goalWrap);
  const startY = window.innerHeight - 28;
  const rect = goalWrap.getBoundingClientRect();
  const endX = rect.left + rect.width / 2;
  const endY = rect.top + rect.height * 0.4;
  const midX = (startX + endX) / 2 + 56;
  const midY = Math.min(startY, endY) - 90;

  const tf = (x: number, y: number, rot: number, scale: number) =>
    `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;

  ball.style.transform = tf(startX, startY, 0, 1);
  try {
    animations.push(
      ball.animate(
        [
          { transform: tf(startX, startY, 0, 1) },
          { transform: tf(midX, midY, 380, 0.74) },
          { transform: tf(endX, endY, 720, 0.5) },
        ],
        {
          duration: BALL_MS,
          easing: "cubic-bezier(0.18, 0.7, 0.28, 1)",
          fill: "forwards",
        },
      ),
    );
  } catch {
    /* kick pose already applied */
  }
}

function kickStartX(goalWrap: HTMLElement): number {
  const stage = goalWrap.parentElement;
  if (stage instanceof HTMLElement) {
    const rect = stage.getBoundingClientRect();
    return rect.left + rect.width / 2;
  }
  return window.innerWidth / 2;
}

function goalOrigin(goalWrap: HTMLElement): ImpactOrigin {
  const rect = goalWrap.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height * 0.42,
  };
}
