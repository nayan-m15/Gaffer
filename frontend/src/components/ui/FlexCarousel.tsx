/** React Bits FlexCarousel adaptation: DOM cards retain accessible player stats while OGL renders the liquid accent. */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import "./FlexCarousel.css";

export interface FlexCarouselItem {
  id: string;
  label: string;
  content: ReactNode;
}

interface FlexCarouselProps {
  items: FlexCarouselItem[];
  preset?: "liquid" | "ribbon" | "vortex" | "arch";
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

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 uResolution;
uniform vec2 uCenter;
uniform float uMotion;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = (uv - uCenter) * vec2(uResolution.x / uResolution.y, 1.0);
  float ring = exp(-pow((length(p / vec2(0.86, 0.76)) - 0.72) * 11.0, 2.0));
  float alpha = ring * uMotion * 0.18;
  fragColor = vec4(vec3(0.08, 0.75, 0.55) * alpha, alpha);
}`;

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
  const lastScrollRef = useRef({ left: 0, time: 0 });
  const renderLensRef = useRef<
    ((motion: number, center: number) => void) | null
  >(null);
  const callbacksRef = useRef({ onChange, onSelect });
  const [active, setActive] = useState(0);
  const [focusOpen, setFocusOpen] = useState(false);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onChange, onSelect };
  }, [onChange, onSelect]);

  const updateTrack = useCallback(() => {
    const track = trackRef.current;
    if (!track || !items.length) return;
    const cards = Array.from(track.children) as HTMLElement[];
    const first = cards[0];
    if (!first) return;
    const gapSize = Number.parseFloat(getComputedStyle(track).columnGap) || 0;
    const step = first.offsetWidth + gapSize;
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
    const bend = preset === "vortex" ? 1.35 : preset === "arch" ? 0.8 : 1;
    for (const card of cards) {
      if (reduced) {
        card.style.transform = "";
        continue;
      }
      const center = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.max(
        -1,
        Math.min(
          1,
          (center - track.scrollLeft - track.clientWidth / 2) /
            track.clientWidth,
        ),
      );
      const rise = distance * liquid * 48 * bend;
      const tilt = -distance * liquid * 10 * bend;
      const scale = 1 - energy * squeeze * 0.16;
      card.style.transform = `translate3d(0, ${rise.toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
    }
    const lensCard = cards[nextActive] ?? first;
    if (!reduced)
      renderLensRef.current?.(
        energy,
        Math.min(
          1,
          Math.max(
            0,
            (lensCard.offsetLeft +
              lensCard.offsetWidth / 2 -
              track.scrollLeft) /
              track.clientWidth,
          ),
        ),
      );
  }, [items, liquid, preset, squeeze]);

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

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(updateTrack);
    observer.observe(track);
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

  useEffect(() => {
    const host = viewportRef.current;
    if (!host || items.length < 2 || prefersReducedMotion()) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, 2),
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
      });
    } catch {
      return;
    }
    const gl = renderer.gl;
    if (!renderer.isWebgl2) {
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return;
    }
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.className = "flex-carousel__lens";
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);

    const uniforms = {
      uResolution: { value: [1, 1] },
      uCenter: { value: [0.5, 0.5] },
      uMotion: { value: 0 },
    };
    const mesh = new Mesh(gl, {
      geometry: new Triangle(gl),
      program: new Program(gl, {
        vertex,
        fragment,
        uniforms,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    });
    let frame = 0;
    let strength = 0;
    let center = 0.5;
    const draw = () => {
      frame = 0;
      strength *= 0.83;
      uniforms.uMotion.value = strength * liquid;
      uniforms.uCenter.value = [center, 0.5];
      renderer.render({ scene: mesh });
      if (strength > 0.01) frame = requestAnimationFrame(draw);
    };
    renderLensRef.current = (motion, nextCenter) => {
      strength = Math.max(strength, motion);
      center = nextCenter;
      if (!frame) frame = requestAnimationFrame(draw);
    };
    const resize = () => {
      renderer.setSize(
        Math.max(host.clientWidth, 1),
        Math.max(host.clientHeight, 1),
      );
      uniforms.uResolution.value = [canvas.width, canvas.height];
      renderer.render({ scene: mesh });
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => {
      renderLensRef.current = null;
      cancelAnimationFrame(frame);
      observer.disconnect();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, [items.length, liquid]);

  const selected = items[active];
  const carouselStyle = {
    ...style,
    "--flex-carousel-gap": `${gap}px`,
  } as CSSProperties;

  return (
    <div
      ref={rootRef}
      className={`flex-carousel ${className}`.trim()}
      style={carouselStyle}
      role="group"
      aria-roledescription="carousel"
      aria-label="Players"
    >
      <div ref={viewportRef} className="flex-carousel__viewport">
        <div
          ref={trackRef}
          className="flex-carousel__track"
          tabIndex={items.length > 1 ? 0 : undefined}
          aria-label="Browse players"
          onScroll={updateTrack}
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
              className={`flex-carousel__card${intro === "rise" ? " flex-carousel__card--rise" : ""}${focusOpen && active === index ? " is-open" : ""}`}
              style={{ animationDelay: `${Math.min(index, 8) * 55}ms` }}
              role="group"
              aria-roledescription="slide"
              aria-label={`${item.label}, ${index + 1} of ${items.length}`}
              aria-current={active === index ? "true" : undefined}
              onClick={() => {
                if (index !== activeRef.current) {
                  scrollToIndex(index);
                } else {
                  callbacksRef.current.onSelect?.(index, item);
                  if (focusOnClick) setFocusOpen((open) => !open);
                }
              }}
            >
              {item.content}
            </div>
          ))}
        </div>
      </div>
      {items.length > 1 && (
        <div className="flex-carousel__footer">
          {captions && selected ? (
            <p className="flex-carousel__caption" aria-live="polite">
              {selected.label} <span aria-hidden="true">·</span> {active + 1} /{" "}
              {items.length}
            </p>
          ) : (
            <p className="flex-carousel__caption">{items.length} players</p>
          )}
          <div className="flex-carousel__controls">
            <button
              type="button"
              className="flex-carousel__arrow"
              aria-label="Previous players"
              disabled={!canScrollPrevious}
              onClick={() => scrollToIndex(Math.max(0, activeRef.current - 1))}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <button
              type="button"
              className="flex-carousel__arrow"
              aria-label="Next players"
              disabled={!canScrollNext}
              onClick={() =>
                scrollToIndex(Math.min(items.length - 1, activeRef.current + 1))
              }
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
