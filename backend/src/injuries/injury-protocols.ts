import type {
  injuryBodyRegion,
  injurySeverity,
  injuryType,
} from '../database/schema';

export type BodyRegion = (typeof injuryBodyRegion.enumValues)[number];
export type InjuryTypeValue = (typeof injuryType.enumValues)[number];
export type InjurySeverityValue = (typeof injurySeverity.enumValues)[number];

/**
 * Expected return-time guidance for the Injury & Recovery slice.
 *
 * These are conventional recovery ranges, not medical advice, and not a
 * diagnosis: they exist so a coach logging an injury pitch-side gets an
 * immediate, defensible planning window instead of a blank field. Every
 * estimate a record is created with is persisted on the row and can be
 * overridden by a coach, so revising a range here never rewrites the
 * expectation an athlete is already recovering against.
 *
 * Ranges should be reviewed by the club's physio before a season is planned
 * around them. Revising one is a single edit to `REGION_PROTOCOLS` or
 * `TYPE_PROTOCOLS` below.
 */

/** Days out, as an inclusive range. */
export interface ReturnWindow {
  minDays: number;
  maxDays: number;
}

export type SeverityWindows = Record<InjurySeverityValue, ReturnWindow>;

/**
 * A rehabilitation phase, snapshotted onto the injury row at creation.
 *
 * Boundaries are day offsets from the injury date, resolved from the
 * fractional template below against the estimate's upper bound — the
 * conservative end, so a phase plan never promises an earlier milestone
 * than the window it was built from.
 */
export interface RehabPhase {
  name: string;
  fromDay: number;
  toDay: number;
  focus: string;
  /** Always null at creation; the deferred rehab-plan UI ticks these off. */
  completedOn: string | null;
}

/**
 * Coarse region key used for protocol lookup.
 *
 * Sided regions collapse to one key — a left and a right hamstring strain
 * recover on the same timeline — and the fine-grained enum is kept on the
 * record itself for the body model and recurrence checks.
 */
export type ProtocolRegion =
  | 'head'
  | 'neck'
  | 'shoulder'
  | 'upper_arm'
  | 'forearm'
  | 'wrist_hand'
  | 'chest'
  | 'abdomen'
  | 'groin'
  | 'back_upper'
  | 'back_lower'
  | 'glute'
  | 'hamstring'
  | 'quad'
  | 'knee'
  | 'calf'
  | 'achilles'
  | 'ankle'
  | 'foot';

const SIDED_SUFFIX = /_(left|right)$/;

/** Collapses `hamstring_left` to `hamstring`; unsided regions pass through. */
export function protocolRegionFor(region: BodyRegion): ProtocolRegion {
  return region.replace(SIDED_SUFFIX, '') as ProtocolRegion;
}

/**
 * Region-and-type specific windows. Anything absent here falls back to
 * `TYPE_PROTOCOLS`, so the table only has to carry the combinations where
 * the region materially changes the timeline.
 */
const REGION_PROTOCOLS: Partial<
  Record<ProtocolRegion, Partial<Record<InjuryTypeValue, SeverityWindows>>>
> = {
  hamstring: {
    strain: {
      minor: { minDays: 7, maxDays: 21 },
      moderate: { minDays: 21, maxDays: 42 },
      severe: { minDays: 84, maxDays: 168 },
    },
    tear: {
      minor: { minDays: 21, maxDays: 42 },
      moderate: { minDays: 56, maxDays: 98 },
      severe: { minDays: 120, maxDays: 210 },
    },
  },
  quad: {
    strain: {
      minor: { minDays: 7, maxDays: 14 },
      moderate: { minDays: 21, maxDays: 42 },
      severe: { minDays: 60, maxDays: 100 },
    },
  },
  calf: {
    strain: {
      minor: { minDays: 7, maxDays: 14 },
      moderate: { minDays: 21, maxDays: 35 },
      severe: { minDays: 60, maxDays: 120 },
    },
  },
  groin: {
    strain: {
      minor: { minDays: 7, maxDays: 14 },
      moderate: { minDays: 21, maxDays: 42 },
      severe: { minDays: 70, maxDays: 120 },
    },
  },
  glute: {
    strain: {
      minor: { minDays: 7, maxDays: 14 },
      moderate: { minDays: 18, maxDays: 35 },
      severe: { minDays: 56, maxDays: 98 },
    },
  },
  achilles: {
    tendinopathy: {
      minor: { minDays: 21, maxDays: 42 },
      moderate: { minDays: 42, maxDays: 84 },
      severe: { minDays: 90, maxDays: 180 },
    },
    tear: {
      minor: { minDays: 120, maxDays: 180 },
      moderate: { minDays: 180, maxDays: 240 },
      severe: { minDays: 240, maxDays: 330 },
    },
  },
  ankle: {
    sprain: {
      minor: { minDays: 7, maxDays: 14 },
      moderate: { minDays: 21, maxDays: 42 },
      severe: { minDays: 42, maxDays: 84 },
    },
    fracture: {
      minor: { minDays: 42, maxDays: 70 },
      moderate: { minDays: 70, maxDays: 120 },
      severe: { minDays: 120, maxDays: 210 },
    },
  },
  knee: {
    sprain: {
      minor: { minDays: 10, maxDays: 21 },
      moderate: { minDays: 28, maxDays: 56 },
      severe: { minDays: 70, maxDays: 140 },
    },
    // A full cruciate or meniscal tear is a season-scale absence; the
    // `season_ending` status exists for the severe case.
    tear: {
      minor: { minDays: 42, maxDays: 84 },
      moderate: { minDays: 120, maxDays: 180 },
      severe: { minDays: 210, maxDays: 300 },
    },
  },
  shoulder: {
    dislocation: {
      minor: { minDays: 21, maxDays: 42 },
      moderate: { minDays: 42, maxDays: 84 },
      severe: { minDays: 90, maxDays: 180 },
    },
    sprain: {
      minor: { minDays: 7, maxDays: 14 },
      moderate: { minDays: 21, maxDays: 42 },
      severe: { minDays: 42, maxDays: 90 },
    },
  },
  back_lower: {
    strain: {
      minor: { minDays: 5, maxDays: 14 },
      moderate: { minDays: 14, maxDays: 35 },
      severe: { minDays: 42, maxDays: 112 },
    },
  },
  head: {
    // Graduated return-to-play protocols gate the minimum at roughly a week
    // from the resolution of symptoms, which is why even "minor" is not a
    // next-match return.
    concussion: {
      minor: { minDays: 6, maxDays: 14 },
      moderate: { minDays: 14, maxDays: 28 },
      severe: { minDays: 28, maxDays: 90 },
    },
  },
};

/**
 * Type-only fallback, applied when the region/type pair is not listed above.
 * Every `injuryType` enum value must appear here so no combination a coach
 * can select is left without an estimate.
 */
const TYPE_PROTOCOLS: Record<InjuryTypeValue, SeverityWindows> = {
  strain: {
    minor: { minDays: 7, maxDays: 14 },
    moderate: { minDays: 18, maxDays: 35 },
    severe: { minDays: 56, maxDays: 112 },
  },
  sprain: {
    minor: { minDays: 7, maxDays: 14 },
    moderate: { minDays: 21, maxDays: 42 },
    severe: { minDays: 42, maxDays: 90 },
  },
  tear: {
    minor: { minDays: 28, maxDays: 56 },
    moderate: { minDays: 70, maxDays: 126 },
    severe: { minDays: 168, maxDays: 270 },
  },
  fracture: {
    minor: { minDays: 28, maxDays: 49 },
    moderate: { minDays: 49, maxDays: 91 },
    severe: { minDays: 91, maxDays: 180 },
  },
  contusion: {
    minor: { minDays: 3, maxDays: 7 },
    moderate: { minDays: 7, maxDays: 14 },
    severe: { minDays: 14, maxDays: 28 },
  },
  dislocation: {
    minor: { minDays: 21, maxDays: 42 },
    moderate: { minDays: 42, maxDays: 84 },
    severe: { minDays: 90, maxDays: 180 },
  },
  tendinopathy: {
    minor: { minDays: 14, maxDays: 28 },
    moderate: { minDays: 35, maxDays: 70 },
    severe: { minDays: 84, maxDays: 168 },
  },
  concussion: {
    minor: { minDays: 6, maxDays: 14 },
    moderate: { minDays: 14, maxDays: 28 },
    severe: { minDays: 28, maxDays: 90 },
  },
  laceration: {
    minor: { minDays: 2, maxDays: 7 },
    moderate: { minDays: 7, maxDays: 14 },
    severe: { minDays: 14, maxDays: 35 },
  },
  illness: {
    minor: { minDays: 2, maxDays: 7 },
    moderate: { minDays: 7, maxDays: 21 },
    severe: { minDays: 21, maxDays: 60 },
  },
  other: {
    minor: { minDays: 5, maxDays: 14 },
    moderate: { minDays: 14, maxDays: 35 },
    severe: { minDays: 42, maxDays: 90 },
  },
};

/** A phase boundary as a fraction of the estimate's upper bound. */
interface PhaseTemplate {
  name: string;
  /** Inclusive start, as a fraction of max days. */
  from: number;
  /** Exclusive end, as a fraction of max days. */
  to: number;
  focus: string;
}

const SOFT_TISSUE_PHASES: PhaseTemplate[] = [
  {
    name: 'Acute protection',
    from: 0,
    to: 0.15,
    focus: 'Pain management, offloading and swelling control',
  },
  {
    name: 'Early loading',
    from: 0.15,
    to: 0.45,
    focus: 'Pain-free range of motion and isometric loading',
  },
  {
    name: 'Strength & mobility',
    from: 0.45,
    to: 0.72,
    focus: 'Progressive resistance and eccentric strength work',
  },
  {
    name: 'Return to running',
    from: 0.72,
    to: 0.9,
    focus: 'Linear running, then change of direction at increasing speed',
  },
  {
    name: 'Return to play',
    from: 0.9,
    to: 1,
    focus: 'Full contact training and match-intensity conditioning',
  },
];

const BONE_PHASES: PhaseTemplate[] = [
  {
    name: 'Immobilisation',
    from: 0,
    to: 0.35,
    focus: 'Protected healing and maintenance of surrounding conditioning',
  },
  {
    name: 'Union & mobility',
    from: 0.35,
    to: 0.6,
    focus: 'Restoring joint range once healing is confirmed',
  },
  {
    name: 'Loading & strength',
    from: 0.6,
    to: 0.85,
    focus: 'Graded weight-bearing and strength reconditioning',
  },
  {
    name: 'Return to play',
    from: 0.85,
    to: 1,
    focus: 'Sport-specific loading and contact tolerance',
  },
];

const CONCUSSION_PHASES: PhaseTemplate[] = [
  {
    name: 'Relative rest',
    from: 0,
    to: 0.25,
    focus: 'Symptom-limited activity for the first 24-48 hours',
  },
  {
    name: 'Light aerobic',
    from: 0.25,
    to: 0.45,
    focus: 'Walking or stationary cycling below symptom threshold',
  },
  {
    name: 'Sport-specific',
    from: 0.45,
    to: 0.65,
    focus: 'Running drills with no head-impact activity',
  },
  {
    name: 'Non-contact training',
    from: 0.65,
    to: 0.85,
    focus: 'Full training drills and progressive resistance training',
  },
  {
    name: 'Full contact',
    from: 0.85,
    to: 1,
    focus: 'Medical clearance, then normal training and match play',
  },
];

const GENERAL_PHASES: PhaseTemplate[] = [
  {
    name: 'Assessment & rest',
    from: 0,
    to: 0.3,
    focus: 'Diagnosis confirmation and symptom management',
  },
  {
    name: 'Rehabilitation',
    from: 0.3,
    to: 0.75,
    focus: 'Progressive loading toward full training capacity',
  },
  {
    name: 'Return to play',
    from: 0.75,
    to: 1,
    focus: 'Full training participation and match reintegration',
  },
];

const PHASE_TEMPLATES: Record<InjuryTypeValue, PhaseTemplate[]> = {
  strain: SOFT_TISSUE_PHASES,
  sprain: SOFT_TISSUE_PHASES,
  tear: SOFT_TISSUE_PHASES,
  tendinopathy: SOFT_TISSUE_PHASES,
  contusion: SOFT_TISSUE_PHASES,
  fracture: BONE_PHASES,
  dislocation: BONE_PHASES,
  concussion: CONCUSSION_PHASES,
  laceration: GENERAL_PHASES,
  illness: GENERAL_PHASES,
  other: GENERAL_PHASES,
};

/**
 * Resolves the guidance window for a specific injury, preferring the
 * region-specific table and falling back to the type-only table.
 */
export function returnWindowFor(
  region: BodyRegion,
  type: InjuryTypeValue,
  severity: InjurySeverityValue,
): ReturnWindow {
  const regionWindows = REGION_PROTOCOLS[protocolRegionFor(region)]?.[type];

  return regionWindows?.[severity] ?? TYPE_PROTOCOLS[type][severity];
}

/**
 * Thins a phase template down to what a short window can actually hold.
 *
 * A five-stage plan cannot be laid over a three-day contusion without
 * phases that start after they end, and a plan of empty rows is no plan at
 * all. The first and last phases always survive — the two a coach reads —
 * and the intermediate ones are dropped evenly.
 */
function templatesForWindow(
  templates: PhaseTemplate[],
  totalDays: number,
): PhaseTemplate[] {
  const capacity = Math.max(1, Math.min(templates.length, totalDays));
  if (capacity === templates.length) {
    return templates;
  }
  if (capacity === 1) {
    return [templates[templates.length - 1]];
  }

  const step = (templates.length - 1) / (capacity - 1);

  return Array.from(
    { length: capacity },
    (_, index) => templates[Math.round(index * step)],
  );
}

/**
 * Builds the rehab phase plan for an injury.
 *
 * Phases are resolved against the window's upper bound — the conservative
 * end — and are contiguous, non-inverting and non-empty: each one leaves a
 * day for every phase still to come, so a short window thins the plan
 * rather than corrupting it.
 */
export function rehabPhasesFor(
  type: InjuryTypeValue,
  window: ReturnWindow,
): RehabPhase[] {
  const total = window.maxDays;
  const templates = templatesForWindow(PHASE_TEMPLATES[type], total);
  let previousEnd = 0;

  return templates.map((template, index) => {
    const fromDay = index === 0 ? 0 : previousEnd;
    const phasesAfterThis = templates.length - index - 1;
    // Reserve a day for each remaining phase so none of them can invert.
    const latestEnd = total - phasesAfterThis;
    const scaledEnd = Math.round(template.to * total);
    const toDay =
      phasesAfterThis === 0
        ? total
        : Math.min(Math.max(scaledEnd, fromDay + 1), latestEnd);
    previousEnd = toDay;

    return {
      name: template.name,
      fromDay,
      toDay,
      focus: template.focus,
      completedOn: null,
    };
  });
}

/** Adds whole days to an ISO `yyyy-mm-dd` date, returning the same format. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

export interface ResolvedProtocol extends ReturnWindow {
  /** Projected earliest return date. */
  estimatedReturnFrom: string;
  /** Projected latest return date. */
  estimatedReturnTo: string;
  phases: RehabPhase[];
}

/**
 * Full protocol resolution for a new record: the window, the calendar dates
 * it projects onto, and the phase plan to snapshot.
 */
export function resolveProtocol(
  region: BodyRegion,
  type: InjuryTypeValue,
  severity: InjurySeverityValue,
  occurredOn: string,
): ResolvedProtocol {
  const window = returnWindowFor(region, type, severity);

  return {
    ...window,
    estimatedReturnFrom: addDays(occurredOn, window.minDays),
    estimatedReturnTo: addDays(occurredOn, window.maxDays),
    phases: rehabPhasesFor(type, window),
  };
}
