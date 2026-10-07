/** React Bits FlexCarousel lens adapted for accessible public player cards. */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { FlexCarouselLens, type FlexCarouselPreset } from "./FlexCarouselLens";
import "./FlexCarousel.css";

export interface FlexCarouselItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface FlexCarouselProps {
  items: FlexCarouselItem[];
  preset?: FlexCarouselPreset;
  intro?: "rise" | "none";
  gap?: number;
  squeeze?: number;
  liquid?: number;
  focusOnClick?: boolean;
  captions?: boolean;
  captureWheel?: boolean;
  autoplay?: boolean;
  interval?: number;
  onChange?: (index: number, item: FlexCarouselItem) => void;
  onSelect?: (index: number, item: FlexCarouselItem) => void;
  className?: string;
  style?: CSSProperties;
}

function Digits({ value }: { value: number }) {
  return (
    <span className="flex-carousel__digits" aria-label={String(value)}>
      {String(value).padStart(2, "0").split("").map((digit, index) => (
        <span key={index} className="flex-carousel__digit" aria-hidden="true">
          <span className="flex-carousel__reel" style={{ transform: `translateY(${-Number(digit) * 10}%)` }}>
            {"0123456789".split("").map((number) => <span key={number}>{number}</span>)}
          </span>
        </span>
      ))}
    </span>
  );
}

const prefersReducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function FlexCarousel({
  items,
  preset = "liquid",
  intro = "rise",
  gap = 12,
  squeeze = 0.2,
  liquid = 0.26,
  focusOnClick = true,
  captions = true,
  captureWheel = true,
  autoplay = false,
  interval = 4,
  onChange,
  onSelect,
  className = "",
  style,
}: FlexCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    left: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const itemIds = JSON.stringify(items.map((item) => item.id));
  const lastScrollRef = useRef({ left: 0, time: 0 });
  const renderLensRef = useRef<
    ((motion: number) => void) | null
  >(null);
  const callbacksRef = useRef({ onChange, onSelect });
  const [active, setActive] = useState(0);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onChange, onSelect };
  }, [onChange, onSelect]);

  const updateTrack = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    if (!items.length) {
      setCanScrollPrevious(false);
      setCanScrollNext(false);
      return;
    }
    const cards = Array.from(track.children) as HTMLElement[];
    const first = cards[0];
    if (!first) return;
    const gapSize = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = cards[1]
      ? cards[1].offsetLeft - first.offsetLeft
      : first.offsetWidth + gapSize;
    const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
    const now = performance.now();
    const previous = lastScrollRef.current;
    const velocity = previous.time
      ? (Math.abs(track.scrollLeft - previous.left) /
          Math.max(now - previous.time, 1)) *
        1000
      : 0;
    lastScrollRef.current = { left: track.scrollLeft, time: now };

    setCanScrollPrevious(track.scrollLeft > 1);
    setCanScrollNext(track.scrollLeft < maxScroll - 1);
    const nextActive = Math.min(
      items.length - 1,
      Math.max(0, Math.round(track.scrollLeft / step)),
    );
    if (nextActive !== activeRef.current) {
      activeRef.current = nextActive;
      setActive(nextActive);
      setFocusOpen(false);
      callbacksRef.current.onChange?.(nextActive, items[nextActive]);
    }

    const reduced = prefersReducedMotion();
    const energy = Math.min(1, velocity / 2200);
    for (const card of cards) {
      const visual = card.firstElementChild as HTMLElement | null;
      if (visual) visual.style.transform = reduced ? "" : `scale(${(1 - energy * squeeze * 0.16).toFixed(3)})`;
    }
    if (!reduced) renderLensRef.current?.(energy);
  }, [items, squeeze]);

  const scrollToIndex = useCallback((index: number) => {
    const track = trackRef.current;
    const card = track?.children[index] as HTMLElement | undefined;
    const first = track?.firstElementChild as HTMLElement | null;
    if (!track || !card || !first) return;
    track.scrollTo({
      left: card.offsetLeft - first.offsetLeft,
      behavior: prefersReducedMotion() ? "instant" : "smooth",
    });
  }, []);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // Reset even when a refetch replaces the squad with the same item count.
    track.scrollTo({ left: 0, behavior: "instant" });
    activeRef.current = 0;
    lastScrollRef.current = { left: 0, time: 0 };
    setActive(0);
    setFocusOpen(false);
  }, [itemIds]);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(updateTrack);
    observer.observe(track);
    if (track.firstElementChild) observer.observe(track.firstElementChild);
    updateTrack();
    return () => observer.disconnect();
  }, [updateTrack]);

  useEffect(() => {
    if (!captureWheel) return;
    const track = trackRef.current;
    if (!track) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
        return;
      if (track.scrollWidth <= track.clientWidth + 1) return;
      event.preventDefault();
      track.scrollBy({ left: event.deltaY, behavior: "instant" });
    };
    track.addEventListener("wheel", onWheel, { passive: false });
    return () => track.removeEventListener("wheel", onWheel);
  }, [captureWheel]);

  useEffect(() => {
    if (!autoplay || items.length < 2 || prefersReducedMotion()) return;
    const timer = window.setInterval(
      () => {
        const root = rootRef.current;
        const track = trackRef.current;
        if (
          !root ||
          !track ||
          document.hidden ||
          root.matches(":hover") ||
          root.contains(document.activeElement)
        )
          return;
        const next = canScrollNext
          ? Math.min(activeRef.current + 1, items.length - 1)
          : 0;
        scrollToIndex(next);
      },
      Math.max(0.6, interval) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [autoplay, canScrollNext, interval, items.length, scrollToIndex]);

  const selectedIndex = focusOpen ? focusIndex : active;
  const selected = items[selectedIndex];
  const carouselStyle = {
    ...style,
    "--flex-carousel-gap": `${gap}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`flex-carousel${focusOpen ? " is-focused" : ""} ${className}`.trim()}
      style={carouselStyle}
      role="group"
      aria-roledescription="carousel"
      aria-label="Players"
    >
      <FlexCarouselLens viewportRef={viewportRef} motionRef={renderLensRef} preset={preset} liquid={liquid} disabled={focusOpen} itemCount={items.length} />
      <div className="flex-carousel__stage">
      <div ref={viewportRef} className="flex-carousel__viewport">
        <div
          ref={trackRef}
          className="flex-carousel__track"
          tabIndex={items.length > 1 ? 0 : undefined}
          aria-label="Browse players"
          onScroll={updateTrack}
          onDragStart={(event) => event.preventDefault()}
          onClickCapture={(event) => {
            if (suppressClickRef.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressClickRef.current = false;
            }
          }}
          onPointerDown={(event) => {
            suppressClickRef.current = false;
            setFocusOpen(false);
            if (event.pointerType !== "mouse" || event.button !== 0) return;
            dragRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              left: event.currentTarget.scrollLeft,
              moved: false,
            };
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const distance = event.clientX - drag.x;
            if (!drag.moved && Math.abs(distance) < 5) return;
            if (!drag.moved) {
              drag.moved = true;
              event.currentTarget.setPointerCapture(event.pointerId);
              event.currentTarget.dataset.dragging = "true";
            }
            event.preventDefault();
            event.currentTarget.scrollLeft = drag.left - distance;
          }}
          onPointerUp={(event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            dragRef.current = null;
            suppressClickRef.current = drag.moved;
            if (drag.moved) updateTrack();
            delete event.currentTarget.dataset.dragging;
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              event.currentTarget.releasePointerCapture(event.pointerId);
            }
            if (drag.moved) scrollToIndex(activeRef.current);
          }}
          onPointerCancel={(event) => {
            dragRef.current = null;
            delete event.currentTarget.dataset.dragging;
          }}
          onLostPointerCapture={(event) => {
            dragRef.current = null;
            delete event.currentTarget.dataset.dragging;
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
              event.preventDefault();
              scrollToIndex(
                Math.min(
                  items.length - 1,
                  Math.max(
                    0,
                    activeRef.current + (event.key === "ArrowRight" ? 1 : -1),
                  ),
                ),
              );
            } else if (event.key === "Home" || event.key === "End") {
              event.preventDefault();
              scrollToIndex(event.key === "Home" ? 0 : items.length - 1);
            } else if (
              (event.key === "Enter" || event.key === " ") &&
              focusOnClick &&
              items[activeRef.current]
            ) {
              event.preventDefault();
              callbacksRef.current.onSelect?.(
                activeRef.current,
                items[activeRef.current],
              );
              setFocusIndex(activeRef.current);
              setFocusOpen((open) => !open);
            } else if (event.key === "Escape" && focusOpen) {
              event.preventDefault();
              setFocusOpen(false);
            }
          }}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`flex-carousel__card${focusOpen && active === index ? " is-open" : ""}`}
              role="group"
              aria-roledescription="slide"
              aria-label={`${item.label}, ${index + 1} of ${items.length}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => {
                trackRef.current?.focus({ preventScroll: true });
                if (focusOnClick) {
                  callbacksRef.current.onSelect?.(index, item);
                  setFocusIndex(index);
                  setFocusOpen(true);
                } else {
                  scrollToIndex(index);
                }
              }}
            >
              <div
                className={`flex-carousel__visual${intro === "rise" ? " flex-carousel__card--rise" : ""}`}
                style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
              >
                {item.content}
              </div>
            </div>
          ))}
        </div>
      </div>
      {focusOpen && selected && (
        <div className="flex-carousel__focus-card" aria-hidden="true" onClick={() => setFocusOpen(false)}>
          {selected.content}
        </div>
      )}
      </div>
      {items.length > 0 && (
        <div className="flex-carousel__footer">
          {captions && selected ? (
            <p className="flex-carousel__caption" aria-live="polite">
              <span key={selected.id} className="flex-carousel__title">{selected.label}</span>
              <span className="flex-carousel__count">
                <Digits value={selectedIndex + 1} />
                <span aria-hidden="true">/</span>
                <span>{String(items.length).padStart(2, "0")}</span>
              </span>
            </p>
          ) : (
            <p className="flex-carousel__caption">{items.length} players</p>
          )}
          {items.length > 1 && <div className="flex-carousel__controls">
            <button
              type="button"
              className="flex-carousel__arrow"
              aria-label="Previous players"
              disabled={!canScrollPrevious}
              onClick={() => { setFocusOpen(false); scrollToIndex(Math.max(0, activeRef.current - 1)); }}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="flex-carousel__arrow"
              aria-label="Next players"
              disabled={!canScrollNext}
              onClick={() => { setFocusOpen(false); scrollToIndex(Math.min(items.length - 1, activeRef.current + 1)); }}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>}
        </div>
      )}
    </div>
  );
}
