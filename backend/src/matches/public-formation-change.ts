import type { MatchTacticalChangeDto } from './matches.schemas';

/** Public pitch geometry only. Never copy the private payload wholesale. */
export function publicFormationChange(payload: unknown) {
  const change = (payload as { tacticalChange?: MatchTacticalChangeDto } | null)
    ?.tacticalChange;
  if (!change || (!change.formationId && change.customPositions === undefined))
    return null;
  return {
    ...(change.formationId ? { formationId: change.formationId } : {}),
    ...(change.customPositions !== undefined
      ? {
          customPositions:
            change.customPositions?.map(({ id, label, role, x, y }) => ({
              id,
              label,
              role,
              x,
              y,
            })) ?? null,
        }
      : {}),
  };
}
