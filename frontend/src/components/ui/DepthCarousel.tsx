import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import gsap from "gsap";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./DepthCarousel.css";

export interface DepthCarouselItem {
  id: string;
  content: ReactNode;
  label: string;
}

interface DepthCarouselProps {
  items: DepthCarouselItem[];
  cardWidth?: number;
  depth?: number;
  spread?: number;
  tilt?: number;
  perspective?: number;
  visibleCards?: number;
  falloff?: number;
  blur?: number;
  duration?: number;
  autoplay?: boolean;
  autoplayDelay?: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export function DepthCarousel({
  items,
  cardWidth = 210,
  depth = 110,
  spread = 115,
  tilt = 22,
  perspective = 1600,
  visibleCards = 5,
  falloff = 0.2,
  blur = 1,
  duration = 700,
  autoplay = true,
  autoplayDelay = 3200,
}: DepthCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const tintRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const positionRef = useRef(0);
  const focusRef = useRef(0);
  const scaleRef = useRef(1);
  const tweenRef = useRef<gsap.core.Tween | null>(null);
  const dragRef = useRef<{
    startX: number;
    startPosition: number;
    lastX: number;
    lastTime: number;
    velocity: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const autoplayTimerRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(false);
  const [active, setActive] = useState(0);

  const count = items.length;

  const layout = useCallback(
    (position: number) => {
      if (!count) return;

      for (let index = 0; index < count; index += 1) {
        const card = cardRefs.current[index];
        if (!card) continue;

        let distance = index - position;
        if (count > 1) {
          distance = ((distance % count) + count) % count;
          if (distance > count / 2) distance -= count;
        }

        const behind = Math.max(0, distance);
        const shown = Math.abs(distance) <= visibleCards + 0.5;
        const translateX = spread * distance;
        const translateZ = -depth * distance;
        const rotateY = tilt * clamp(distance, 0, 1);
        let opacity = distance < 0 ? Math.max(0, 1 + distance) : 1;
        if (!shown) opacity = 0;

        const brightness = Math.max(0.15, 1 - behind * falloff);
        const blurAmount =
          blur > 0
            ? Math.min(blur, (behind / Math.max(1, visibleCards)) * blur)
            : 0;

        card.style.transform =
          `translate(-50%, -50%) scale(${scaleRef.current}) ` +
          `translateX(${translateX.toFixed(2)}px) ` +
          `translateZ(${translateZ.toFixed(2)}px) ` +
          `rotateY(${rotateY.toFixed(3)}deg)`;
        card.style.opacity = opacity.toFixed(3);
        card.style.filter = `brightness(${brightness.toFixed(3)}) blur(${blurAmount.toFixed(2)}px)`;
        card.style.zIndex = String(Math.round(2000 - distance * 20));
        card.style.pointerEvents = shown && opacity > 0.05 ? "auto" : "none";

        const tint = tintRefs.current[index];
        if (tint) {
          tint.style.opacity = clamp(behind * falloff * 1.25, 0, 0.86).toFixed(3);
        }
      }
    },
    [blur, count, depth, falloff, spread, tilt, visibleCards],
  );

  const moveTo = useCallback(
    (target: number, animate = true) => {
      if (!count) return;
      const nextIndex = ((target % count) + count) % count;
      let delta = nextIndex - positionRef.current;
      if (count > 1) {
        delta = ((delta % count) + count) % count;
        if (delta > count / 2) delta -= count;
      }

      tweenRef.current?.kill();
      const proxy = { position: positionRef.current };
      tweenRef.current = gsap.to(proxy, {
        position: positionRef.current + delta,
        duration: animate && !reducedMotionRef.current ? duration / 1000 : 0,
        ease: "power3.out",
        onUpdate: () => {
          positionRef.current = proxy.position;
          layout(proxy.position);
        },
        onComplete: () => {
          positionRef.current = nextIndex;
          layout(nextIndex);
        },
      });

      focusRef.current = nextIndex;
      setActive(nextIndex);
    },
    [count, duration, layout],
  );

  const navigateBy = useCallback(
    (step: number) => moveTo(focusRef.current + step),
    [moveTo],
  );

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    positionRef.current = 0;
    focusRef.current = 0;
    setActive(0);
    layout(0);
  }, [items, layout]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const observer = new ResizeObserver(([entry]) => {
      const neededWidth = cardWidth + Math.abs(spread) * 2 + 120;
      scaleRef.current = clamp(entry.contentRect.width / neededWidth, 0.68, 1);
      layout(positionRef.current);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [cardWidth, layout, spread]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleWheel = (event: WheelEvent) => {
      if (count < 2) return;
      event.preventDefault();
      tweenRef.current?.kill();
      const rawDelta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
      const delta = event.deltaMode === 1 ? rawDelta * 24 : rawDelta;
      positionRef.current += clamp(delta / (cardWidth * 0.9), -0.6, 0.6);
      layout(positionRef.current);

      if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = window.setTimeout(
        () => moveTo(Math.round(positionRef.current)),
        130,
      );
    };

    root.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      root.removeEventListener("wheel", handleWheel);
      if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
    };
  }, [cardWidth, count, layout, moveTo]);

  useEffect(() => {
    if (!autoplay || reducedMotionRef.current || count < 2) return;
    const root = rootRef.current;
    if (!root) return;
    let paused = false;

    autoplayTimerRef.current = window.setInterval(() => {
      if (!paused) navigateBy(1);
    }, Math.max(autoplayDelay, 600));

    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = false;
    };
    root.addEventListener("mouseenter", pause);
    root.addEventListener("mouseleave", resume);
    root.addEventListener("focusin", pause);
    root.addEventListener("focusout", resume);

    return () => {
      if (autoplayTimerRef.current) window.clearInterval(autoplayTimerRef.current);
      root.removeEventListener("mouseenter", pause);
      root.removeEventListener("mouseleave", resume);
      root.removeEventListener("focusin", pause);
      root.removeEventListener("focusout", resume);
    };
  }, [autoplay, autoplayDelay, count, navigateBy]);

  useEffect(
    () => () => {
      tweenRef.current?.kill();
      if (wheelTimerRef.current) window.clearTimeout(wheelTimerRef.current);
      if (autoplayTimerRef.current)
        window.clearInterval(autoplayTimerRef.current);
    },
    [],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (count < 2) return;
    tweenRef.current?.kill();
    dragRef.current = {
      startX: event.clientX,
      startPosition: positionRef.current,
      lastX: event.clientX,
      lastTime: performance.now(),
      velocity: 0,
      moved: false,
      pointerId: event.pointerId,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) > 4) {
      drag.moved = true;
      rootRef.current?.setPointerCapture(drag.pointerId);
    }
    if (!drag.moved) return;

    const now = performance.now();
    drag.velocity = (event.clientX - drag.lastX) / Math.max(now - drag.lastTime, 1);
    drag.lastX = event.clientX;
    drag.lastTime = now;
    const stepWidth = Math.max(cardWidth * 0.55 * scaleRef.current, 40);
    positionRef.current = drag.startPosition - deltaX / stepWidth;
    layout(positionRef.current);
  };

  const handlePointerEnd = () => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    if (!drag.moved) return;
    const stepWidth = Math.max(cardWidth * 0.55 * scaleRef.current, 40);
    const projected = positionRef.current - (drag.velocity * 180) / stepWidth;
    moveTo(Math.round(projected));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      navigateBy(-1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      navigateBy(1);
    }
  };

  return (
    <div
      ref={rootRef}
      className="depth-carousel"
      style={{ "--depth-carousel-perspective": `${perspective}px` } as React.CSSProperties}
      role="group"
      aria-roledescription="carousel"
      aria-label="Players"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onKeyDown={handleKeyDown}
    >
      <div className="depth-carousel__stage">
        {items.map((item, index) => (
          <div
            key={item.id}
            ref={(element) => {
              cardRefs.current[index] = element;
            }}
            className="depth-carousel__card"
            aria-roledescription="slide"
            aria-label={`${item.label}, ${index + 1} of ${count}`}
            aria-hidden={active !== index}
            onClick={() => {
              if (!dragRef.current?.moved) moveTo(index);
            }}
          >
            {item.content}
            <span
              ref={(element) => {
                tintRefs.current[index] = element;
              }}
              className="depth-carousel__tint"
              aria-hidden="true"
            />
          </div>
        ))}
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            className="depth-carousel__arrow depth-carousel__arrow--previous"
            aria-label="Previous player"
            onClick={() => navigateBy(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            className="depth-carousel__arrow depth-carousel__arrow--next"
            aria-label="Next player"
            onClick={() => navigateBy(1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <div className="depth-carousel__dots" aria-label="Choose player">
            {items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                aria-label={`Show ${item.label}`}
                aria-current={active === index ? "true" : undefined}
                className={`depth-carousel__dot${active === index ? " is-active" : ""}`}
                onClick={() => moveTo(index)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
