import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./DepthCarousel.css";

export interface DepthCarouselItem {
  id: string;
  content: ReactNode;
  label: string;
}

interface DepthCarouselProps {
  items: DepthCarouselItem[];
}

export function DepthCarousel({ items }: DepthCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateControls = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollPrevious(track.scrollLeft > 1);
    setCanScrollNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(updateControls);
    observer.observe(track);
    updateControls();
    return () => observer.disconnect();
  }, [items, updateControls]);

  const navigate = (direction: -1 | 1) => {
    const track = trackRef.current;
    const firstCard = track?.firstElementChild as HTMLElement | null;
    if (!track || !firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({
      left: direction * (firstCard.getBoundingClientRect().width + gap),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  };

  return (
    <div className="depth-carousel" role="group" aria-roledescription="carousel" aria-label="Players">
      <div
        ref={trackRef}
        className="depth-carousel__track"
        onScroll={updateControls}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            navigate(event.key === "ArrowLeft" ? -1 : 1);
          }
        }}
        tabIndex={items.length > 1 ? 0 : undefined}
        aria-label="Browse players"
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            className="depth-carousel__card"
            role="group"
            aria-roledescription="slide"
            aria-label={`${item.label}, ${index + 1} of ${items.length}`}
          >
            {item.content}
          </div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="depth-carousel__controls">
          <span className="text-xs font-medium text-muted-foreground">
            {items.length} players
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="depth-carousel__arrow"
              aria-label="Previous players"
              disabled={!canScrollPrevious}
              onClick={() => navigate(-1)}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="depth-carousel__arrow"
              aria-label="Next players"
              disabled={!canScrollNext}
              onClick={() => navigate(1)}
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
