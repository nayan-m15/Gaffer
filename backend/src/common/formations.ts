export const FORMATION_IDS = [
  '5v5-1-2-1',
  '5v5-2-1-1',
  '5v5-1-1-2',
  '7v7-2-3-1',
  '7v7-3-2-1',
  '7v7-2-2-2',
  '4-3-3',
  '4-4-2',
  '4-2-3-1',
  '4-1-4-1',
  '3-5-2',
  '3-4-3',
  '5-3-2',
  '5-4-1',
] as const;

export type FormationId = (typeof FORMATION_IDS)[number];
export type FormationPlayerCount = 5 | 7 | 11;

export const DEFAULT_FORMATION_ID: FormationId = '4-3-3';

export const FORMATION_PLAYER_COUNTS: Record<
  FormationId,
  FormationPlayerCount
> = {
  '5v5-1-2-1': 5,
  '5v5-2-1-1': 5,
  '5v5-1-1-2': 5,
  '7v7-2-3-1': 7,
  '7v7-3-2-1': 7,
  '7v7-2-2-2': 7,
  '4-3-3': 11,
  '4-4-2': 11,
  '4-2-3-1': 11,
  '4-1-4-1': 11,
  '3-5-2': 11,
  '3-4-3': 11,
  '5-3-2': 11,
  '5-4-1': 11,
};

export function getFormationPlayerCount(
  formationId: string | null | undefined,
): FormationPlayerCount | null {
  if (!formationId || !FORMATION_IDS.includes(formationId as FormationId)) {
    return null;
  }
  return FORMATION_PLAYER_COUNTS[formationId as FormationId];
}
