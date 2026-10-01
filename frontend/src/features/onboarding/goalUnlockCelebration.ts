import "./unlock-gate.css";
import { createUnlockScene } from "./celebrations/createScene";
import { BALL_SVG } from "./celebrations/futbolMark";
import { STAMP_HEADLINES } from "./celebrations/headlines";
import {
  BACKDROP_OUT_MS,
  BALL_SIZE_PX,
  CELEBRATION_WATCHDOG_MS,
  SCENE_PLAY_DELAY_MS,
  CONFETTI_FADE_MS,
  CONFETTI_LIFE_MS,
  IMPACT_MS,
  MAX_PIECES,
  REVEAL_MS,
  REVEAL_STAGGER_MS,
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

type ClockStep = {
  at: number;
  run: () => void;
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
    revealUnlockPage();
    options.onReveal();
    options.onComplete?.();
    return () => {};
  }

  const startedAt = performance.now();
  let clockFrame = 0;
  let confettiFrame = 0;
  let revealed = false;
  let cleaned = false;
  let canvas: HTMLCanvasElement | null = null;
  let ctx: CanvasRenderingContext2D | null = null;
  let particles: Particle[] = [];
  let wavesDone = false;
  let colors = FALLBACK_COLORS;
  let scene: ReturnType<typeof createUnlockScene> | null = null;
  let onResize: (() => void) | null = null;
  let clearWillChange: ((event: TransitionEvent) => void) | null = null;
  let stepIndex = 0;

  const host = document.createElement("div");
  host.className = "goal-unlock-host";
  host.style.pointerEvents = "none";

  const visual = document.createElement("div");
  visual.className = "goal-unlock-visual";
  visual.setAttribute("aria-hidden", "true");

  const backdrop = document.createElement("div");
  backdrop.className = "goal-unlock-backdrop";

  const stage = document.createElement("div");
  stage.className = "goal-unlock-stage";

  const flash = document.createElement("div");
  flash.className = "goal-unlock-flash";

  const stamp = document.createElement("div");
  stamp.className = "goal-unlock-stamp";

  function logError(message: string, error?: unknown) {
    if (error === undefined) {
      console.error(message);
      return;
    }
    console.error(message, error);
  }

  function stopConfetti() {
    if (confettiFrame) cancelAnimationFrame(confettiFrame);
    confettiFrame = 0;
    particles = [];
    if (canvas) {
      canvas.remove();
      canvas = null;
      ctx = null;
    }
  }

  function finishCleanup(completed: boolean) {
    if (cleaned) return;
    cleaned = true;
    if (clockFrame) cancelAnimationFrame(clockFrame);
    clockFrame = 0;
    if (onResize) window.removeEventListener("resize", onResize);
    if (clearWillChange) {
      backdrop.removeEventListener("transitionend", clearWillChange);
      clearWillChange = null;
    }
    stopConfetti();
    backdrop.style.willChange = "auto";
    try {
      scene?.teardown();
    } catch (error) {
      logError("Unlock celebration teardown failed", error);
    }
    host.remove();
    const main = document.querySelector("main.app-shell-main");
    if (main instanceof HTMLElement) {
      main.style.removeProperty("overflow");
    }
    if (activeCleanup === cancel) activeCleanup = null;
    if (completed) {
      try {
        options.onComplete?.();
      } catch (error) {
        logError("Unlock celebration onComplete failed", error);
      }
    }
  }

  function cancel() {
    finishCleanup(false);
  }

  function reveal() {
    if (revealed || cleaned) return;
    try {
      revealUnlockPage();
      options.onReveal();
      revealed = true;
    } catch (error) {
      logError("Unlock celebration onReveal failed", error);
    }
  }

  function callScene(
    method: "play" | "impact" | "teardown",
  ): void {
    if (!scene) return;
    try {
      scene[method]();
    } catch (error) {
      logError(`Unlock celebration scene.${method} failed`, error);
    }
  }

  activeCleanup = cancel;

  try {
    applyContentInset(visual);
    visual.append(backdrop, stage);

    try {
      scene = createUnlockScene(options.pageKey, stage);
    } catch (error) {
      logError("Unlock celebration scene create failed", error);
      scene = null;
    }

    try {
      getBallImage();
    } catch (error) {
      logError("Unlock celebration ball image failed", error);
    }

    stamp.innerHTML = `<p class="goal-unlock-stamp-goal">${escapeHtml(STAMP_HEADLINES[options.pageKey])}</p><p class="goal-unlock-stamp-sub">${escapeHtml(options.label.toUpperCase())} UNLOCKED</p>`;
    stage.append(stamp);

    canvas = document.createElement("canvas");
    canvas.className = "goal-unlock-canvas";
    visual.append(flash, canvas);

    const live = document.createElement("div");
    live.className = "sr-only";
    live.setAttribute("aria-live", "polite");
    live.textContent = `${options.label} unlocked`;

    host.append(visual, live);
    document.body.append(host);

    onResize = () => applyContentInset(visual);
    window.addEventListener("resize", onResize);

    const primary = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();
    if (primary) {
      colors = [primary, ...FALLBACK_COLORS.slice(1)];
    }
  } catch (error) {
    logError("Unlock celebration host setup failed", error);
  }

  const finishAt = SECOND_WAVE_MS + CONFETTI_LIFE_MS + CONFETTI_FADE_MS + 80;
  const removeAt =
    Math.max(
      finishAt,
      REVEAL_MS + REVEAL_STAGGER_MS + BACKDROP_OUT_MS,
      IMPACT_MS + STAMP_MS,
    ) + 120;

  const steps: ClockStep[] = [
    {
      at: 0,
      run: () => {
        backdrop.classList.add("is-in");
      },
    },
    {
      at: 160,
      run: () => {
        try {
          scene?.root.classList.add("is-in");
        } catch (error) {
          logError("Unlock celebration scene enter failed", error);
        }
      },
    },
    {
      at: SCENE_PLAY_DELAY_MS,
      run: () => {
        callScene("play");
      },
    },
    {
      at: IMPACT_MS,
      run: () => {
        callScene("impact");
        flash.classList.add("is-on");
        stamp.classList.add("is-on");
        try {
          if (!canvas) return;
          sizeCanvas(canvas);
          ctx = canvas.getContext("2d");
          if (!ctx) return;
          let origin = contentCenterOrigin(stage);
          try {
            if (scene) origin = scene.getImpactOrigin();
          } catch (error) {
            logError("Unlock celebration impact origin failed", error);
          }
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
          loopConfetti();
        } catch (error) {
          logError("Unlock celebration confetti failed", error);
        }
      },
    },
    {
      at: SECOND_WAVE_MS,
      run: () => {
        try {
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
            contentCenterX(stage),
            window.innerHeight - 6,
            10,
            -Math.PI * 0.68,
            -Math.PI * 0.32,
            7,
            14,
            true,
          );
        } catch (error) {
          logError("Unlock celebration confetti wave failed", error);
        }
        wavesDone = true;
      },
    },
    {
      at: REVEAL_MS,
      run: () => {
        try {
          scene?.root.classList.remove("is-in");
          scene?.root.classList.add("is-out");
        } catch (error) {
          logError("Unlock celebration scene exit failed", error);
        }
        reveal();
      },
    },
    {
      at: REVEAL_MS + REVEAL_STAGGER_MS,
      run: () => {
        backdrop.style.willChange = "opacity";
        backdrop.classList.remove("is-in");
        backdrop.classList.add("is-out");
        clearWillChange = (event: TransitionEvent) => {
          if (event.propertyName !== "opacity") return;
          backdrop.style.willChange = "auto";
          if (clearWillChange) {
            backdrop.removeEventListener("transitionend", clearWillChange);
            clearWillChange = null;
          }
        };
        backdrop.addEventListener("transitionend", clearWillChange);
      },
    },
    {
      at: CELEBRATION_WATCHDOG_MS,
      run: () => {
        if (revealed && backdrop.classList.contains("is-out")) return;
        logError("Unlock celebration timed out");
        reveal();
        finishCleanup(true);
      },
    },
    {
      at: finishAt,
      run: () => {
        stopConfetti();
      },
    },
    {
      at: removeAt,
      run: () => {
        finishCleanup(true);
      },
    },
  ];

  function loopConfetti() {
    if (cleaned || !canvas) {
      confettiFrame = 0;
      return;
    }
    try {
      const now = performance.now();
      drawParticles(ctx, canvas, particles, now);
      particles = particles.filter(
        (p) => now - p.born < CONFETTI_LIFE_MS + CONFETTI_FADE_MS,
      );
      if (particles.length === 0 && wavesDone) {
        stopConfetti();
        return;
      }
      confettiFrame = requestAnimationFrame(loopConfetti);
    } catch (error) {
      logError("Unlock celebration confetti frame failed", error);
      stopConfetti();
    }
  }

  function tickClock(now: number) {
    if (cleaned) return;
    const elapsed = now - startedAt;
    while (stepIndex < steps.length && elapsed >= steps[stepIndex]!.at) {
      const step = steps[stepIndex]!;
      stepIndex += 1;
      try {
        step.run();
      } catch (error) {
        logError("Unlock celebration step failed", error);
      }
      if (cleaned) return;
    }
    if (stepIndex < steps.length) {
      clockFrame = requestAnimationFrame(tickClock);
    }
  }

  try {
    tickClock(performance.now());
  } catch (error) {
    logError("Unlock celebration clock failed to start", error);
    reveal();
    finishCleanup(true);
  }
  return cancel;
}

function revealUnlockPage(): void {
  for (const node of document.querySelectorAll("[data-unlock-page]")) {
    if (!(node instanceof HTMLElement)) continue;
    node.style.opacity = "1";
    node.style.pointerEvents = "auto";
    node.removeAttribute("inert");
    node.removeAttribute("aria-hidden");
  }
  const main = document.querySelector("main.app-shell-main");
  if (!(main instanceof HTMLElement)) return;
  if (!document.querySelector(".events-page")) {
    main.style.overflow = "auto";
  }
}

function applyContentInset(visual: HTMLElement): void {
  const main = document.querySelector("main.app-shell-main");
  const left =
    main instanceof HTMLElement
      ? parseFloat(getComputedStyle(main).paddingLeft) || 0
      : 0;
  visual.style.setProperty("--unlock-content-left", `${left}px`);
}

function contentCenterX(stage: HTMLElement): number {
  const rect = stage.getBoundingClientRect();
  return rect.left + rect.width / 2;
}

function contentCenterOrigin(stage: HTMLElement): { x: number; y: number } {
  const rect = stage.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
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
