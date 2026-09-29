import { createRoot } from "react-dom/client";
import { GiSoccerBall } from "react-icons/gi";
import "./unlock-gate.css";
import type { CSSProperties } from "react";

const CONFETTI_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--chart-1)",
  "var(--brand-light)",
  "var(--primary)",
];

const PIECE_COUNT = 45;
const DURATION_MS = 1200;

/** Burst from a button; lives on document.body so it outlasts the fading card. */
export function fireUnlockButtonConfetti(origin: HTMLElement): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const pieces = Array.from({ length: PIECE_COUNT }, (_, index) => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
    const dist = 90 + Math.random() * 150;
    const dx = Math.cos(angle) * dist;
    const peak = Math.sin(angle) * dist;
    return {
      isBall: index % 7 === 0,
      dx,
      peak,
      fall: peak + 120 + Math.random() * 110,
      rot: (Math.random() * 2 - 1) * 720,
      delay: Math.random() * 80,
      color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
      width: 6 + Math.random() * 5,
      height: 4 + Math.random() * 6,
    };
  });

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  document.body.append(host);
  const root = createRoot(host);
  root.render(
    <div className="unlock-confetti-layer" aria-hidden="true">
      {pieces.map((piece, index) => (
        <span
          key={index}
          className="unlock-confetti-piece"
          style={
            {
              "--ox": `${x}px`,
              "--oy": `${y}px`,
              "--dx": `${piece.dx}px`,
              "--peak": `${piece.peak}px`,
              "--fall": `${piece.fall}px`,
              "--rot": `${piece.rot}deg`,
              "--delay": `${piece.delay}ms`,
              color: piece.color,
              width: piece.isBall ? 14 : piece.width,
              height: piece.isBall ? 14 : piece.height,
              background: piece.isBall ? "transparent" : piece.color,
            } as CSSProperties
          }
        >
          {piece.isBall ? (
            <GiSoccerBall className="size-full" aria-hidden="true" />
          ) : null}
        </span>
      ))}
    </div>,
  );
  window.setTimeout(() => {
    root.unmount();
    host.remove();
  }, DURATION_MS + 80);
}
