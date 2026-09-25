import type { injuryStatus } from '../database/schema';
import type { BodyRegion, InjurySeverityValue } from './injury-protocols';

export type InjuryStatusValue = (typeof injuryStatus.enumValues)[number];

/**
 * Statuses that mean the athlete is still unavailable.
 *
 * `season_ending` counts as open: the record stays live until the athlete
 * actually returns, which is what keeps their roster status accurate.
 */
export const OPEN_INJURY_STATUSES: readonly InjuryStatusValue[] = [
  'reported',
  'assessment',
  'rehab',
  'return_to_training',
  'season_ending',
] as const;

export function isOpenInjuryStatus(status: InjuryStatusValue): boolean {
  return OPEN_INJURY_STATUSES.includes(status);
}

/** Whole days between two ISO `yyyy-mm-dd` dates; negative if `to` precedes `from`. */
export function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);

  return Math.round((toMs - fromMs) / 86_400_000);
}

/** The minimum shape the derivations need from an injury row. */
export interface DerivableInjury {
  id: string;
  athleteId: string;
  bodyRegion: BodyRegion;
  severity: InjurySeverityValue;
  status: InjuryStatusValue;
  occurredOn: string;
  estimatedReturnTo: string;
  actualReturnOn: string | null;
}

/**
 * Days the athlete has been unavailable: to the actual return date once the
 * record is closed, and to `today` while it is still open.
 */
export function daysOut(injury: DerivableInjury, today: string): number {
  const end = injury.actualReturnOn ?? today;

  return Math.max(daysBetween(injury.occurredOn, end), 0);
}

/** How many days the actual return beat or missed the projected window's end. */
export function returnVarianceDays(injury: DerivableInjury): number | null {
  if (!injury.actualReturnOn) {
    return null;
  }

  return daysBetween(injury.estimatedReturnTo, injury.actualReturnOn);
}

/** A new injury to the same region within this many days of a previous return. */
export const RECURRENCE_WINDOW_DAYS = 90;

/**
 * Flags each injury that re-injures a region the athlete had recently
 * recovered from. The comparison is against the earlier injury's return date
 * where it has one, and its injury date otherwise — an athlete re-injuring a
 * region while the first record is still open is a recurrence either way.
 */
export function markRecurrences<T extends DerivableInjury>(
  injuries: readonly T[],
): (T & { isRecurrence: boolean })[] {
  return injuries.map((injury) => {
    const isRecurrence = injuries.some((other) => {
      if (
        other.id === injury.id ||
        other.athleteId !== injury.athleteId ||
        other.bodyRegion !== injury.bodyRegion
      ) {
        return false;
      }
      // Only a strictly earlier injury can make this one a recurrence;
      // ties would otherwise flag both rows of a same-day duplicate.
      if (other.occurredOn >= injury.occurredOn) {
        return false;
      }
      const reference = other.actualReturnOn ?? other.occurredOn;
      const gap = daysBetween(reference, injury.occurredOn);

      return gap >= 0 && gap <= RECURRENCE_WINDOW_DAYS;
    });

    return { ...injury, isRecurrence };
  });
}

/* ── Muscle recovery ──────────────────────────────────────────────────────
 * The recovery percentages on the Injury & Recovery page are derived from
 * injury records and rehab progress. They are NOT physiological or
 * training-load telemetry, and the UI labels them as such: a region with no
 * open injury reads 100% because nothing is known to be wrong with it, not
 * because it was measured.
 */

export type RecoveryGroup =
  'head_neck' | 'shoulders' | 'arms' | 'chest' | 'core' | 'back' | 'legs';

/**
 * Display order for the recovery strip. The approved design showed six
 * groups; head and neck are included as a seventh rather than silently
 * dropping concussions and neck injuries out of the panel.
 */
export const RECOVERY_GROUP_ORDER: readonly RecoveryGroup[] = [
  'chest',
  'shoulders',
  'arms',
  'back',
  'core',
  'legs',
  'head_neck',
] as const;

export const RECOVERY_GROUP_LABELS: Record<RecoveryGroup, string> = {
  head_neck: 'Head & neck',
  shoulders: 'Shoulders',
  arms: 'Arms',
  chest: 'Chest',
  core: 'Core',
  back: 'Back',
  legs: 'Legs',
};

const REGION_GROUPS: Record<BodyRegion, RecoveryGroup> = {
  head: 'head_neck',
  neck: 'head_neck',
  shoulder_left: 'shoulders',
  shoulder_right: 'shoulders',
  upper_arm_left: 'arms',
  upper_arm_right: 'arms',
  forearm_left: 'arms',
  forearm_right: 'arms',
  wrist_hand_left: 'arms',
  wrist_hand_right: 'arms',
  chest: 'chest',
  abdomen: 'core',
  groin: 'core',
  back_upper: 'back',
  back_lower: 'back',
  glute_left: 'legs',
  glute_right: 'legs',
  hamstring_left: 'legs',
  hamstring_right: 'legs',
  quad_left: 'legs',
  quad_right: 'legs',
  knee_left: 'legs',
  knee_right: 'legs',
  calf_left: 'legs',
  calf_right: 'legs',
  achilles_left: 'legs',
  achilles_right: 'legs',
  ankle_left: 'legs',
  ankle_right: 'legs',
  foot_left: 'legs',
  foot_right: 'legs',
};

export function recoveryGroupFor(region: BodyRegion): RecoveryGroup {
  return REGION_GROUPS[region];
}

/**
 * Where a region starts on the scale, by severity. A fresh severe injury has
 * to read visibly worse than a fresh minor one even though both are at day
 * zero of their own window.
 */
const SEVERITY_FLOOR: Record<InjurySeverityValue, number> = {
  minor: 55,
  moderate: 35,
  severe: 15,
};

/** Days after a return during which a region is still reconditioning. */
const POST_RETURN_RAMP_DAYS = 14;
const POST_RETURN_FLOOR = 80;

/**
 * Recovery percentage a single injury implies for its region.
 *
 * Open records interpolate from the severity floor at the injury date up to
 * 100% at the projected end of the window. Closed records ramp from 80% back
 * to 100% over a fortnight, so an athlete who played yesterday after six
 * weeks out does not read as fully reconditioned. Returns null once the
 * injury is far enough in the past to be irrelevant.
 */
export function recoveryPercentFor(
  injury: DerivableInjury,
  today: string,
): number | null {
  if (injury.actualReturnOn) {
    const sinceReturn = daysBetween(injury.actualReturnOn, today);
    if (sinceReturn < 0 || sinceReturn >= POST_RETURN_RAMP_DAYS) {
      return null;
    }

    return Math.round(
      POST_RETURN_FLOOR +
        (100 - POST_RETURN_FLOOR) * (sinceReturn / POST_RETURN_RAMP_DAYS),
    );
  }

  if (!isOpenInjuryStatus(injury.status)) {
    return null;
  }

  const floor = SEVERITY_FLOOR[injury.severity];
  const span = daysBetween(injury.occurredOn, injury.estimatedReturnTo);
  const elapsed = daysBetween(injury.occurredOn, today);
  // A same-day window (a zero-day estimate) would divide by zero; treat it
  // as fully elapsed, since the projected return has already arrived.
  const progress = span <= 0 ? 1 : Math.min(Math.max(elapsed / span, 0), 1);

  return Math.round(floor + (100 - floor) * progress);
}

export interface RecoveryReading {
  group: RecoveryGroup;
  label: string;
  percent: number;
  /** Regions in this group with an open or recently-closed injury. */
  affectedRegions: BodyRegion[];
}

/**
 * Builds the recovery strip for one athlete. A group takes the score of its
 * worst affected region — the panel answers "can this area be loaded", and
 * the weakest link decides that.
 */
export function recoveryReadings(
  injuries: readonly DerivableInjury[],
  today: string,
): RecoveryReading[] {
  const scores = new Map<
    RecoveryGroup,
    { percent: number; regions: Set<BodyRegion> }
  >();

  for (const injury of injuries) {
    const percent = recoveryPercentFor(injury, today);
    if (percent === null) {
      continue;
    }
    const group = recoveryGroupFor(injury.bodyRegion);
    const current = scores.get(group);
    if (!current) {
      scores.set(group, {
        percent,
        regions: new Set([injury.bodyRegion]),
      });
      continue;
    }
    current.regions.add(injury.bodyRegion);
    current.percent = Math.min(current.percent, percent);
  }

  return RECOVERY_GROUP_ORDER.map((group) => {
    const score = scores.get(group);

    return {
      group,
      label: RECOVERY_GROUP_LABELS[group],
      percent: score?.percent ?? 100,
      affectedRegions: score ? [...score.regions].sort() : [],
    };
  });
}
