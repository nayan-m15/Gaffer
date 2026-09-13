import { useEffect, useState, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ChapterItem {
  id: string;
  label: string;
}

export const CHAPTERS: ChapterItem[] = [
  { id: "home", label: "Overview" },
  { id: "philosophy", label: "Philosophy" },
  { id: "roster", label: "Squad Roster" },
  { id: "tactics", label: "Tactical Pitch" },
  { id: "matchday", label: "Live Match" },
  { id: "analytics", label: "Analytics" },
  { id: "cta", label: "Get Started" },
];

/**
 * ChapterRail — Prominent right-hand scroll tab menu.
 *
 * Displays all section chapters prominently on the right side of the screen.
 * All chapter names remain visible at all times, with the current chapter
 * brightly highlighted in emerald with an extended active indicator dash.
 */
export function ChapterRail({ items = CHAPTERS }: { items?: ChapterItem[] }) {
  const [activeId, setActiveId] = useState<string>("home");
  const isClickingRef = useRef(false);

  useEffect(() => {
    let animFrame = 0;

    const computeActiveSection = () => {
      if (isClickingRef.current) return;

      const scrollPos = window.scrollY + window.innerHeight * 0.4;
      let current = items[0]?.id || "home";

      for (const item of items) {
        const el = document.getElementById(item.id);
        if (el && el.offsetTop <= scrollPos) {
          current = item.id;
        }
      }

      setActiveId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (!animFrame) {
        animFrame = window.requestAnimationFrame(() => {
          computeActiveSection();
          animFrame = 0;
        });
      }
    };

    computeActiveSection();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", computeActiveSection);

    return () => {
      if (animFrame) window.cancelAnimationFrame(animFrame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", computeActiveSection);
    };
  }, [items]);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setActiveId(id);
    isClickingRef.current = true;

    const el = document.getElementById(id);
    if (el) {
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
      history.replaceState(null, "", `#${id}`);

      window.setTimeout(() => {
        isClickingRef.current = false;
      }, reduceMotion ? 0 : 800);
    } else {
      isClickingRef.current = false;
    }
  };

  return (
    <aside
      aria-label="Story chapters"
      className="fixed right-3 sm:right-6 lg:right-8 top-1/2 -translate-y-1/2 z-40 hidden md:flex flex-col items-end select-none pointer-events-auto"
    >
      <div className="flex flex-col items-end gap-3.5 py-4 px-3.5 sm:px-4 rounded-2xl bg-background/80 backdrop-blur-xl border border-border shadow-2xl">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground pr-1 pb-0.5 border-b border-border w-full text-right">
          Sections
        </span>

        {items.map((item) => {
          const isActive = activeId === item.id;

          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => handleNavClick(e, item.id)}
              aria-current={isActive ? "location" : undefined}
              className={cn(
                "group flex items-center gap-3 py-1 text-xs lg:text-[13px] font-mono font-medium tracking-wide uppercase transition-all duration-200",
                isActive
                  ? "text-brand font-bold scale-[1.04] origin-right"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {/* Always visible label */}
              <span
                className={cn(
                  "transition-all duration-200 whitespace-nowrap",
                  isActive
                    ? "text-brand drop-shadow-[0_0_10px_rgba(5,150,105,0.4)] dark:drop-shadow-[0_0_10px_rgba(16,185,129,0.6)]"
                    : "group-hover:text-foreground",
                )}
              >
                {item.label}
              </span>

              {/* Indicator dash */}
              <span
                className={cn(
                  "h-[2px] rounded-full transition-all duration-300",
                  isActive
                    ? "w-8 bg-brand shadow-[0_0_10px_rgba(5,150,105,0.6)] dark:shadow-[0_0_10px_rgba(16,185,129,0.9)]"
                    : "w-3 bg-border group-hover:w-5 group-hover:bg-muted-foreground",
                )}
              />
            </a>
          );
        })}
      </div>
    </aside>
  );
}
