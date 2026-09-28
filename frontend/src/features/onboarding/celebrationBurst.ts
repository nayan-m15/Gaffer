const BURST_COLORS = [
  "var(--primary)",
  "var(--chart-2)",
  "var(--brand-light)",
  "var(--chart-1)",
  "var(--primary-foreground)",
];

/** Same celebration burst used by the first-time coach tour. */
export function createCelebrationBurst(): HTMLElement {
  const root = document.createElement("div");
  root.className = "gaffer-tour-burst";
  root.setAttribute("aria-hidden", "true");

  for (let index = 0; index < 20; index += 1) {
    const dot = document.createElement("span");
    const angle = (Math.PI * 2 * index) / 20 + (index % 3) * 0.18;
    const distance = 52 + (index % 5) * 12;
    dot.className = "gaffer-tour-burst-dot";
    dot.style.setProperty("--dx", `${Math.cos(angle) * distance}px`);
    dot.style.setProperty("--dy", `${Math.sin(angle) * distance}px`);
    dot.style.background = BURST_COLORS[index % BURST_COLORS.length];
    dot.style.animationDelay = `${(index % 6) * 18}ms`;
    root.append(dot);
  }

  return root;
}
