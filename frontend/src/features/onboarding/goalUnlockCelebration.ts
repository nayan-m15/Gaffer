import "./unlock-gate.css";
import { createUnlockScene } from "./celebrations/createScene";
import { BALL_SVG } from "./celebrations/futbolMark";
import { STAMP_HEADLINES } from "./celebrations/headlines";
import {
  BACKDROP_OUT_MS,
  BALL_DELAY_MS,
  BALL_SIZE_PX,
  CONFETTI_FADE_MS,
  CONFETTI_LIFE_MS,
  IMPACT_MS,
  MAX_PIECES,
  REVEAL_MS,
  SECOND_WAVE_MS,
  STAMP_MS,
} from "./celebrations/timings";
import type { UnlockPageKey } from "./unlocks";

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
  pageKey: UnlockPageKey;
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
  visual.append(backdrop);

  const scene = createUnlockScene(options.pageKey, visual);
  getBallImage();

  const flash = document.createElement("div");
  flash.className = "goal-unlock-flash";

  const stamp = document.createElement("div");
  stamp.className = "goal-unlock-stamp";
  stamp.innerHTML = `<p class="goal-unlock-stamp-goal">${escapeHtml(STAMP_HEADLINES[options.pageKey])}</p><p class="goal-unlock-stamp-sub">${escapeHtml(options.label.toUpperCase())} UNLOCKED</p>`;

  canvas = document.createElement("canvas");
  canvas.className = "goal-unlock-canvas";

  visual.append(flash, stamp, canvas);

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
    scene.teardown();
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
    scene.root.classList.add("is-in");
  }, 160);

  schedule(() => {
    scene.play();
  }, BALL_DELAY_MS);

  schedule(() => {
    scene.impact();
    flash.classList.add("is-on");
    stamp.classList.add("is-on");
    sizeCanvas(canvas!);
    ctx = canvas!.getContext("2d");
    if (!ctx) return;
    const origin = scene.getImpactOrigin();
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
    scene.root.classList.remove("is-in");
    scene.root.classList.add("is-out");
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
