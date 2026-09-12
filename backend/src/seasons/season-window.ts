/**
 * Season bounds are calendar dates (`date` columns), but `events.scheduledAt`
 * is a `timestamptz`. These helpers turn one into the other.
 *
 * Windows are anchored in **UTC**: a season ending 2026-05-31 covers up to
 * 2026-05-31T23:59:59.999Z. A late kick-off on the final day in a timezone
 * ahead of UTC can therefore fall outside its own season. That is an accepted
 * simplification — the alternative is storing a timezone per team.
 */

export interface SeasonWindow {
  start: Date;
  end: Date;
}

/**
 * Inclusive `[start, end]` instant range for a season.
 *
 * @param startDate ISO calendar date, e.g. `'2025-08-01'`
 * @param endDate   ISO calendar date, e.g. `'2026-05-31'`
 */
export function seasonWindow(startDate: string, endDate: string): SeasonWindow {
  return {
    start: new Date(`${startDate}T00:00:00.000Z`),
    end: new Date(`${endDate}T23:59:59.999Z`),
  };
}

/** Whether an ISO timestamp falls inside the window, both bounds inclusive. */
export function isWithinWindow(iso: string, window: SeasonWindow): boolean {
  const at = new Date(iso).getTime();
  return at >= window.start.getTime() && at <= window.end.getTime();
}
