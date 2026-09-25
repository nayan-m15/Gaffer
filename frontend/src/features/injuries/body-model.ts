import type { BodyRegion } from "./types";

/**
 * Declarative specification of the 3D body model.
 *
 * Deliberately free of any three.js import so the layout can be checked
 * without a WebGL context, and so `BodyModelViewer` is the only file that
 * has to know how a mesh is built.
 *
 * Frame of reference: Y is up with the feet at y = 0 and the crown at about
 * y = 1.80, and the figure faces +Z. In that frame the subject's own left is
 * +X, which is what puts their left side on the viewer's right when the
 * camera looks at the front — the same way it works standing in front of
 * someone.
 */

export type Vec3 = readonly [number, number, number];

/** An ellipsoid: a unit sphere scaled per axis. Torso, pelvis, joints. */
export interface EllipsoidSpec {
  kind: "ellipsoid";
  center: Vec3;
  radii: Vec3;
}

/** A tapered segment between two points, capped with spheres. Limbs. */
export interface SegmentSpec {
  kind: "segment";
  from: Vec3;
  to: Vec3;
  radiusFrom: number;
  radiusTo: number;
}

export type ShapeSpec = EllipsoidSpec | SegmentSpec;

/**
 * A physical piece of the model.
 *
 * Parts are anatomical volumes, not injury regions: one thigh is a single
 * volume even though a quad strain and a hamstring strain are different
 * injuries. The region-to-part map below is therefore many-to-one, and the
 * hotspot marker is what distinguishes front from back.
 */
export type BodyPartId =
  | "head"
  | "neck"
  | "torso_upper"
  | "torso_lower"
  | "pelvis"
  | "shoulder_left"
  | "shoulder_right"
  | "upper_arm_left"
  | "upper_arm_right"
  | "forearm_left"
  | "forearm_right"
  | "hand_left"
  | "hand_right"
  | "thigh_left"
  | "thigh_right"
  | "knee_left"
  | "knee_right"
  | "shank_left"
  | "shank_right"
  | "ankle_left"
  | "ankle_right"
  | "foot_left"
  | "foot_right";

export interface BodyPart {
  id: BodyPartId;
  shapes: ShapeSpec[];
}

/** Mirrors a part definition across the sagittal plane. */
function mirrored(
  leftId: BodyPartId,
  rightId: BodyPartId,
  shapes: ShapeSpec[],
): BodyPart[] {
  const flip = (shape: ShapeSpec): ShapeSpec =>
    shape.kind === "ellipsoid"
      ? {
          ...shape,
          center: [-shape.center[0], shape.center[1], shape.center[2]],
        }
      : {
          ...shape,
          from: [-shape.from[0], shape.from[1], shape.from[2]],
          to: [-shape.to[0], shape.to[1], shape.to[2]],
        };

  return [
    { id: leftId, shapes },
    { id: rightId, shapes: shapes.map(flip) },
  ];
}

export const BODY_PARTS: readonly BodyPart[] = [
  /* Proportions follow a roughly 7.5-heads-tall adult: the chest is wider
   * than it is deep, the waist narrower than both, and the hips a little
   * narrower than the shoulders. Getting these relative widths right is what
   * separates a figure from a snowman. */
  {
    id: "head",
    shapes: [
      {
        kind: "ellipsoid",
        center: [0, 1.675, 0.008],
        radii: [0.077, 0.108, 0.092],
      },
    ],
  },
  {
    id: "neck",
    shapes: [
      {
        kind: "segment",
        from: [0, 1.52, 0],
        to: [0, 1.6, 0],
        radiusFrom: 0.052,
        radiusTo: 0.045,
      },
    ],
  },
  {
    id: "torso_upper",
    shapes: [
      {
        kind: "ellipsoid",
        center: [0, 1.345, 0],
        radii: [0.152, 0.16, 0.098],
      },
    ],
  },
  {
    id: "torso_lower",
    shapes: [
      {
        kind: "ellipsoid",
        center: [0, 1.155, 0],
        radii: [0.125, 0.115, 0.086],
      },
    ],
  },
  {
    id: "pelvis",
    shapes: [
      {
        kind: "ellipsoid",
        center: [0, 1.0, -0.004],
        radii: [0.142, 0.1, 0.095],
      },
    ],
  },
  ...mirrored("shoulder_left", "shoulder_right", [
    {
      kind: "ellipsoid",
      center: [0.168, 1.425, 0],
      radii: [0.068, 0.065, 0.07],
    },
  ]),
  ...mirrored("upper_arm_left", "upper_arm_right", [
    {
      kind: "segment",
      from: [0.182, 1.4, 0],
      to: [0.216, 1.13, 0],
      radiusFrom: 0.048,
      radiusTo: 0.038,
    },
  ]),
  ...mirrored("forearm_left", "forearm_right", [
    {
      kind: "segment",
      from: [0.218, 1.115, 0],
      to: [0.244, 0.875, 0],
      radiusFrom: 0.037,
      radiusTo: 0.029,
    },
  ]),
  ...mirrored("hand_left", "hand_right", [
    {
      kind: "segment",
      from: [0.246, 0.862, 0.002],
      to: [0.254, 0.775, 0.008],
      radiusFrom: 0.03,
      radiusTo: 0.024,
    },
  ]),
  ...mirrored("thigh_left", "thigh_right", [
    {
      kind: "segment",
      from: [0.082, 0.955, 0],
      to: [0.072, 0.545, 0.004],
      radiusFrom: 0.083,
      radiusTo: 0.058,
    },
  ]),
  ...mirrored("knee_left", "knee_right", [
    {
      kind: "ellipsoid",
      center: [0.07, 0.515, 0.005],
      radii: [0.055, 0.052, 0.055],
    },
  ]),
  ...mirrored("shank_left", "shank_right", [
    {
      kind: "segment",
      from: [0.069, 0.487, 0.003],
      to: [0.064, 0.125, 0],
      radiusFrom: 0.053,
      radiusTo: 0.032,
    },
  ]),
  ...mirrored("ankle_left", "ankle_right", [
    {
      kind: "ellipsoid",
      center: [0.064, 0.098, -0.005],
      radii: [0.034, 0.034, 0.034],
    },
  ]),
  ...mirrored("foot_left", "foot_right", [
    {
      kind: "ellipsoid",
      center: [0.064, 0.03, 0.05],
      radii: [0.039, 0.03, 0.1],
    },
  ]),
] as const;

export const BODY_PART_IDS = BODY_PARTS.map((part) => part.id);

/**
 * Where each injury region lives on the model: the part that lights up, and
 * the point the hotspot marker and its callout attach to.
 *
 * The many-to-one mapping is the point. Highlighting the whole thigh and
 * pinning the marker to the back of it is exactly how a hamstring strain
 * reads on the approved design, and it avoids two overlapping half-cylinders
 * fighting over the same pixels.
 */
export interface RegionPlacement {
  part: BodyPartId;
  /** World-space anchor for the hotspot marker. */
  hotspot: Vec3;
}

export const REGION_PLACEMENTS: Record<BodyRegion, RegionPlacement> = {
  head: { part: "head", hotspot: [0, 1.7, 0.095] },
  neck: { part: "neck", hotspot: [0, 1.56, 0.046] },

  chest: { part: "torso_upper", hotspot: [0, 1.37, 0.095] },
  back_upper: { part: "torso_upper", hotspot: [0, 1.37, -0.095] },
  abdomen: { part: "torso_lower", hotspot: [0, 1.15, 0.084] },
  back_lower: { part: "torso_lower", hotspot: [0, 1.15, -0.084] },

  groin: { part: "pelvis", hotspot: [0, 0.965, 0.088] },
  glute_left: { part: "pelvis", hotspot: [0.07, 1.0, -0.09] },
  glute_right: { part: "pelvis", hotspot: [-0.07, 1.0, -0.09] },

  shoulder_left: { part: "shoulder_left", hotspot: [0.185, 1.45, 0.035] },
  shoulder_right: { part: "shoulder_right", hotspot: [-0.185, 1.45, 0.035] },
  upper_arm_left: { part: "upper_arm_left", hotspot: [0.205, 1.26, 0.042] },
  upper_arm_right: { part: "upper_arm_right", hotspot: [-0.205, 1.26, 0.042] },
  forearm_left: { part: "forearm_left", hotspot: [0.234, 0.99, 0.033] },
  forearm_right: { part: "forearm_right", hotspot: [-0.234, 0.99, 0.033] },
  wrist_hand_left: { part: "hand_left", hotspot: [0.252, 0.81, 0.026] },
  wrist_hand_right: { part: "hand_right", hotspot: [-0.252, 0.81, 0.026] },

  quad_left: { part: "thigh_left", hotspot: [0.079, 0.76, 0.076] },
  quad_right: { part: "thigh_right", hotspot: [-0.079, 0.76, 0.076] },
  hamstring_left: { part: "thigh_left", hotspot: [0.079, 0.76, -0.072] },
  hamstring_right: { part: "thigh_right", hotspot: [-0.079, 0.76, -0.072] },

  knee_left: { part: "knee_left", hotspot: [0.07, 0.515, 0.058] },
  knee_right: { part: "knee_right", hotspot: [-0.07, 0.515, 0.058] },

  calf_left: { part: "shank_left", hotspot: [0.068, 0.36, -0.055] },
  calf_right: { part: "shank_right", hotspot: [-0.068, 0.36, -0.055] },
  achilles_left: { part: "shank_left", hotspot: [0.065, 0.16, -0.04] },
  achilles_right: { part: "shank_right", hotspot: [-0.065, 0.16, -0.04] },

  ankle_left: { part: "ankle_left", hotspot: [0.064, 0.098, 0.032] },
  ankle_right: { part: "ankle_right", hotspot: [-0.064, 0.098, 0.032] },
  foot_left: { part: "foot_left", hotspot: [0.064, 0.045, 0.1] },
  foot_right: { part: "foot_right", hotspot: [-0.064, 0.045, 0.1] },
};

/** Every region that lights up a given part. */
export function regionsForPart(part: BodyPartId): BodyRegion[] {
  return (Object.keys(REGION_PLACEMENTS) as BodyRegion[]).filter(
    (region) => REGION_PLACEMENTS[region].part === part,
  );
}

/* ── Camera ───────────────────────────────────────────────────────────────── */

export type BodyView = "front" | "back" | "left" | "right";

export const BODY_VIEWS: readonly BodyView[] = [
  "front",
  "back",
  "left",
  "right",
] as const;

export const BODY_VIEW_LABELS: Record<BodyView, string> = {
  front: "Front",
  back: "Back",
  left: "Left",
  right: "Right",
};

/**
 * What the camera orbits: a little below the figure's centre of mass, which
 * with the default radius leaves headroom above the crown and keeps the feet
 * inside the frame.
 */
export const ORBIT_TARGET: Vec3 = [0, 0.9, 0];

export const DEFAULT_ORBIT_RADIUS = 3.45;
export const MIN_ORBIT_RADIUS = 1.45;
export const MAX_ORBIT_RADIUS = 4.6;

/**
 * Azimuth for each preset view, in radians, measured from +Z toward +X.
 *
 * "Left" shows the subject's own left side, so the camera sits at +X — the
 * side their left arm is on.
 */
export const VIEW_AZIMUTHS: Record<BodyView, number> = {
  front: 0,
  back: Math.PI,
  left: Math.PI / 2,
  right: -Math.PI / 2,
};

export const MIN_POLAR = -0.55;
export const MAX_POLAR = 0.55;

/** Clamps a drag-derived vertical angle to the range the model reads well in. */
export function clampPolar(polar: number): number {
  return Math.min(Math.max(polar, MIN_POLAR), MAX_POLAR);
}

export function clampRadius(radius: number): number {
  return Math.min(Math.max(radius, MIN_ORBIT_RADIUS), MAX_ORBIT_RADIUS);
}

/** Camera position for an orbit angle, in the same frame as the parts. */
export function orbitPosition(
  azimuth: number,
  polar: number,
  radius: number,
): Vec3 {
  const horizontal = Math.cos(polar) * radius;

  return [
    Math.sin(azimuth) * horizontal,
    ORBIT_TARGET[1] + Math.sin(polar) * radius,
    Math.cos(azimuth) * horizontal,
  ];
}

/**
 * Normalises an angle to (-π, π] so tweening between two azimuths always
 * takes the short way round — a jump from `right` to `front` must not spin
 * the figure most of the way about.
 */
export function shortestAngleTo(from: number, to: number): number {
  const delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;

  return delta <= -Math.PI ? delta + Math.PI * 2 : delta;
}

/** The preset a given azimuth is closest to, for highlighting the buttons. */
export function nearestView(azimuth: number): BodyView {
  let best: BodyView = "front";
  let bestDistance = Infinity;

  for (const view of BODY_VIEWS) {
    const distance = Math.abs(shortestAngleTo(azimuth, VIEW_AZIMUTHS[view]));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = view;
    }
  }

  return best;
}
