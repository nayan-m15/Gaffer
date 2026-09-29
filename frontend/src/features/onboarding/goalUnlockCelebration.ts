import "./unlock-gate.css";

const REVEAL_MS = 2300;
const BALL_DELAY_MS = 280;
const BALL_MS = 620;
const IMPACT_MS = BALL_DELAY_MS + BALL_MS;
const SECOND_WAVE_MS = IMPACT_MS + 280;
const BACKDROP_OUT_MS = 380;
const STAMP_MS = 1600;
const CONFETTI_LIFE_MS = 3000;
const CONFETTI_FADE_MS = 600;
const MAX_PIECES = 550;
const BALL_SIZE_PX = 20;

const FA_FUTBOL_PATH =
  "M504 256c0 136.967-111.033 248-248 248S8 392.967 8 256 119.033 8 256 8s248 111.033 248 248zm-48 0l-.003-.282-26.064 22.741-62.679-58.5 16.454-84.355 34.303 3.072c-24.889-34.216-60.004-60.089-100.709-73.141l13.651 31.939L256 139l-74.953-41.525 13.651-31.939c-40.631 13.028-75.78 38.87-100.709 73.141l34.565-3.073 16.192 84.355-62.678 58.5-26.064-22.741-.003.282c0 43.015 13.497 83.952 38.472 117.991l7.704-33.897 85.138 10.447 36.301 77.826-29.902 17.786c40.202 13.122 84.29 13.148 124.572 0l-29.902-17.786 36.301-77.826 85.138-10.447 7.704 33.897C442.503 339.952 456 299.015 456 256zm-248.102 69.571l-29.894-91.312L256 177.732l77.996 56.527-29.622 91.312h-96.476z";

const BALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" aria-hidden="true"><circle cx="256" cy="256" r="248" fill="#fff"/><path fill="#1a1a1a" d="${FA_FUTBOL_PATH}"/></svg>`;

const BALL_IMAGE_SRC = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(BALL_SVG)}`;

let ballImage: HTMLImageElement | null = null;

function getBallImage(): HTMLImageElement {
  if (!ballImage) {
    ballImage = new Image();
    ballImage.src = BALL_IMAGE_SRC;
  }
  return ballImage;
}

const FALLBACK_COLORS = [
  "#22c55e",
  "#f5c542",
  "#f97316",
  "#3b82f6",
  "#ec4899",
  "#ffffff",
];

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

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rot: number;
  rotV: number;
  sway: number;
  swayV: number;
  flutter: number;
  born: number;
  isBall: boolean;
  drag: number;
};

type CelebrationOptions = {
  label: string;
  onReveal: () => void;
  onComplete?: () => void;
};

let activeCleanup: (() => void) | null = null;

export function cancelGoalUnlockCelebration(): void {
  activeCleanup?.();
  activeCleanup = null;
}

export function isGoalUnlockCelebrationRunning(): boolean {
  return activeCleanup !== null;
}

export function startGoalUnlockCelebration(
  options: CelebrationOptions,
): () => void {
  cancelGoalUnlockCelebration();

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    options.onReveal();
    options.onComplete?.();
    return () => {};
  }

  const timers: number[] = [];
  let frame = 0;
  let revealed = false;
  let cleaned = false;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let particles: Particle[] = [];
  let wavesDone = false;
  let colors = FALLBACK_COLORS;

  const host = document.createElement("div");
  host.className = "goal-unlock-host";
  host.style.pointerEvents = "none";

  const visual = document.createElement("div");
  visual.className = "goal-unlock-visual";
  visual.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("div");
  backdrop.className = "goal-unlock-backdrop";

  const goalWrap = document.createElement("div");
  goalWrap.className = "goal-unlock-goal";
  goalWrap.innerHTML = GOAL_SVG;

  const ball = document.createElement("div");
  ball.className = "goal-unlock-ball";
  ball.innerHTML = BALL_SVG;
  getBallImage();

  const flash = document.createElement("div");
  flash.className = "goal-unlock-flash";

  const stamp = document.createElement("div");
  stamp.className = "goal-unlock-stamp";
  stamp.innerHTML = `<p class="goal-unlock-stamp-goal">GOAL!</p><p class="goal-unlock-stamp-sub">${escapeHtml(options.label.toUpperCase())} UNLOCKED</p>`;

  canvas = document.createElement("canvas");
  canvas.className = "goal-unlock-canvas";

  visual.append(backdrop, goalWrap, ball, flash, stamp, canvas);

  const live = document.createElement("div");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  live.textContent = `${options.label} unlocked`;

  host.append(visual, live);
  document.body.append(host);

  const primary = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  if (primary) {
    colors = [primary, ...FALLBACK_COLORS.slice(1)];
  }

  requestAnimationFrame(() => {
    backdrop.classList.add("is-in");
  });

  function finishCleanup(completed: boolean) {
    if (cleaned) return;
    cleaned = true;
    for (const id of timers) window.clearTimeout(id);
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    particles = [];
    host.remove();
    if (activeCleanup === cancel) activeCleanup = null;
    if (completed) options.onComplete?.();
  }

  function cancel() {
    finishCleanup(false);
  }

  activeCleanup = cancel;

  const schedule = (fn: () => void, ms: number) => {
    timers.push(window.setTimeout(fn, ms));
  };

  const reveal = () => {
    if (revealed || cleaned) return;
    revealed = true;
    options.onReveal();
  };

  schedule(() => {
    goalWrap.classList.add("is-in");
  }, 160);

  schedule(() => {
    kickBall(ball, goalWrap);
  }, BALL_DELAY_MS);

  schedule(() => {
    ball.classList.add("is-gone");
    const net = goalWrap.querySelector(".goal-unlock-net");
    net?.classList.add("is-bulging");
    flash.classList.add("is-on");
    stamp.classList.add("is-on");
    sizeCanvas(canvas!);
    ctx = canvas!.getContext("2d");
    if (!ctx) return;
    const origin = goalOrigin(goalWrap);
    spawnBurst(particles, colors, origin.x, origin.y, 170, -Math.PI * 0.92, -Math.PI * 0.08, 7, 17);
    spawnBurst(
      particles,
      colors,
      12,
      window.innerHeight - 8,
      90,
      -Math.PI * 0.72,
      -Math.PI * 0.18,
      8,
      16,
    );
    spawnBurst(
      particles,
      colors,
      window.innerWidth - 12,
      window.innerHeight - 8,
      90,
      -Math.PI * 0.82,
      -Math.PI * 0.28,
      8,
      16,
    );
    loop();
  }, IMPACT_MS);

  schedule(() => {
    spawnBurst(
      particles,
      colors,
      18,
      window.innerHeight - 10,
      50,
      -Math.PI * 0.7,
      -Math.PI * 0.22,
      6,
      13,
    );
    spawnBurst(
      particles,
      colors,
      window.innerWidth - 18,
      window.innerHeight - 10,
      50,
      -Math.PI * 0.78,
      -Math.PI * 0.3,
      6,
      13,
    );
    spawnBurst(
      particles,
      colors,
      window.innerWidth / 2,
      window.innerHeight - 6,
      10,
      -Math.PI * 0.68,
      -Math.PI * 0.32,
      7,
      14,
      true,
    );
    wavesDone = true;
  }, SECOND_WAVE_MS);

  schedule(() => {
    backdrop.classList.remove("is-in");
    backdrop.classList.add("is-out");
    goalWrap.classList.remove("is-in");
    goalWrap.classList.add("is-out");
    reveal();
  }, REVEAL_MS);

  const finishAt = SECOND_WAVE_MS + CONFETTI_LIFE_MS + CONFETTI_FADE_MS + 80;
  schedule(() => {
    if (canvas) {
      canvas.remove();
      canvas = null;
      ctx = null;
    }
  }, finishAt);

  schedule(() => finishCleanup(true), Math.max(finishAt, REVEAL_MS + BACKDROP_OUT_MS, IMPACT_MS + STAMP_MS) + 120);

  function loop() {
    if (cleaned) return;
    const now = performance.now();
    drawParticles(ctx, canvas, particles, now);
    particles = particles.filter(
      (p) => now - p.born < CONFETTI_LIFE_MS + CONFETTI_FADE_MS,
    );
    if (particles.length === 0 && wavesDone) {
      frame = 0;
      if (canvas) {
        canvas.remove();
        canvas = null;
        ctx = null;
      }
      return;
    }
    frame = requestAnimationFrame(loop);
  }

  return cancel;
}

function kickBall(ball: HTMLElement, goalWrap: HTMLElement): void {
  const startX = window.innerWidth / 2;
  const startY = window.innerHeight - 28;
  const rect = goalWrap.getBoundingClientRect();
  const endX = rect.left + rect.width / 2;
  const endY = rect.top + rect.height * 0.4;
  const midX = (startX + endX) / 2 + 56;
  const midY = Math.min(startY, endY) - 90;

  const tf = (x: number, y: number, rot: number, scale: number) =>
    `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`;

  ball.style.transform = tf(startX, startY, 0, 1);
  ball.classList.add("is-kicking");
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
  );
}

function goalOrigin(goalWrap: HTMLElement): { x: number; y: number } {
  const rect = goalWrap.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height * 0.42,
  };
}

function sizeCanvas(canvas: HTMLCanvasElement): void {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  const context = canvas.getContext("2d");
  context?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function spawnBurst(
  particles: Particle[],
  colors: string[],
  x: number,
  y: number,
  count: number,
  angleMin: number,
  angleMax: number,
  speedMin: number,
  speedMax: number,
  forceBall = false,
): void {
  const now = performance.now();
  for (let i = 0; i < count; i += 1) {
    if (particles.length >= MAX_PIECES) return;
    const angle = angleMin + Math.random() * (angleMax - angleMin);
    const speed = speedMin + Math.random() * (speedMax - speedMin);
    particles.push({
      x: x + (Math.random() - 0.5) * 18,
      y: y + (Math.random() - 0.5) * 14,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: 5 + Math.random() * 7,
      h: 7 + Math.random() * 10,
      color: colors[Math.floor(Math.random() * colors.length)] ?? colors[0],
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.28,
      sway: Math.random() * Math.PI * 2,
      swayV: 0.035 + Math.random() * 0.05,
      flutter: Math.random() * Math.PI * 2,
      born: now,
      isBall: forceBall || Math.random() < 0.1,
      drag: 0.986 + Math.random() * 0.01,
    });
  }
}

function drawParticles(
  ctx: CanvasRenderingContext2D | null,
  canvas: HTMLCanvasElement | null,
  particles: Particle[],
  now: number,
): void {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const p of particles) {
    const age = now - p.born;
    p.vy += 0.16;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.sway += p.swayV;
    p.flutter += 0.14;
    p.rot += p.rotV;
    p.x += p.vx + Math.sin(p.sway) * 0.85;
    p.y += p.vy;
    const fade =
      age <= CONFETTI_LIFE_MS
        ? 1
        : Math.max(0, 1 - (age - CONFETTI_LIFE_MS) / CONFETTI_FADE_MS);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = fade;
    if (p.isBall) {
      const img = getBallImage();
      if (!img.complete || img.naturalWidth === 0) {
        ctx.restore();
        continue;
      }
      ctx.drawImage(
        img,
        -BALL_SIZE_PX / 2,
        -BALL_SIZE_PX / 2,
        BALL_SIZE_PX,
        BALL_SIZE_PX,
      );
    } else {
      const flutter = 0.28 + 0.72 * (0.5 + 0.5 * Math.cos(p.flutter));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, (-p.h * flutter) / 2, p.w, p.h * flutter);
    }
    ctx.restore();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
