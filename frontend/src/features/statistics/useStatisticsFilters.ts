import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Statistics page filter state, held in the URL rather than component state so
 * a filtered view can be linked, bookmarked and survives navigation.
 *
 * Scoped deliberately to this feature: nothing else in the app uses search
 * params yet, so the convention proves itself here before spreading.
 */
export interface StatisticsFilterState {
  seasonId?: string;
  competitionId?: string;
  athleteId?: string;
  /** Athletes picked for the side-by-side comparison (max 3). */
  compareIds: string[];
}

const SEASON = "season";
const COMPETITION = "competition";
const ATHLETE = "athlete";
const COMPARE = "compare";

export const MAX_COMPARE_ATHLETES = 3;

export function useStatisticsFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<StatisticsFilterState>(() => {
    const compare = searchParams.get(COMPARE);
    return {
      seasonId: searchParams.get(SEASON) ?? undefined,
      competitionId: searchParams.get(COMPETITION) ?? undefined,
      athleteId: searchParams.get(ATHLETE) ?? undefined,
      compareIds: compare
        ? compare.split(",").filter(Boolean).slice(0, MAX_COMPARE_ATHLETES)
        : [],
    };
  }, [searchParams]);

  /** Writes one param, clearing it when the value is empty. */
  const setParam = useCallback(
    (key: string, value: string | undefined, replace = false) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  const setSeasonId = useCallback(
    (id: string | undefined, replace = false) => setParam(SEASON, id, replace),
    [setParam],
  );

  const setCompetitionId = useCallback(
    (id: string | undefined) => setParam(COMPETITION, id),
    [setParam],
  );

  const setAthleteId = useCallback(
    (id: string | undefined) => setParam(ATHLETE, id),
    [setParam],
  );

  /** Adds or removes an athlete from the comparison, capped at three. */
  const toggleCompareId = useCallback(
    (id: string) => {
      setParam(
        COMPARE,
        (() => {
          const current = filters.compareIds;
          if (current.includes(id)) {
            const next = current.filter((existing) => existing !== id);
            return next.length > 0 ? next.join(",") : undefined;
          }
          if (current.length >= MAX_COMPARE_ATHLETES) return current.join(",");
          return [...current, id].join(",");
        })(),
      );
    },
    [filters.compareIds, setParam],
  );

  const clearCompare = useCallback(
    () => setParam(COMPARE, undefined),
    [setParam],
  );

  return {
    filters,
    setSeasonId,
    setCompetitionId,
    setAthleteId,
    toggleCompareId,
    clearCompare,
  };
}
