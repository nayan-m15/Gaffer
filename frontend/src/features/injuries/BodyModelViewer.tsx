import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import {
  Expand,
  Minus,
  MousePointerClick,
  Plus,
  RotateCcw,
  ZoomIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BODY_PARTS,
  BODY_VIEWS,
  BODY_VIEW_LABELS,
  DEFAULT_ORBIT_RADIUS,
  ORBIT_TARGET,
  REGION_PLACEMENTS,
  VIEW_AZIMUTHS,
  clampPolar,
  clampRadius,
  nearestView,
  orbitPosition,
  regionsForPart,
  shortestAngleTo,
  type BodyPartId,
  type BodyView,
  type ShapeSpec,
  type Vec3,
} from "./body-model";
import { BODY_REGIONS, bodyRegionLabel } from "./body-regions";
import type { BodyRegion } from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
 *  SCENE CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */

/* A mid-slate mannequin: light enough to read its form against the dark
 * page, dark enough that ACES tone mapping does not blow it out to white. */
const BASE_COLOR = 0x7c8794;
const HOVER_COLOR = 0xa6b2c0;
const INJURED_COLOR = 0xef4444;
const INJURED_EMISSIVE = 0xb91c1c;
/** Radians per second the camera tweens toward a preset view. */
const TWEEN_SPEED = 7;
const DRAG_SENSITIVITY = 0.0075;

interface CalloutContent {
  title: string;
  subtitle?: string;
}

export interface BodyModelViewerProps {
  /** Regions with an open injury; these light up. */
  injuredRegions: readonly BodyRegion[];
  /** The region the callout is pinned to, if any. */
  selectedRegion?: BodyRegion | null;
  /** Text for the pinned callout. */
  callout?: CalloutContent | null;
  onSelectRegion?: (region: BodyRegion) => void;
  className?: string;
}

interface BuiltMesh {
  geometry: THREE.BufferGeometry;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

const UNIT_Y = new THREE.Vector3(0, 1, 0);

function ellipsoidMesh(center: Vec3, radii: Vec3): BuiltMesh {
  return {
    geometry: new THREE.SphereGeometry(1, 30, 22),
    position: new THREE.Vector3(...center),
    scale: new THREE.Vector3(...radii),
    quaternion: new THREE.Quaternion(),
  };
}

/**
 * Builds the meshes for one shape of a part.
 *
 * A segment becomes a tapered cylinder plus a sphere at each end. The caps
 * are what make a joint read as a joint: without them an elbow or a knee is
 * a visible dark gap between two disconnected tubes.
 */
function buildShape(shape: ShapeSpec): BuiltMesh[] {
  if (shape.kind === "ellipsoid") {
    return [ellipsoidMesh(shape.center, shape.radii)];
  }

  const from = new THREE.Vector3(...shape.from);
  const to = new THREE.Vector3(...shape.to);
  const direction = new THREE.Vector3().subVectors(to, from);
  const length = direction.length();

  return [
    {
      geometry: new THREE.CylinderGeometry(
        shape.radiusTo,
        shape.radiusFrom,
        length,
        22,
        1,
      ),
      position: new THREE.Vector3().addVectors(from, to).multiplyScalar(0.5),
      scale: new THREE.Vector3(1, 1, 1),
      // A cylinder is built along +Y, so it is rotated onto the segment's
      // own axis rather than being rebuilt in place.
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        UNIT_Y,
        direction.clone().normalize(),
      ),
    },
    ellipsoidMesh(shape.from, [
      shape.radiusFrom,
      shape.radiusFrom,
      shape.radiusFrom,
    ]),
    ellipsoidMesh(shape.to, [
      shape.radiusTo,
      shape.radiusTo,
      shape.radiusTo,
    ]),
  ];
}

/**
 * Interactive 3D body model for the Injury & Recovery page.
 *
 * Built procedurally from the specification in `body-model.ts` rather than a
 * loaded asset: it needs no licensed model, stays themable, and every region
 * is a first-class object that can be lit up and picked. The mesh source sits
 * behind this component's props, so a licensed anatomical model can replace
 * the procedural figure later without the page changing.
 *
 * Falls back to an accessible region list whenever WebGL is unavailable — the
 * page must never depend on the canvas.
 */
export function BodyModelViewer({
  injuredRegions,
  selectedRegion = null,
  callout = null,
  onSelectRegion,
  className,
}: BodyModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calloutRef = useRef<HTMLDivElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [view, setView] = useState<BodyView>("front");
  const [hoveredRegion, setHoveredRegion] = useState<BodyRegion | null>(null);

  /* Camera orbit state lives in refs: it is mutated every frame by the
   * animation loop and by pointer handlers, and must not re-render React. */
  const azimuthRef = useRef(VIEW_AZIMUTHS.front);
  const polarRef = useRef(0);
  const radiusRef = useRef(DEFAULT_ORBIT_RADIUS);
  const targetAzimuthRef = useRef(VIEW_AZIMUTHS.front);
  const targetPolarRef = useRef(0);

  /* Scene handles the imperative controls need to reach. */
  const materialsRef = useRef(new Map<BodyPartId, THREE.MeshStandardMaterial>());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  /* Latest props for the animation loop and pointer handlers, so neither has
   * to be torn down and rebuilt when the injury selection changes. */
  const injuredRef = useRef(injuredRegions);
  const selectedRef = useRef(selectedRegion);
  const hoveredPartRef = useRef<BodyPartId | null>(null);
  const onSelectRef = useRef(onSelectRegion);

  useEffect(() => {
    injuredRef.current = injuredRegions;
  }, [injuredRegions]);
  useEffect(() => {
    selectedRef.current = selectedRegion;
  }, [selectedRegion]);
  useEffect(() => {
    onSelectRef.current = onSelectRegion;
  }, [onSelectRegion]);

  const injuredParts = useMemo(() => {
    const parts = new Set<BodyPartId>();
    for (const region of injuredRegions) {
      const placement = REGION_PLACEMENTS[region];
      if (placement) {
        parts.add(placement.part);
      }
    }

    return parts;
  }, [injuredRegions]);
  const injuredPartsRef = useRef(injuredParts);
  useEffect(() => {
    injuredPartsRef.current = injuredParts;
  }, [injuredParts]);

  /* ── Scene setup ──────────────────────────────────────────────────────── */

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: true,
      });
    } catch {
      // The region list below carries the same information without WebGL.
      setWebglFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    /* `outputEncoding` is deliberately left at r128's linear default, as in
     * StadiumScene. This version has no colour management, so a material
     * colour set from a hex literal is already display-referred; adding an
     * sRGB output transform gamma-encodes it a second time and washes the
     * whole figure out to near-white. */
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    cameraRef.current = camera;
    const target = new THREE.Vector3(...ORBIT_TARGET);

    /* Lighting: a key light from the camera's side of the figure plus a cool
     * fill, so the silhouette reads against the dark page without the
     * highlighted regions being washed out. */
    scene.add(new THREE.AmbientLight(0xffffff, 0.32));
    const hemisphere = new THREE.HemisphereLight(0x9fc0ff, 0x141c26, 0.5);
    scene.add(hemisphere);
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(2.4, 3.4, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7ba7ff, 0.45);
    rim.position.set(-2.8, 1.8, -2.6);
    scene.add(rim);

    /* ── Meshes ─────────────────────────────────────────────────────────── */

    const geometries: THREE.BufferGeometry[] = [];
    const materials = new Map<BodyPartId, THREE.MeshStandardMaterial>();
    const pickables: THREE.Mesh[] = [];
    const figure = new THREE.Group();

    for (const part of BODY_PARTS) {
      const material = new THREE.MeshStandardMaterial({
        color: BASE_COLOR,
        roughness: 0.68,
        metalness: 0.04,
        emissive: new THREE.Color(0x000000),
        emissiveIntensity: 0,
      });
      materials.set(part.id, material);

      for (const shape of part.shapes) {
        for (const built of buildShape(shape)) {
          geometries.push(built.geometry);
          const mesh = new THREE.Mesh(built.geometry, material);
          mesh.position.copy(built.position);
          mesh.scale.copy(built.scale);
          mesh.quaternion.copy(built.quaternion);
          // Read back by the raycaster to resolve a hit to its part.
          mesh.userData.partId = part.id;
          figure.add(mesh);
          pickables.push(mesh);
        }
      }
    }

    scene.add(figure);
    materialsRef.current = materials;

    /* A soft ground shadow so the figure does not float. */
    const groundGeometry = new THREE.CircleGeometry(0.75, 48);
    geometries.push(groundGeometry);
    const groundMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.28,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.002;
    scene.add(ground);

    /* ── Hotspot marker ───────────────────────────────────────────────────
     * A small billboarded ring that sits on the selected region, matching
     * the approved design's pinpoint. Its screen position also drives the
     * HTML callout. */
    const hotspotGeometry = new THREE.SphereGeometry(0.018, 16, 12);
    geometries.push(hotspotGeometry);
    const hotspotMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hotspot = new THREE.Mesh(hotspotGeometry, hotspotMaterial);
    hotspot.visible = false;
    scene.add(hotspot);

    const haloGeometry = new THREE.SphereGeometry(0.036, 16, 12);
    geometries.push(haloGeometry);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.45,
    });
    const halo = new THREE.Mesh(haloGeometry, haloMaterial);
    halo.visible = false;
    scene.add(halo);

    /* ── Sizing ─────────────────────────────────────────────────────────── */

    function resize() {
      const { clientWidth, clientHeight } = container!;
      if (clientWidth === 0 || clientHeight === 0) {
        return;
      }
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    /* ── Picking ────────────────────────────────────────────────────────── */

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    /**
     * Resolves a hit on a part to the specific region that was clicked.
     *
     * A thigh carries both the quad and the hamstring, so the nearest
     * hotspot to the actual intersection decides which — clicking the back
     * of the leg selects the hamstring, the front selects the quad.
     */
    function regionAtPoint(
      partId: BodyPartId,
      point: THREE.Vector3,
    ): BodyRegion | null {
      const candidates = regionsForPart(partId);
      if (candidates.length === 0) {
        return null;
      }
      let best = candidates[0];
      let bestDistance = Infinity;
      for (const region of candidates) {
        const hotspot = REGION_PLACEMENTS[region].hotspot;
        const distance = point.distanceToSquared(
          new THREE.Vector3(hotspot[0], hotspot[1], hotspot[2]),
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          best = region;
        }
      }

      return best;
    }

    function pick(event: PointerEvent): {
      partId: BodyPartId;
      region: BodyRegion;
    } | null {
      const rect = container!.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const [hit] = raycaster.intersectObjects(pickables, false);
      if (!hit) {
        return null;
      }
      const partId = hit.object.userData.partId as BodyPartId | undefined;
      if (!partId) {
        return null;
      }
      const region = regionAtPoint(partId, hit.point);

      return region ? { partId, region } : null;
    }

    /* ── Pointer interaction ────────────────────────────────────────────── */

    let dragging = false;
    let dragMoved = false;
    let lastX = 0;
    let lastY = 0;
    let activePointer: number | null = null;

    function onPointerDown(event: PointerEvent) {
      // Only the primary button starts an orbit; a right-click belongs to
      // the browser.
      if (event.button !== 0) {
        return;
      }
      dragging = true;
      dragMoved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      activePointer = event.pointerId;
      container!.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (dragging) {
        const deltaX = event.clientX - lastX;
        const deltaY = event.clientY - lastY;
        if (Math.abs(deltaX) + Math.abs(deltaY) > 2) {
          dragMoved = true;
        }
        lastX = event.clientX;
        lastY = event.clientY;
        azimuthRef.current -= deltaX * DRAG_SENSITIVITY;
        polarRef.current = clampPolar(
          polarRef.current + deltaY * DRAG_SENSITIVITY,
        );
        // A manual drag cancels any in-flight tween to a preset.
        targetAzimuthRef.current = azimuthRef.current;
        targetPolarRef.current = polarRef.current;
        setView(nearestView(azimuthRef.current));
        return;
      }

      const hit = pick(event);
      hoveredPartRef.current = hit?.partId ?? null;
      setHoveredRegion(hit?.region ?? null);
      container!.style.cursor = hit ? "pointer" : "grab";
    }

    function endDrag(event: PointerEvent) {
      if (!dragging) {
        return;
      }
      dragging = false;
      if (activePointer !== null && container!.hasPointerCapture(activePointer)) {
        container!.releasePointerCapture(activePointer);
      }
      activePointer = null;
      // A drag that happened to end over a region must not select it.
      if (dragMoved) {
        return;
      }
      const hit = pick(event);
      if (hit) {
        onSelectRef.current?.(hit.region);
      }
    }

    function onPointerLeave() {
      hoveredPartRef.current = null;
      setHoveredRegion(null);
    }

    function onWheel(event: WheelEvent) {
      // The page must still scroll past the viewer on a touchpad, so only a
      // deliberate wheel over the canvas zooms.
      event.preventDefault();
      radiusRef.current = clampRadius(
        radiusRef.current + event.deltaY * 0.0022,
      );
    }

    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("pointermove", onPointerMove);
    container.addEventListener("pointerup", endDrag);
    container.addEventListener("pointercancel", endDrag);
    container.addEventListener("pointerleave", onPointerLeave);
    container.addEventListener("wheel", onWheel, { passive: false });
    container.style.cursor = "grab";

    /* ── Animation loop ─────────────────────────────────────────────────── */

    const projected = new THREE.Vector3();
    let frame = 0;
    let previous = performance.now();

    function animate(now: number) {
      frame = requestAnimationFrame(animate);
      const delta = Math.min((now - previous) / 1000, 0.1);
      previous = now;

      /* Ease toward the target orbit, so the preset buttons glide rather
       * than cut. `shortestAngleTo` keeps the turn under half a revolution. */
      const azimuthGap = shortestAngleTo(
        azimuthRef.current,
        targetAzimuthRef.current,
      );
      if (Math.abs(azimuthGap) > 0.0005) {
        azimuthRef.current += azimuthGap * Math.min(delta * TWEEN_SPEED, 1);
      }
      const polarGap = targetPolarRef.current - polarRef.current;
      if (Math.abs(polarGap) > 0.0005) {
        polarRef.current += polarGap * Math.min(delta * TWEEN_SPEED, 1);
      }

      const [x, y, z] = orbitPosition(
        azimuthRef.current,
        polarRef.current,
        radiusRef.current,
      );
      camera.position.set(x, y, z);
      camera.lookAt(target);

      /* Region tinting. Injured parts glow, the hovered part lifts, and
       * everything else returns to the base tone. */
      const injuredPartSet = injuredPartsRef.current;
      const pulse = reducedMotion ? 0.55 : 0.42 + Math.sin(now / 420) * 0.22;
      for (const [partId, material] of materials) {
        const isInjured = injuredPartSet.has(partId);
        const isHovered = hoveredPartRef.current === partId;
        if (isInjured) {
          material.color.setHex(INJURED_COLOR);
          material.emissive.setHex(INJURED_EMISSIVE);
          material.emissiveIntensity = pulse;
        } else {
          material.color.setHex(isHovered ? HOVER_COLOR : BASE_COLOR);
          material.emissive.setHex(0x000000);
          material.emissiveIntensity = 0;
        }
      }

      /* Hotspot and its HTML callout follow the selected region. */
      const selected = selectedRef.current;
      const placement = selected ? REGION_PLACEMENTS[selected] : null;
      if (placement) {
        const [hx, hy, hz] = placement.hotspot;
        hotspot.position.set(hx, hy, hz);
        halo.position.set(hx, hy, hz);
        hotspot.visible = true;
        halo.visible = true;
        halo.scale.setScalar(reducedMotion ? 1 : 1 + Math.sin(now / 420) * 0.22);

        const element = calloutRef.current;
        if (element) {
          projected.set(hx, hy, hz).project(camera);
          const rect = container!.getBoundingClientRect();
          const screenX = (projected.x * 0.5 + 0.5) * rect.width;
          const screenY = (-projected.y * 0.5 + 0.5) * rect.height;
          // Flip the callout to the other side near the right edge so it
          // never runs off the canvas.
          const flip = screenX > rect.width - 210;
          element.style.transform = `translate(${
            flip ? screenX - 8 : screenX + 8
          }px, ${screenY}px) translate(${flip ? "-100%" : "0"}, -50%)`;
          element.style.opacity = projected.z < 1 ? "1" : "0";
        }
      } else {
        hotspot.visible = false;
        halo.visible = false;
        if (calloutRef.current) {
          calloutRef.current.style.opacity = "0";
        }
      }

      renderer.render(scene, camera);
    }

    frame = requestAnimationFrame(animate);

    /* ── Teardown ───────────────────────────────────────────────────────── */

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", endDrag);
      container.removeEventListener("pointercancel", endDrag);
      container.removeEventListener("pointerleave", onPointerLeave);
      container.removeEventListener("wheel", onWheel);

      for (const geometry of geometries) {
        geometry.dispose();
      }
      for (const material of materials.values()) {
        material.dispose();
      }
      groundMaterial.dispose();
      hotspotMaterial.dispose();
      haloMaterial.dispose();
      renderer.dispose();
      materialsRef.current = new Map();
      cameraRef.current = null;
    };
  }, []);

  /* ── Controls ─────────────────────────────────────────────────────────── */

  const goToView = useCallback((next: BodyView) => {
    targetAzimuthRef.current = VIEW_AZIMUTHS[next];
    targetPolarRef.current = 0;
    setView(next);
  }, []);

  const resetView = useCallback(() => {
    radiusRef.current = DEFAULT_ORBIT_RADIUS;
    goToView("front");
  }, [goToView]);

  const zoom = useCallback((amount: number) => {
    radiusRef.current = clampRadius(radiusRef.current + amount);
  }, []);

  const expand = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void container.requestFullscreen?.();
  }, []);

  /* ── WebGL-free fallback ──────────────────────────────────────────────── */

  if (webglFailed) {
    return (
      <BodyRegionListFallback
        injuredRegions={injuredRegions}
        selectedRegion={selectedRegion}
        onSelectRegion={onSelectRegion}
        className={className}
      />
    );
  }

  const hoverLabel = hoveredRegion ? bodyRegionLabel(hoveredRegion) : null;

  return (
    <div className={cn("relative", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div
          className="inline-flex rounded-lg border border-border/70 bg-card/70 p-1"
          role="group"
          aria-label="Camera angle"
        >
          {BODY_VIEWS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => goToView(option)}
              aria-pressed={view === option}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                view === option
                  ? "bg-primary/90 text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {BODY_VIEW_LABELS[option]}
            </button>
          ))}
        </div>

        <ul className="space-y-1.5 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-2">
            <MousePointerClick className="size-3.5" aria-hidden="true" />
            Click and drag to rotate
          </li>
          <li className="flex items-center gap-2">
            <ZoomIn className="size-3.5" aria-hidden="true" />
            Scroll to zoom
          </li>
        </ul>
      </div>

      <div
        ref={containerRef}
        className="relative mt-3 h-[440px] w-full touch-none select-none overflow-hidden rounded-xl border border-border/50 bg-[radial-gradient(circle_at_50%_12%,color-mix(in_oklab,var(--card)_80%,var(--primary)_6%),var(--background)_78%)] sm:h-[560px]"
      >
        <canvas ref={canvasRef} className="block size-full" />

        {/* The pinned callout for the selected region, positioned each frame
            from the hotspot's projected screen coordinates. */}
        {callout && (
          <div
            ref={calloutRef}
            className="pointer-events-none absolute left-0 top-0 max-w-[200px] rounded-lg border border-border/70 bg-card/95 px-3 py-2 opacity-0 shadow-xl backdrop-blur transition-opacity"
          >
            <p className="text-xs font-semibold text-foreground">
              {callout.title}
            </p>
            {callout.subtitle && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {callout.subtitle}
              </p>
            )}
          </div>
        )}

        {/* Hover readout, kept in a corner so it never chases the cursor. */}
        {hoverLabel && (
          <p className="pointer-events-none absolute left-3 top-3 rounded-md border border-border/60 bg-card/90 px-2 py-1 text-[11px] font-medium text-foreground">
            {hoverLabel}
          </p>
        )}

        <div className="absolute bottom-3 left-3">
          <button
            type="button"
            onClick={resetView}
            className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/85 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:text-primary"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Reset view
          </button>
        </div>

        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-lg border border-border/70 bg-card/85">
            <button
              type="button"
              onClick={() => zoom(-0.35)}
              aria-label="Zoom in"
              className="px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </button>
            <span className="w-px bg-border/70" aria-hidden="true" />
            <button
              type="button"
              onClick={() => zoom(0.35)}
              aria-label="Zoom out"
              className="px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={expand}
            aria-label="Expand the model to full screen"
            className="rounded-lg border border-border/70 bg-card/85 px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <Expand className="size-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* The model is a pointing device, not the only way in: this keeps
          every region reachable by keyboard and screen reader. */}
      <details className="mt-3 rounded-lg border border-border/60 bg-card/50 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Select a region from a list instead
        </summary>
        <div className="mt-2">
          <BodyRegionListFallback
            injuredRegions={injuredRegions}
            selectedRegion={selectedRegion}
            onSelectRegion={onSelectRegion}
            compact
          />
        </div>
      </details>
    </div>
  );
}

/**
 * The model's accessible equivalent: every region as a real control.
 *
 * Rendered both inside the viewer (behind a disclosure) and in place of it
 * when WebGL is unavailable, so a coach on a locked-down machine or using a
 * screen reader loses none of the page's function.
 */
function BodyRegionListFallback({
  injuredRegions,
  selectedRegion,
  onSelectRegion,
  className,
  compact = false,
}: {
  injuredRegions: readonly BodyRegion[];
  selectedRegion?: BodyRegion | null;
  onSelectRegion?: (region: BodyRegion) => void;
  className?: string;
  compact?: boolean;
}) {
  const injured = new Set(injuredRegions);
  // With no injuries to point at, the full 31-region list is noise; the
  // wizard is where a region gets chosen from scratch.
  const regions = compact
    ? BODY_REGIONS.filter((region) => injured.has(region))
    : BODY_REGIONS;

  if (regions.length === 0) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>
        No injured regions to select.
      </p>
    );
  }

  return (
    <div className={className}>
      {!compact && (
        <p className="mb-2 text-xs text-muted-foreground">
          The 3D model could not be displayed on this device. Every region is
          listed below.
        </p>
      )}
      <ul className="flex flex-wrap gap-1.5">
        {regions.map((region) => {
          const isInjured = injured.has(region);

          return (
            <li key={region}>
              <button
                type="button"
                onClick={() => onSelectRegion?.(region)}
                aria-pressed={selectedRegion === region}
                className={cn(
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  selectedRegion === region
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : isInjured
                      ? "border-red-500/40 bg-red-500/10 text-red-300 hover:border-red-500/60"
                      : "border-border/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                )}
              >
                {bodyRegionLabel(region)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
