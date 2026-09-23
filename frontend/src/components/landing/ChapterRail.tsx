import { useCallback, useEffect, useRef, useState } from "react";
import { LineSidebar } from "@/components/ui/LineSidebar";
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

/** Connects the reusable React Bits control to landing-page anchors. */
export function ChapterRail({ items = CHAPTERS }: { items?: ChapterItem[] }) {
  const hashIndex = items.findIndex(
    (item) => item.id === window.location.hash.slice(1),
  );
  const [activeIndex, setActiveIndex] = useState(
    hashIndex >= 0 ? hashIndex : 0,
  );
  const [footerVisible, setFooterVisible] = useState(false);
  const lockedIndexRef = useRef<number | null>(null);
  const unlockTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => section !== null);
    const visibleSections = new Map<Element, IntersectionObserverEntry>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visibleSections.set(entry.target, entry);
          else visibleSections.delete(entry.target);
        }

        const lockedIndex = lockedIndexRef.current;
        if (lockedIndex !== null) {
          const target = document.getElementById(items[lockedIndex]?.id ?? "");
          if (!target || !visibleSections.has(target)) return;
          lockedIndexRef.current = null;
        }

        const viewportTarget = window.innerHeight * 0.35;
        const closest = [...visibleSections.values()].sort(
          (first, second) =>
            Math.abs(first.boundingClientRect.top - viewportTarget) -
            Math.abs(second.boundingClientRect.top - viewportTarget),
        )[0];
        if (!closest) return;

        const nextIndex = items.findIndex(
          (item) => item.id === (closest.target as HTMLElement).id,
        );
        if (nextIndex >= 0) {
          setActiveIndex((current) =>
            current === nextIndex ? current : nextIndex,
          );
        }
      },
      {
        rootMargin: "-18% 0px -48% 0px",
        threshold: [0, 0.15, 0.35, 0.65],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;

    const observer = new IntersectionObserver(
      ([entry]) => setFooterVisible(entry?.isIntersecting ?? false),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 },
    );
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  useEffect(
    () => () => {
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }
    },
    [],
  );

  const handleItemClick = useCallback(
    (index: number) => {
      const item = items[index];
      const section = item ? document.getElementById(item.id) : null;
      if (!item || !section) return;

      setActiveIndex(index);
      lockedIndexRef.current = index;
      if (unlockTimerRef.current !== null) {
        window.clearTimeout(unlockTimerRef.current);
      }

      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      section.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}#${item.id}`,
      );

      unlockTimerRef.current = window.setTimeout(() => {
        lockedIndexRef.current = null;
      }, reduceMotion ? 0 : 1200);
    },
    [items],
  );

  return (
    <div
      className={cn(
        "landing-section-nav fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 select-none rounded-2xl border border-[var(--landing-scene-border)] bg-black/45 px-3 py-1 shadow-lg backdrop-blur-md transition-[opacity,transform] duration-300 xl:block 2xl:left-6",
        footerVisible
          ? "pointer-events-none -translate-x-3 opacity-0"
          : "pointer-events-auto translate-x-0 opacity-100",
      )}
      aria-hidden={footerVisible}
      inert={footerVisible}
    >
      <LineSidebar
        items={items.map((item) => item.label)}
        accentColor="var(--landing-scene-accent)"
        textColor="var(--landing-scene-secondary)"
        markerColor="var(--landing-scene-muted)"
        showIndex={false}
        showMarker
        proximityRadius={100}
        maxShift={30}
        falloff="smooth"
        markerLength={35}
        markerGap={0}
        tickScale={0.26}
        scaleTick
        itemGap={20}
        fontSize={1.1}
        smoothing={100}
        defaultActive={0}
        activeIndex={activeIndex}
        onItemClick={handleItemClick}
      />
    </div>
  );
}
