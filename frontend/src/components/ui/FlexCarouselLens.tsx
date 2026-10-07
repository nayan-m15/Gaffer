import { useEffect, useId, useRef, type RefObject } from "react";

const PRESETS = {
  liquid: { width: 0.74, height: 1.18, tilt: 62, bend: 0.34, reach: 0.38, curl: 0 },
  ribbon: { width: 0.8, height: 0.8, tilt: 0, bend: 0.34, reach: 0.34, curl: 0 },
  vortex: { width: 0.7, height: 0.95, tilt: 30, bend: 0.46, reach: 0.3, curl: 0 },
  arch: { width: 0.8, height: 0.8, tilt: 0, bend: 0.3, reach: 0.36, curl: 1 },
};

export type FlexCarouselPreset = keyof typeof PRESETS;

interface FlexCarouselLensProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  motionRef: RefObject<((motion: number) => void) | null>;
  preset: FlexCarouselPreset;
  liquid: number;
  disabled: boolean;
  itemCount: number;
}

/** React Bits' invisible lens field applied to live DOM cards through SVG.
 * This preserves sharp, selectable statistics and stable native scroll targets;
 * unlike an image-only WebGL scene it needs no screenshots or texture copies.
 */
export function FlexCarouselLens({ viewportRef, motionRef, preset, liquid, disabled, itemCount }: FlexCarouselLensProps) {
  const id = "flex-lens-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const imageRef = useRef<SVGFEImageElement>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null);
  const fringeRef = useRef<SVGFEDisplacementMapElement>(null);

  useEffect(() => {
    const viewport = viewportRef.current;
    const image = imageRef.current;
    const displacement = displacementRef.current;
    if (!viewport || !image || !displacement || disabled || itemCount < 2) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const map = document.createElement("canvas");
    // A smooth field can be sampled at lower resolution than the text it bends.
    map.width = 256;
    map.height = 160;
    const context = map.getContext("2d");
    if (!context) return;
    const pixels = context.createImageData(map.width, map.height);
    let frame = 0;
    let energy = 0;
    let lastFrame = 0;
    const base = PRESETS[preset];

    const paint = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (!width || !height || media.matches) {
        viewport.style.filter = "";
        return;
      }
      const halfW = base.width * width * 0.5 * (1 + energy * liquid * 0.16);
      const halfH = base.height * width * 0.5 * (1 - energy * liquid * 0.08);
      const angle = base.tilt * Math.PI / 180;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const inner = Math.max(4, base.reach * (halfW + halfH) * 0.5);
      const outer = inner * 1.6;
      const track = viewport.firstElementChild;
      const padding = track ? Number.parseFloat(getComputedStyle(track).paddingTop) : 72;
      const mobileStrength = width < 640 ? 0.75 : 1;
      const flow = Math.min(padding * 0.65, base.bend * (halfW + halfH) * 0.45) * mobileStrength;
      const scale = Math.max(1, flow * 2.8);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const rx = (x + 0.5) / map.width * width - width / 2 + energy * liquid * 14;
          const ry = height / 2 - (y + 0.5) / map.height * height;
          const lx = ca * rx + sa * ry;
          const ly = -sa * rx + ca * ry;
          const distance = Math.max(1e-5, Math.hypot(lx / halfW, ly / halfH));
          const gx = lx / (halfW * halfW * distance);
          const gy = ly / (halfH * halfH * distance);
          const gradient = Math.max(1e-6, Math.hypot(gx, gy));
          const edge = (distance - 1) / gradient;
          const nx = (ca * gx - sa * gy) / gradient;
          const ny = (sa * gx + ca * gy) / gradient;
          const t = Math.max(0, Math.min(1, (edge + inner) / (inner + outer)));
          const ramp = t * t * t * (t * (t * 6 - 15) + 10);
          const slope = 16 * t * t * (1 - t) * (1 - t);
          const reach = Math.max(0, Math.min(1, (Math.abs(rx / (width * 0.5)) - 0.02) / 0.28));
          const side = reach * reach * (3 - 2 * reach) * (base.curl || Math.sign(rx));
          const swirl = side * slope * flow * 0.35;
          const dx = ny * nx * swirl;
          const dy = ramp * side * flow + nx * nx * swirl;
          const offset = (y * map.width + x) * 4;
          pixels.data[offset] = Math.round(128 + 254 * dx / scale);
          pixels.data[offset + 1] = Math.round(128 + 254 * dy / scale);
          pixels.data[offset + 2] = 128;
          pixels.data[offset + 3] = 255;
        }
      }
      context.putImageData(pixels, 0, 0);
      displacement.setAttribute("scale", String(scale));
      fringeRef.current?.setAttribute("scale", String(scale * 1.006));
      image.setAttribute("href", map.toDataURL());
      viewport.style.filter = "url(#" + id + ")";
    };
    const draw = (now: number) => {
      frame = 0;
      if (now - lastFrame >= 32) {
        energy *= 0.8;
        paint();
        lastFrame = now;
      }
      if (energy > 0.01) frame = requestAnimationFrame(draw);
    };
    motionRef.current = (motion) => {
      energy = Math.max(energy, motion);
      if (!media.matches && !frame) frame = requestAnimationFrame(draw);
    };
    const observer = new ResizeObserver(paint);
    observer.observe(viewport);
    media.addEventListener("change", paint);
    paint();
    return () => {
      cancelAnimationFrame(frame);
      motionRef.current = null;
      observer.disconnect();
      media.removeEventListener("change", paint);
      viewport.style.filter = "";
    };
  }, [disabled, id, itemCount, liquid, motionRef, preset, viewportRef]);

  return (
    <svg className="flex-carousel__lens-definitions" aria-hidden="true" focusable="false">
      <defs>
        <filter id={id} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB">
          <feImage ref={imageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="lens" />
          <feGaussianBlur in="lens" stdDeviation="1.5" result="smoothLens" />
          <feComponentTransfer in="smoothLens" result="normalizedLens">
            <feFuncR type="linear" slope="1.003937" intercept="-0.003937" />
            <feFuncG type="linear" slope="1.003937" intercept="-0.003937" />
          </feComponentTransfer>
          <feDisplacementMap ref={displacementRef} in="SourceGraphic" in2="normalizedLens" xChannelSelector="R" yChannelSelector="G" result="bent" />
          {/* A restrained RGB fringe keeps statistics readable at the lens edge. */}
          <feDisplacementMap ref={fringeRef} in="SourceGraphic" in2="normalizedLens" xChannelSelector="R" yChannelSelector="G" result="redOffset" />
          <feColorMatrix in="redOffset" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
          <feColorMatrix in="bent" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cyan" />
          <feComposite in="red" in2="cyan" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" />
        </filter>
      </defs>
    </svg>
  );
}
