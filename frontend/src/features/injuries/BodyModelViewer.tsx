import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
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
  BODY_VIEWS,
  BODY_VIEW_LABELS,
  DEFAULT_ORBIT_RADIUS,
  ORBIT_TARGET,
  VIEW_AZIMUTHS,
  clampPolar,
  clampRadius,
  nearestView,
  orbitPosition,
  shortestAngleTo,
  type BodyView,
} from "./body-model";
import { BODY_REGIONS, bodyRegionLabel } from "./body-regions";
import { HEAD_HIDDEN_MESH_NAMES, MESH_NAME_TO_REGIONS } from "./anatomy-regions";
import type { BodyRegion } from "./types";

/* ═══════════════════════════════════════════════════════════════════════════
 *  SCENE CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */

/* Flat hex literals, not sRGB texture data — see the renderer setup below for
 * why that keeps colour management off. */
const SMOOTH_BODY_COLOR = 0xcccfd2;
const INJURED_COLOR = 0xef4444;
const INJURED_EMISSIVE = 0xb91c1c;
const MARKER_IDLE_COLOR = 0xef4444;
const MARKER_ACTIVE_DOT_COLOR = 0xffffff;
/** Radians per second the camera tweens toward a preset view. */
const TWEEN_SPEED = 7;
const DRAG_SENSITIVITY = 0.0075;

/** Served from `frontend/public/models`, so these are plain URLs, not imports. */
const SMOOTH_BODY_MODEL_URL = "/models/smooth_player.glb";
const ANATOMY_MODEL_URL = "/models/anatomy.glb";
const HEAD_MODEL_URL = "/models/head.glb";
/** Matches body-model.ts's frame: feet at y = 0, crown at y ≈ 1.80. */
const FIGURE_HEIGHT = 1.8;
/**
 * Whichever of the two horizontal axes ends up "forward" after correcting
 * for a source file's up axis isn't guaranteed to face the camera. These are
 * guesses, one per model — flip to Math.PI (or nudge in increments of it)
 * if a loaded figure turns out to be facing away from the camera on the
 * "front" preset.
 */
const SMOOTH_BODY_ROTATION_Y = 0;
const ANATOMY_ROTATION_Y = 0;
const HEAD_MODEL_ROTATION_Y = 0;
/**
 * The anatomy figure and the smooth mannequin are independently authored
 * models with no guarantee their limb proportions match at any given point
 * — a revealed muscle can end up visibly wider than the mannequin's own
 * limb there. Shrinking each muscle/tendon toward its own centre by this
 * fraction is a cheap mitigation so it reads as sitting inside the body
 * rather than bulging out of it; it does not fix a genuine misalignment.
 */
const ANATOMY_MESH_SHRINK = 0.4;
/**
 * `smooth_player.glb`'s bind pose is a T-pose (no animation clip ships with
 * it to relax it, and — per the lesson learned with the anatomy rig's own
 * clips — playing an unfamiliar clip on a rig this app didn't author is as
 * likely to corrupt its orientation as fix its pose). Rotating just the
 * upper-arm bones down before the skin is baked gets a relaxed standing
 * pose without needing any animation data at all.
 */
const RELAXED_ARM_ANGLE_FROM_DOWN_DEG = 15;
const LEFT_UPPER_ARM_BONE = "mixamorig1LeftArm_09";
const LEFT_FOREARM_BONE = "mixamorig1LeftForeArm_010";
const RIGHT_UPPER_ARM_BONE = "mixamorig1RightArm_033";
const RIGHT_FOREARM_BONE = "mixamorig1RightForeArm_034";

interface CalloutContent {
  title: string;
  subtitle?: string;
}

export interface BodyModelViewerProps {
  /** Regions with an open injury; only these are hoverable/clickable, and
   * each gets a subtle idle marker even before it's hovered. */
  injuredRegions: readonly BodyRegion[];
  /** The region the callout stays pinned to once hover ends. */
  selectedRegion?: BodyRegion | null;
  /** Callout text per injured region, keyed by region — whichever region is
   * currently active (hovered, falling back to selected) is shown. */
  injuryCallouts?: Partial<Record<BodyRegion, CalloutContent>>;
  onSelectRegion?: (region: BodyRegion) => void;
  className?: string;
}

/** One anatomy mesh, hidden until its region is revealed by hover/selection. */
interface MeshEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** The app regions this muscle/tendon counts toward; usually one. */
  regions: readonly BodyRegion[];
}

/** A region's idle-vs-active marker pair, floating at its anatomy centroid. */
interface MarkerEntry {
  dot: THREE.Mesh;
  halo: THREE.Mesh;
  dotMaterial: THREE.MeshBasicMaterial;
  haloMaterial: THREE.MeshBasicMaterial;
}

/** Disposes a texture-bearing material's own textures before the material. */
function disposeMaterial(material: THREE.Material) {
  for (const value of Object.values(material)) {
    if (value instanceof THREE.Texture) {
      value.dispose();
    }
  }
  material.dispose();
}

/** Disposes every geometry/material (and its textures) under a loaded rig. */
function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material)
        ? child.material
        : [child.material];
      materials.forEach(disposeMaterial);
    }
  });
}

/**
 * Rotates a freshly loaded model onto this viewer's Y-up, feet-at-0 frame.
 *
 * glTF only guarantees Y-up, but a model authored outside a glTF-native
 * pipeline (the anatomy set is exported straight from OBJ) commonly keeps
 * its source tool's Z-up convention instead. Rather than assume either way,
 * this measures which horizontal axis is actually the tall one and rotates
 * Z-up onto Y-up when that's what it finds; a properly Y-up file (Y already
 * the tall axis) is left alone.
 */
function orientToYUp(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  box.getSize(size);

  if (size.z > size.y) {
    // Standard Z-up -> Y-up: (x, y, z) -> (x, z, -y).
    root.rotation.x = -Math.PI / 2;
  }
}

const SKIN_COMPONENT_GETTERS = [
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getX(i),
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getY(i),
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getZ(i),
  (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, i: number) =>
    attr.getW(i),
];

/**
 * Bakes a SkinnedMesh's current (bind) pose into a plain, static Mesh.
 *
 * Replicates three.js's own skinning shader math (see `skinning_vertex.glsl`
 * / `skinnormal_vertex.glsl`) on the CPU, once, rather than every frame on
 * the GPU. It sidesteps a real bug this app has hit twice now: this
 * renderer's uniform-array skinning path silently drops meshes whose rig has
 * "too many" bones for its vertex-uniform budget rather than drawing them —
 * and since this viewer only ever shows a single static pose, runtime
 * skinning was never needed in the first place.
 */
function bakeSkinnedMesh(mesh: THREE.SkinnedMesh): THREE.Mesh {
  mesh.skeleton.update();
  const boneMatrices = mesh.skeleton.boneMatrices;

  const sourceGeometry = mesh.geometry;
  const positionAttr = sourceGeometry.attributes.position;
  const normalAttr = sourceGeometry.attributes.normal;
  const skinIndexAttr = sourceGeometry.attributes.skinIndex;
  const skinWeightAttr = sourceGeometry.attributes.skinWeight;

  const bakedPositions = new Float32Array(positionAttr.count * 3);
  const bakedNormals = new Float32Array(positionAttr.count * 3);

  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const skinMatrix = new THREE.Matrix4();
  const vertexMatrix = new THREE.Matrix4();
  const weightedSum = new Float32Array(16);

  for (let i = 0; i < positionAttr.count; i++) {
    vertex.fromBufferAttribute(positionAttr, i);
    normal.fromBufferAttribute(normalAttr, i);

    weightedSum.fill(0);
    for (let influence = 0; influence < 4; influence++) {
      const weight = SKIN_COMPONENT_GETTERS[influence](skinWeightAttr, i);
      if (weight === 0) {
        continue;
      }
      const boneOffset =
        SKIN_COMPONENT_GETTERS[influence](skinIndexAttr, i) * 16;
      for (let e = 0; e < 16; e++) {
        weightedSum[e] += boneMatrices[boneOffset + e] * weight;
      }
    }
    skinMatrix.fromArray(weightedSum);
    vertexMatrix
      .copy(mesh.bindMatrixInverse)
      .multiply(skinMatrix)
      .multiply(mesh.bindMatrix);

    vertex.applyMatrix4(vertexMatrix);
    normal.transformDirection(vertexMatrix);

    bakedPositions[i * 3] = vertex.x;
    bakedPositions[i * 3 + 1] = vertex.y;
    bakedPositions[i * 3 + 2] = vertex.z;
    bakedNormals[i * 3] = normal.x;
    bakedNormals[i * 3 + 1] = normal.y;
    bakedNormals[i * 3 + 2] = normal.z;
  }

  const bakedGeometry = new THREE.BufferGeometry();
  bakedGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(bakedPositions, 3),
  );
  bakedGeometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(bakedNormals, 3),
  );
  const uv = sourceGeometry.attributes.uv;
  if (uv) {
    bakedGeometry.setAttribute("uv", uv);
  }
  if (sourceGeometry.index) {
    bakedGeometry.setIndex(sourceGeometry.index);
  }

  const baked = new THREE.Mesh(bakedGeometry, mesh.material);
  baked.name = mesh.name;
  return baked;
}

/**
 * Rotates one bone so the direction from it to `child` swings down toward
 * vertical, to `angleFromDownDeg` off straight down, while keeping whichever
 * side it was already leaning toward (T-pose arms point sideways, so this
 * just reduces that lean rather than needing to know which world axis is
 * "left" or "right" for this particular rig).
 *
 * Works in world space and converts back to the bone's local (parent-
 * relative) rotation, so it doesn't need to know the bone's own rest-pose
 * axis convention either — only the direction to its child, which is read
 * from the current pose.
 */
function relaxArmBone(
  bone: THREE.Object3D,
  child: THREE.Object3D,
  angleFromDownDeg: number,
) {
  bone.updateMatrixWorld(true);
  const boneWorldPos = new THREE.Vector3();
  bone.getWorldPosition(boneWorldPos);
  const childWorldPos = new THREE.Vector3();
  child.getWorldPosition(childWorldPos);
  const currentDir = childWorldPos.sub(boneWorldPos).normalize();

  const horizontal = new THREE.Vector3(currentDir.x, 0, currentDir.z);
  if (horizontal.lengthSq() < 1e-6) {
    // Already pointing straight down/up — no lean direction to preserve.
    return;
  }
  horizontal.normalize();

  const angleRad = THREE.MathUtils.degToRad(angleFromDownDeg);
  const targetDir = new THREE.Vector3(
    horizontal.x * Math.sin(angleRad),
    -Math.cos(angleRad),
    horizontal.z * Math.sin(angleRad),
  ).normalize();

  const rotationDelta = new THREE.Quaternion().setFromUnitVectors(
    currentDir,
    targetDir,
  );
  const boneWorldQuat = new THREE.Quaternion();
  bone.getWorldQuaternion(boneWorldQuat);
  const desiredWorldQuat = rotationDelta.multiply(boneWorldQuat);

  const parentWorldQuat = new THREE.Quaternion();
  bone.parent?.getWorldQuaternion(parentWorldQuat);
  const localQuat = parentWorldQuat.invert().multiply(desiredWorldQuat);
  bone.quaternion.copy(localQuat);
  bone.updateMatrixWorld(true);
}

/** Finds a descendant by its (glTF-sanitized) name, if present. */
function findByName(
  root: THREE.Object3D,
  name: string,
): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (!found && child.name === name) {
      found = child;
    }
  });
  return found;
}

/** Shrinks a geometry toward its own bounding-box centre, in place. */
function shrinkGeometryTowardCenter(
  geometry: THREE.BufferGeometry,
  factor: number,
) {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) {
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(factor, factor, factor);
  geometry.translate(center.x, center.y, center.z);
}

/** Auto-fits a loaded model onto the shared "feet at 0, crown at 1.80" frame. */
function autoFit(root: THREE.Object3D, rotationY: number) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y || 1;
  const scale = FIGURE_HEIGHT / height;
  const centerX = (box.min.x + box.max.x) / 2;

  root.scale.setScalar(scale);
  root.position.set(-centerX * scale, -box.min.y * scale, 0);
  root.rotation.y += rotationY;
  root.updateMatrixWorld(true);
}

/**
 * Interactive 3D body model for the Injury & Recovery page.
 *
 * Three layers, all sharing the same "feet at y = 0, crown at y ≈ 1.80"
 * frame so they line up despite coming from unrelated source files:
 *
 *  - a smooth, coach-friendly mannequin (`smooth_player.glb`), always
 *    visible — this is what a coach sees by default, never clinical;
 *  - a real anatomical atlas (`anatomy.glb` + `head.glb`, hundreds of named
 *    muscles/tendons — see `anatomy-regions.ts`), hidden entirely except for
 *    whichever region is actively hovered — it never turns red just from
 *    being selected, only from the pointer being over it right now;
 *  - a small pulsing marker per injured region, so injuries are discoverable
 *    on the smooth body before a coach hovers anything; the selected (or
 *    hovered) region's marker and callout are emphasised regardless of
 *    whether its anatomy is currently revealed.
 *
 * Only regions with a recorded injury are interactive at all — hovering
 * elsewhere on the smooth body does nothing, matching how this viewer is
 * only ever used to browse an athlete's *existing* injuries (a new injury's
 * region is chosen elsewhere, in the log-injury dialog's region list).
 *
 * Revealed anatomy is drawn depth-test-disabled so it reads as "showing
 * through" the opaque mannequin at that spot without needing a real
 * per-pixel transparency mask — a deliberately simple stand-in for that.
 *
 * Falls back to an accessible region list whenever WebGL is unavailable — the
 * page must never depend on the canvas.
 */
export function BodyModelViewer({
  injuredRegions,
  selectedRegion = null,
  injuryCallouts,
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
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  /* Latest props for the animation loop and pointer handlers, so neither has
   * to be torn down and rebuilt when the injury selection changes. */
  const injuredRef = useRef(injuredRegions);
  const selectedRef = useRef(selectedRegion);
  const hoveredRegionRef = useRef<BodyRegion | null>(null);
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
    /* Every material below is a flat hex literal (no textures in any of
     * these models), which is already display-referred — an sRGB output
     * transform would gamma-encode it a second time and wash them out. */
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

    const geometries: THREE.BufferGeometry[] = [];
    let disposed = false;

    /* ── Smooth body (always visible, coach-friendly default) ────────────── */

    let loadedSmoothRoot: THREE.Object3D | null = null;

    new GLTFLoader().load(
      SMOOTH_BODY_MODEL_URL,
      (gltf) => {
        if (disposed) {
          return;
        }

        const root = gltf.scene;
        orientToYUp(root);
        root.updateMatrixWorld(true);

        const leftUpperArm = findByName(root, LEFT_UPPER_ARM_BONE);
        const leftForearm = findByName(root, LEFT_FOREARM_BONE);
        const rightUpperArm = findByName(root, RIGHT_UPPER_ARM_BONE);
        const rightForearm = findByName(root, RIGHT_FOREARM_BONE);
        if (leftUpperArm && leftForearm) {
          relaxArmBone(
            leftUpperArm,
            leftForearm,
            RELAXED_ARM_ANGLE_FROM_DOWN_DEG,
          );
        }
        if (rightUpperArm && rightForearm) {
          relaxArmBone(
            rightUpperArm,
            rightForearm,
            RELAXED_ARM_ANGLE_FROM_DOWN_DEG,
          );
        }

        const skinnedReplacements: Array<{
          parent: THREE.Object3D;
          skinned: THREE.SkinnedMesh;
          baked: THREE.Mesh;
        }> = [];
        root.traverse((child) => {
          if ((child as THREE.SkinnedMesh).isSkinnedMesh && child.parent) {
            const skinned = child as THREE.SkinnedMesh;
            skinnedReplacements.push({
              parent: child.parent,
              skinned,
              baked: bakeSkinnedMesh(skinned),
            });
          }
        });
        for (const { parent, skinned, baked } of skinnedReplacements) {
          baked.position.copy(skinned.position);
          baked.rotation.copy(skinned.rotation);
          baked.scale.copy(skinned.scale);
          parent.add(baked);
          parent.remove(skinned);
        }

        const smoothMaterial = new THREE.MeshStandardMaterial({
          color: SMOOTH_BODY_COLOR,
          roughness: 0.78,
          metalness: 0,
        });
        root.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.material = smoothMaterial;
          }
        });

        autoFit(root, SMOOTH_BODY_ROTATION_Y);
        loadedSmoothRoot = root;
        scene.add(root);
      },
      undefined,
      (error) => {
        console.error("Failed to load the smooth body model.", error);
      },
    );

    /* ── Anatomy + head (hidden; revealed per-region on hover/selection) ─── */
    /* The anatomy figure. Auto-scaled and re-centred to the same "feet at
     * y = 0, crown at y ≈ 1.80" frame the smooth body and hotspot math use,
     * from its own bounding box rather than a hard-coded size, since
     * nothing about the source file guarantees its authored scale. */
    let loadedAnatomyRoot: THREE.Object3D | null = null;
    let loadedHeadRoot: THREE.Object3D | null = null;
    let meshEntries: MeshEntry[] = [];
    let allAnatomyMeshes: THREE.Mesh[] = [];
    let regionHotspots = new Map<BodyRegion, THREE.Vector3>();

    /* Recomputes every region's hotspot from whatever anatomy meshes are
     * currently registered — called once after the anatomy body loads and
     * again once head.glb fits into the facial-muscle gap, since the two
     * loads finish independently. */
    function refreshHotspots() {
      const regionMeshBoxes = new Map<BodyRegion, THREE.Box3>();
      const meshBox = new THREE.Box3();
      for (const entry of meshEntries) {
        if (entry.regions.length === 0) {
          continue;
        }
        meshBox.setFromObject(entry.mesh);
        for (const region of entry.regions) {
          const existing = regionMeshBoxes.get(region);
          if (existing) {
            existing.union(meshBox);
          } else {
            regionMeshBoxes.set(region, meshBox.clone());
          }
        }
      }
      const hotspots = new Map<BodyRegion, THREE.Vector3>();
      for (const [region, regionBox] of regionMeshBoxes) {
        hotspots.set(region, regionBox.getCenter(new THREE.Vector3()));
      }
      regionHotspots = hotspots;
    }

    /** Shared setup for every revealed anatomy/head mesh's material. */
    function revealableMaterial(): THREE.MeshStandardMaterial {
      return new THREE.MeshStandardMaterial({
        color: INJURED_COLOR,
        emissive: new THREE.Color(INJURED_EMISSIVE),
        emissiveIntensity: 0,
        roughness: 0.6,
        metalness: 0.03,
        // Drawn after (and over) the opaque smooth body regardless of which
        // is geometrically nearer the camera — a deliberately simple stand-in
        // for a true local-transparency mask (see the component doc above).
        depthTest: false,
        depthWrite: false,
      });
    }

    /* A single throwaway material for the invisible full-size pick meshes
     * below — never rendered, just needed to satisfy the Mesh constructor. */
    const pickOnlyMaterial = new THREE.MeshBasicMaterial();

    new GLTFLoader().load(
      ANATOMY_MODEL_URL,
      (gltf) => {
        if (disposed) {
          return;
        }

        const root = gltf.scene;
        orientToYUp(root);

        const entries: MeshEntry[] = [];
        const hiddenHeadMeshes: THREE.Mesh[] = [];
        const allMeshes: THREE.Mesh[] = [];

        root.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) {
            return;
          }
          if (HEAD_HIDDEN_MESH_NAMES.has(child.name)) {
            // Kept in the scene graph (invisible) only so its geometry can
            // still size where head.glb needs to fit, below.
            child.visible = false;
            hiddenHeadMeshes.push(child);
            return;
          }
          const regions = MESH_NAME_TO_REGIONS.get(child.name) ?? [];
          // Raycasting is done against a same-named, full-size, invisible
          // sibling rather than the visual mesh below: shrinking the visual
          // mesh so a revealed muscle doesn't bulge past the mannequin's
          // skin would otherwise shrink its hoverable area by the same
          // amount, making regions harder to hover the more they're shrunk.
          const pickMesh = new THREE.Mesh(
            child.geometry.clone(),
            pickOnlyMaterial,
          );
          pickMesh.name = child.name;
          pickMesh.visible = false;
          child.parent!.add(pickMesh);
          allMeshes.push(pickMesh);

          shrinkGeometryTowardCenter(child.geometry, ANATOMY_MESH_SHRINK);
          const material = revealableMaterial();
          child.material = material;
          child.visible = false;
          child.renderOrder = 5;
          entries.push({ mesh: child, material, regions });
        });

        if (import.meta.env.DEV) {
          const found = new Set(entries.map((entry) => entry.mesh.name));
          const missing = Array.from(MESH_NAME_TO_REGIONS.keys()).filter(
            (name) => !found.has(name),
          );
          if (missing.length > 0) {
            console.warn(
              "anatomy-regions.ts references mesh names not found in anatomy.glb:",
              missing,
            );
          }
        }

        autoFit(root, ANATOMY_ROTATION_Y);

        meshEntries = entries;
        allAnatomyMeshes = allMeshes;
        refreshHotspots();
        loadedAnatomyRoot = root;
        scene.add(root);

        /* The gap left by the hidden facial muscles, still measurable from
         * their (invisible) geometry — head.glb is fitted into exactly this
         * box once it loads, below. */
        const headBox = new THREE.Box3();
        for (const hiddenMesh of hiddenHeadMeshes) {
          headBox.union(new THREE.Box3().setFromObject(hiddenMesh));
        }
        if (headBox.isEmpty()) {
          return;
        }

        new GLTFLoader().load(
          HEAD_MODEL_URL,
          (headGltf) => {
            if (disposed) {
              return;
            }

            const headRoot = headGltf.scene;
            orientToYUp(headRoot);
            headRoot.updateMatrixWorld(true);

            const headModelBox = new THREE.Box3().setFromObject(headRoot);
            const headModelHeight =
              headModelBox.max.y - headModelBox.min.y || 1;
            const targetHeight = headBox.max.y - headBox.min.y;
            const headScale = targetHeight / headModelHeight;
            const headModelCenter = headModelBox.getCenter(new THREE.Vector3());
            const targetCenter = headBox.getCenter(new THREE.Vector3());

            headRoot.scale.setScalar(headScale);
            headRoot.position.set(
              targetCenter.x - headModelCenter.x * headScale,
              targetCenter.y - headModelCenter.y * headScale,
              targetCenter.z - headModelCenter.z * headScale,
            );
            headRoot.rotation.y += HEAD_MODEL_ROTATION_Y;
            headRoot.updateMatrixWorld(true);

            const headEntries: MeshEntry[] = [];
            headRoot.traverse((child) => {
              if (!(child instanceof THREE.Mesh)) {
                return;
              }
              const sourceMaterial = Array.isArray(child.material)
                ? child.material[0]
                : child.material;
              if (sourceMaterial?.name === "Eye_Ball") {
                // Hidden along with the rest of the head — eyes have no
                // "region" of their own to be revealed by.
                child.visible = false;
                return;
              }
              const material = revealableMaterial();
              child.material = material;
              child.visible = false;
              child.renderOrder = 5;
              allAnatomyMeshes.push(child);
              headEntries.push({ mesh: child, material, regions: ["head"] });
            });

            meshEntries = [...meshEntries, ...headEntries];
            refreshHotspots();
            loadedHeadRoot = headRoot;
            scene.add(headRoot);
          },
          undefined,
          (error) => {
            console.error("Failed to load the head model.", error);
          },
        );
      },
      undefined,
      (error) => {
        console.error("Failed to load the anatomy model.", error);
      },
    );

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

    /* ── Injury markers ───────────────────────────────────────────────────
     * One dot+halo pair per currently-injured region, kept in sync with the
     * `injuredRegions` prop every frame (cheap: there are never more than a
     * handful at once). Idle markers are small and faint so the smooth body
     * stays the dominant visual; whichever region is hovered/selected gets a
     * bigger, brighter pair instead. Drawn depth-test-disabled like the
     * revealed anatomy, since their world position sits inside the body. */
    const markerDotGeometry = new THREE.SphereGeometry(0.018, 16, 12);
    const markerHaloGeometry = new THREE.SphereGeometry(0.036, 16, 12);
    geometries.push(markerDotGeometry, markerHaloGeometry);
    const markers = new Map<BodyRegion, MarkerEntry>();

    function syncMarkers(currentInjured: readonly BodyRegion[]) {
      const currentSet = new Set(currentInjured);
      for (const [region, entry] of markers) {
        if (!currentSet.has(region)) {
          scene.remove(entry.dot, entry.halo);
          entry.dotMaterial.dispose();
          entry.haloMaterial.dispose();
          markers.delete(region);
        }
      }
      for (const region of currentSet) {
        if (markers.has(region)) {
          continue;
        }
        const dotMaterial = new THREE.MeshBasicMaterial({
          color: MARKER_ACTIVE_DOT_COLOR,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const haloMaterial = new THREE.MeshBasicMaterial({
          color: MARKER_IDLE_COLOR,
          transparent: true,
          depthTest: false,
          depthWrite: false,
        });
        const dot = new THREE.Mesh(markerDotGeometry, dotMaterial);
        const halo = new THREE.Mesh(markerHaloGeometry, haloMaterial);
        dot.renderOrder = 10;
        halo.renderOrder = 10;
        dot.visible = false;
        halo.visible = false;
        scene.add(dot, halo);
        markers.set(region, { dot, halo, dotMaterial, haloMaterial });
      }
    }

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
    /* Only a region with a recorded injury is interactive: a hit on anatomy
     * that doesn't map to a currently-injured region is treated as a miss.
     * A new injury's region is chosen elsewhere (the log-injury dialog), not
     * by clicking this model, so nothing is lost by restricting it this way. */

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pick(event: PointerEvent): BodyRegion | null {
      const rect = container!.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      // Nearby unmapped (or non-injured) muscles routinely sit in front of
      // the mapped one along the same ray — e.g. the thigh is many
      // overlapping meshes — so every hit is checked in distance order
      // rather than only trusting the nearest.
      const hits = raycaster.intersectObjects(allAnatomyMeshes, false);
      const injuredNow = injuredRef.current;
      for (const hit of hits) {
        const regions = MESH_NAME_TO_REGIONS.get(hit.object.name);
        const match = regions?.find((region) => injuredNow.includes(region));
        if (match) {
          return match;
        }
      }
      return null;
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

      const region = pick(event);
      hoveredRegionRef.current = region;
      setHoveredRegion(region);
      container!.style.cursor = region ? "pointer" : "grab";
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
      const region = pick(event);
      if (region) {
        onSelectRef.current?.(region);
      }
    }

    function onPointerLeave() {
      hoveredRegionRef.current = null;
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

      /* Anatomy only ever goes red while actively hovered — selecting a
       * region (clicking it) keeps its marker/callout emphasised but does
       * not, by itself, reveal anatomy. */
      const hoveredNow = hoveredRegionRef.current;
      const activeRegion = hoveredNow ?? selectedRef.current;
      const pulse = reducedMotion ? 0.55 : 0.42 + Math.sin(now / 420) * 0.22;

      for (const entry of meshEntries) {
        const revealed =
          hoveredNow !== null && entry.regions.includes(hoveredNow);
        entry.mesh.visible = revealed;
        if (revealed) {
          entry.material.emissiveIntensity = pulse;
        }
      }

      /* Injury markers: idle and faint by default, stronger for the active
       * region — kept in sync with the injuredRegions prop every frame since
       * there are only ever a handful at once. */
      syncMarkers(injuredRef.current);
      const idlePulse = reducedMotion ? 0.85 : 0.85 + Math.sin(now / 650) * 0.08;
      const activePulse = reducedMotion ? 1 : 1 + Math.sin(now / 420) * 0.22;
      for (const [region, marker] of markers) {
        const position = regionHotspots.get(region);
        if (!position) {
          marker.dot.visible = false;
          marker.halo.visible = false;
          continue;
        }
        marker.dot.position.copy(position);
        marker.halo.position.copy(position);
        marker.dot.visible = true;
        marker.halo.visible = true;
        if (region === activeRegion) {
          marker.dotMaterial.opacity = 0.95;
          marker.haloMaterial.opacity = 0.5;
          marker.dot.scale.setScalar(1.4);
          marker.halo.scale.setScalar(activePulse * 1.6);
        } else {
          marker.dotMaterial.opacity = 0.5;
          marker.haloMaterial.opacity = 0.22;
          marker.dot.scale.setScalar(0.85);
          marker.halo.scale.setScalar(idlePulse);
        }
      }

      /* The HTML callout follows the active region's hotspot. */
      const hotspotPosition = activeRegion
        ? regionHotspots.get(activeRegion)
        : null;
      const element = calloutRef.current;
      if (hotspotPosition && element) {
        projected.copy(hotspotPosition).project(camera);
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
      } else if (element) {
        element.style.opacity = "0";
      }

      renderer.render(scene, camera);
    }

    frame = requestAnimationFrame(animate);

    /* ── Teardown ───────────────────────────────────────────────────────── */

    return () => {
      disposed = true;
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
      groundMaterial.dispose();
      pickOnlyMaterial.dispose();
      for (const entry of markers.values()) {
        entry.dotMaterial.dispose();
        entry.haloMaterial.dispose();
      }
      if (loadedSmoothRoot) {
        disposeObject3D(loadedSmoothRoot);
      }
      if (loadedAnatomyRoot) {
        disposeObject3D(loadedAnatomyRoot);
      }
      if (loadedHeadRoot) {
        disposeObject3D(loadedHeadRoot);
      }
      renderer.dispose();
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

  const activeRegion = hoveredRegion ?? selectedRegion ?? null;
  const activeCallout = activeRegion ? injuryCallouts?.[activeRegion] : null;
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

        {/* The callout for the active (hovered, else selected) region,
            positioned each frame from the hotspot's projected screen
            coordinates. */}
        {activeCallout && (
          <div
            ref={calloutRef}
            className="pointer-events-none absolute left-0 top-0 max-w-[200px] rounded-lg border border-border/70 bg-card/95 px-3 py-2 opacity-0 shadow-xl backdrop-blur transition-opacity"
          >
            <p className="text-xs font-semibold text-foreground">
              {activeCallout.title}
            </p>
            {activeCallout.subtitle && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {activeCallout.subtitle}
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
