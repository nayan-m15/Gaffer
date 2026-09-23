import type {
  InjuryListItem,
  InjuryRecord,
  InjurySeverity,
  InjuryStatus,
  InjuryTimelineKind,
  RehabPhase,
} from "./types";

/**
 * Pure display helpers for the Injury & Recovery page.
 *
 * Nothing here touches React or the network, so the labels and the
 * arithmetic a coach reads off the page can be tested directly.
 */

export const INJURY_STATUS_LABELS: Record<InjuryStatus, string> = {
  reported: "Reported",
  assessment: "Under assessment",
  rehab: "In rehabilitation",
  return_to_training: "Returning to training",
  returned: "Returned to play",
  season_ending: "Out for the season",
};

export const TIMELINE_KIND_LABELS: Record<InjuryTimelineKind, string> = {
  sustained: "Injury sustained",
  assessment: "Medical assessment",
  rehab_started: "Rehab programme started",
  reassessment: "Re-assessment",
  setback: "Setback",
  return_to_training: "Returned to training",
  returned: "Returned to play",
  note: "Note",
  estimated_return: "Estimated return",
};

/** Statuses a coach can move a record to, in the order recovery runs. */
export const ASSIGNABLE_STATUSES: readonly InjuryStatus[] = [
  "reported",
  "assessment",
  "rehab",
  "return_to_training",
  "season_ending",
] as const;

/**
 * Turns a day window into the phrase a coach actually uses.
 *
 * Short absences read in days, longer ones in weeks, and a window whose
 * bounds round to the same number of weeks collapses to one figure rather
 * than the nonsense of "3-3 weeks".
 */
export function returnWindowLabel(minDays: number, maxDays: number): string {
  if (maxDays < 14) {
    return minDays === maxDays
      ? `${maxDays} day${maxDays === 1 ? "" : "s"}`
      : `${minDays}–${maxDays} days`;
  }

  const minWeeks = Math.round(minDays / 7);
  const maxWeeks = Math.round(maxDays / 7);

  if (minWeeks === maxWeeks) {
    return `${maxWeeks} week${maxWeeks === 1 ? "" : "s"}`;
  }
  if (maxWeeks >= 40) {
    return "A season or more";
  }

  return `${minWeeks}–${maxWeeks} weeks`;
}

/**
 * Formats an ISO `yyyy-mm-dd` date as "12 Sep 2026".
 *
 * Parsed and formatted in UTC to match the backend's `date` columns: a
 * local-time parse would render the previous day for anyone west of
 * Greenwich.
 */
export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Whole days between two ISO `yyyy-mm-dd` dates. */
export function daysBetween(from: string, to: string): number {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);

  return Math.round((toMs - fromMs) / 86_400_000);
}

/**
 * How far through the projected window an open injury is, 0-1.
 *
 * Used for the progress bar on the detail card. A closed record always reads
 * as complete, and a same-day window cannot divide by zero.
 */
export function recoveryProgress(injury: InjuryRecord, today: string): number {
  if (injury.actualReturnOn) {
    return 1;
  }
  const span = daysBetween(injury.occurredOn, injury.estimatedReturnTo);
  if (span <= 0) {
    return 1;
  }
  const elapsed = daysBetween(injury.occurredOn, today);

  return Math.min(Math.max(elapsed / span, 0), 1);
}

/**
 * Days remaining against the projection: positive while the window is still
 * running, negative once it has been overshot, and null once the athlete is
 * back (the record then answers with `daysOut` instead).
 */
export function daysUntilProjectedReturn(
  injury: InjuryRecord,
  today: string,
): number | null {
  if (injury.actualReturnOn) {
    return null;
  }

  return daysBetween(today, injury.estimatedReturnTo);
}

export function athleteName(injury: {
  athleteFirstName: string;
  athleteLastName: string;
}): string {
  return `${injury.athleteFirstName} ${injury.athleteLastName}`;
}

/** Tailwind classes for a severity pill, matching the approved design. */
export const SEVERITY_TONES: Record<InjurySeverity, string> = {
  minor: "border-amber-400/30 bg-amber-400/15 text-amber-300",
  moderate: "border-red-500/30 bg-red-500/20 text-red-300",
  severe: "border-red-600/40 bg-red-600/25 text-red-200",
};

/**
 * Colour band for a recovery percentage. Deliberately three bands rather
 * than a gradient so the strip can be read at a glance.
 */
export function recoveryTone(percent: number): {
  className: string;
  label: string;
} {
  if (percent >= 90) {
    return {
      className: "border-emerald-500/30 bg-emerald-500/20 text-emerald-300",
      label: "Ready",
    };
  }
  if (percent >= 70) {
    return {
      className: "border-amber-400/30 bg-amber-400/15 text-amber-300",
      label: "Manage load",
    };
  }

  return {
    className: "border-red-500/30 bg-red-500/20 text-red-300",
    label: "Restricted",
  };
}

/**
 * Formats the variance between the projected and actual return for the
 * history table. Null variance means the record is still open.
 */
export function varianceLabel(varianceDays: number | null): string {
  if (varianceDays === null) {
    return "—";
  }
  if (varianceDays === 0) {
    return "On projection";
  }
  const magnitude = Math.abs(varianceDays);
  const unit = magnitude === 1 ? "day" : "days";

  return varianceDays > 0
    ? `${magnitude} ${unit} late`
    : `${magnitude} ${unit} early`;
}

/** Which rehab phase a given day falls in, or null outside the plan. */
export function activePhase(
  phases: readonly RehabPhase[] | null,
  dayOffset: number,
): RehabPhase | null {
  if (!phases || phases.length === 0) {
    return null;
  }
  const match = phases.find(
    (phase) => dayOffset >= phase.fromDay && dayOffset < phase.toDay,
  );
  if (match) {
    return match;
  }

  // Past the end of the plan the final phase is the honest answer; before
  // the start, the first.
  return dayOffset < phases[0].fromDay ? phases[0] : phases[phases.length - 1];
}

/**
 * Sorts the record for the Overview tab's athlete picker: open injuries
 * first, worst severity next, then most recent.
 */
const SEVERITY_WEIGHT: Record<InjurySeverity, number> = {
  severe: 0,
  moderate: 1,
  minor: 2,
};

export function sortForAttention<T extends InjuryListItem>(
  injuries: readonly T[],
): T[] {
  return [...injuries].sort((a, b) => {
    if (a.isOpen !== b.isOpen) {
      return a.isOpen ? -1 : 1;
    }
    const severity =
      SEVERITY_WEIGHT[a.severity] - SEVERITY_WEIGHT[b.severity];
    if (severity !== 0) {
      return severity;
    }

    return b.occurredOn.localeCompare(a.occurredOn);
  });
}

/** Headline counts for the page's summary row. */
export function injurySummary(
  injuries: readonly InjuryListItem[],
  today: string,
): {
  openCount: number;
  severeOpenCount: number;
  recurrenceCount: number;
  daysLostThisSeason: number;
  dueBackWithinAWeek: number;
} {
  const open = injuries.filter((injury) => injury.isOpen);

  return {
    openCount: open.length,
    severeOpenCount: open.filter((injury) => injury.severity === "severe")
      .length,
    recurrenceCount: injuries.filter((injury) => injury.isRecurrence).length,
    daysLostThisSeason: injuries.reduce(
      (total, injury) => total + injury.daysOut,
      0,
    ),
    dueBackWithinAWeek: open.filter((injury) => {
      const remaining = daysUntilProjectedReturn(injury, today);

      return remaining !== null && remaining >= 0 && remaining <= 7;
    }).length,
  };
}

/** Today in UTC as `yyyy-mm-dd`, matching the backend's date columns. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
