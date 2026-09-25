import type { BodyRegion, InjurySeverity, InjuryType } from "./types";

/**
 * Body-region vocabulary shared by the 3D model, the live-logger wizard and
 * the injury record.
 *
 * Kept free of React so it can be unit-tested directly and imported by the
 * three.js scene without pulling the component tree in.
 */

export const BODY_REGION_LABELS: Record<BodyRegion, string> = {
  head: "Head",
  neck: "Neck",
  shoulder_left: "Left shoulder",
  shoulder_right: "Right shoulder",
  upper_arm_left: "Left upper arm",
  upper_arm_right: "Right upper arm",
  forearm_left: "Left forearm",
  forearm_right: "Right forearm",
  wrist_hand_left: "Left wrist / hand",
  wrist_hand_right: "Right wrist / hand",
  chest: "Chest",
  abdomen: "Abdomen",
  groin: "Groin",
  back_upper: "Upper back",
  back_lower: "Lower back",
  glute_left: "Left glute",
  glute_right: "Right glute",
  hamstring_left: "Left hamstring",
  hamstring_right: "Right hamstring",
  quad_left: "Left quad",
  quad_right: "Right quad",
  knee_left: "Left knee",
  knee_right: "Right knee",
  calf_left: "Left calf",
  calf_right: "Right calf",
  achilles_left: "Left achilles",
  achilles_right: "Right achilles",
  ankle_left: "Left ankle",
  ankle_right: "Right ankle",
  foot_left: "Left foot",
  foot_right: "Right foot",
};

export const BODY_REGIONS = Object.keys(BODY_REGION_LABELS) as BodyRegion[];

export function bodyRegionLabel(region: BodyRegion): string {
  return BODY_REGION_LABELS[region];
}

/**
 * The regions a coach reaches for most, in the order the live-logger wizard
 * offers them. Pitch-side speed matters more than anatomical completeness
 * here — the full list is one tap further on.
 */
export const COMMON_BODY_REGIONS: readonly BodyRegion[] = [
  "hamstring_left",
  "hamstring_right",
  "quad_left",
  "quad_right",
  "calf_left",
  "calf_right",
  "knee_left",
  "knee_right",
  "ankle_left",
  "ankle_right",
  "groin",
  "head",
] as const;

export const INJURY_TYPE_LABELS: Record<InjuryType, string> = {
  strain: "Strain",
  sprain: "Sprain",
  tear: "Tear",
  fracture: "Fracture",
  contusion: "Contusion / knock",
  dislocation: "Dislocation",
  tendinopathy: "Tendinopathy",
  concussion: "Concussion",
  laceration: "Laceration",
  illness: "Illness",
  other: "Other",
};

export const INJURY_TYPES = Object.keys(INJURY_TYPE_LABELS) as InjuryType[];

export const SEVERITY_LABELS: Record<InjurySeverity, string> = {
  minor: "Minor",
  moderate: "Moderate",
  severe: "Severe",
};

/** Grade language a physio would recognise, shown next to the plain label. */
export const SEVERITY_GRADES: Record<InjurySeverity, string> = {
  minor: "Grade 1",
  moderate: "Grade 2",
  severe: "Grade 3",
};

export const SEVERITIES: readonly InjurySeverity[] = [
  "minor",
  "moderate",
  "severe",
] as const;

/**
 * The injury types worth offering first for a given region.
 *
 * A head injury is almost never a "strain", and a hamstring is almost never
 * a "concussion"; leading with the plausible ones keeps the wizard to three
 * taps without hiding anything (the full list stays available).
 */
const REGION_TYPE_HINTS: Partial<Record<BodyRegion, readonly InjuryType[]>> = {
  head: ["concussion", "laceration", "contusion", "fracture"],
  neck: ["strain", "sprain", "contusion"],
  hamstring_left: ["strain", "tear", "contusion"],
  hamstring_right: ["strain", "tear", "contusion"],
  quad_left: ["strain", "contusion", "tear"],
  quad_right: ["strain", "contusion", "tear"],
  calf_left: ["strain", "contusion", "tear"],
  calf_right: ["strain", "contusion", "tear"],
  groin: ["strain", "tear", "tendinopathy"],
  knee_left: ["sprain", "tear", "contusion"],
  knee_right: ["sprain", "tear", "contusion"],
  ankle_left: ["sprain", "fracture", "contusion"],
  ankle_right: ["sprain", "fracture", "contusion"],
  achilles_left: ["tendinopathy", "tear", "strain"],
  achilles_right: ["tendinopathy", "tear", "strain"],
  shoulder_left: ["dislocation", "sprain", "contusion"],
  shoulder_right: ["dislocation", "sprain", "contusion"],
  back_lower: ["strain", "contusion"],
  back_upper: ["strain", "contusion"],
  wrist_hand_left: ["fracture", "sprain", "contusion"],
  wrist_hand_right: ["fracture", "sprain", "contusion"],
  foot_left: ["fracture", "contusion", "sprain"],
  foot_right: ["fracture", "contusion", "sprain"],
};

/**
 * Injury types for a region, likeliest first, with every remaining type
 * appended so nothing is unreachable.
 */
export function injuryTypesForRegion(region: BodyRegion): InjuryType[] {
  const hinted = REGION_TYPE_HINTS[region] ?? [];

  return [
    ...hinted,
    ...INJURY_TYPES.filter((type) => !hinted.includes(type)),
  ];
}

/** Strips the side from a region id, for labels that already state the side. */
export function bodyRegionSide(
  region: BodyRegion,
): "left" | "right" | "central" {
  if (region.endsWith("_left")) {
    return "left";
  }
  if (region.endsWith("_right")) {
    return "right";
  }

  return "central";
}

/**
 * One-line summary of a diagnosis: "Right hamstring strain".
 *
 * Lives here rather than in `injury-model.ts` because it is a labelling
 * concern built from the tables above — and it keeps `injury-model.ts` free
 * of value imports, which is what lets both modules be exercised directly
 * by the `.node-test.mjs` harness.
 */
export function injuryTitle(injury: {
  bodyRegion: BodyRegion;
  injuryType: InjuryType;
}): string {
  return `${BODY_REGION_LABELS[injury.bodyRegion]} ${injury.injuryType.replace(
    /_/g,
    " ",
  )}`;
}
