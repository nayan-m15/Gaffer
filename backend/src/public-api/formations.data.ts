/**
 * Static reference catalog of football formations exposed through the
 * public API (`GET /v1/formations`).
 *
 * This is intentionally separate from the tactical/squad data behind
 * `GamePlansService` — it is generic coaching reference content with no
 * team, athlete, or account association, so it is safe to publish without
 * authentication. IDs mirror `FORMATION_IDS` in
 * `../game-plans/game-plans.schemas.ts`; keep the two in sync if a
 * formation is ever added or renamed.
 */
export interface PublicFormation {
  id: string;
  name: string;
  shape: string;
  description: string;
}

export const PUBLIC_FORMATIONS: readonly PublicFormation[] = [
  {
    id: '4-3-3',
    name: '4-3-3',
    shape: '4-3-3',
    description:
      'A balanced formation with width in attack and a three-player midfield that can dominate possession.',
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    shape: '4-4-2',
    description:
      'A classic, compact shape with two flat banks of four and two strikers who support each other up front.',
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    shape: '4-2-3-1',
    description:
      'Two holding midfielders shield the back four while three attacking midfielders create chances for a lone striker.',
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1',
    shape: '4-1-4-1',
    description:
      'A disciplined shape with a single defensive midfielder screening the defence and a lone striker up top.',
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    shape: '3-5-2',
    description:
      'Three centre-backs and attacking wing-backs provide width, supporting a five-player midfield and two strikers.',
  },
  {
    id: '3-4-3',
    name: '3-4-3',
    shape: '3-4-3',
    description:
      'An attacking three-at-the-back system with wide midfielders stretching play in front of a front three.',
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    shape: '5-3-2',
    description:
      'A defensively solid setup with five defenders and a compact midfield three supporting two strikers.',
  },
  {
    id: '5-4-1',
    name: '5-4-1',
    shape: '5-4-1',
    description:
      'A highly defensive formation with five defenders and four midfielders protecting a lone striker on the counter.',
  },
] as const;
