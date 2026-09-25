import type { FormationPlayerCount } from '../common/formations';

/**
 * Static reference catalog of football formations exposed through the
 * public API (`GET /v1/formations`).
 *
 * This is intentionally separate from the tactical/squad data behind
 * `GamePlansService` — it is generic coaching reference content with no
 * team, athlete, or account association, so it is safe to publish without
 * authentication. Preset IDs mirror the preset entries in `FORMATION_IDS` in
 * `../common/formations.ts`. Coach-defined custom formations are saved per game
 * plan and intentionally are not part of this static public reference catalog.
 */
export interface PublicFormation {
  id: string;
  name: string;
  shape: string;
  playerCount: FormationPlayerCount;
  description: string;
}

export const PUBLIC_FORMATIONS: readonly PublicFormation[] = [
  {
    id: '5v5-1-2-1',
    name: '1-2-1',
    shape: '1-2-1',
    playerCount: 5,
    description:
      'A balanced 5-a-side shape with one defender, two midfielders and one forward in front of the goalkeeper.',
  },
  {
    id: '5v5-2-1-1',
    name: '2-1-1',
    shape: '2-1-1',
    playerCount: 5,
    description:
      'A compact 5-a-side setup with two defenders, one midfielder and one forward.',
  },
  {
    id: '5v5-1-1-2',
    name: '1-1-2',
    shape: '1-1-2',
    playerCount: 5,
    description:
      'An attacking 5-a-side shape with one defender, one midfielder and two forwards.',
  },
  {
    id: '7v7-2-3-1',
    name: '2-3-1',
    shape: '2-3-1',
    playerCount: 7,
    description:
      'A balanced 7-a-side formation with two defenders, a three-player midfield and one forward.',
  },
  {
    id: '7v7-3-2-1',
    name: '3-2-1',
    shape: '3-2-1',
    playerCount: 7,
    description:
      'A defensively secure 7-a-side shape with three defenders, two midfielders and one forward.',
  },
  {
    id: '7v7-2-2-2',
    name: '2-2-2',
    shape: '2-2-2',
    playerCount: 7,
    description:
      'A direct 7-a-side formation with two defenders, two midfielders and two forwards.',
  },
  {
    id: '4-3-3',
    name: '4-3-3',
    shape: '4-3-3',
    playerCount: 11,
    description:
      'A balanced formation with width in attack and a three-player midfield that can dominate possession.',
  },
  {
    id: '4-4-2',
    name: '4-4-2',
    shape: '4-4-2',
    playerCount: 11,
    description:
      'A classic, compact shape with two flat banks of four and two strikers who support each other up front.',
  },
  {
    id: '4-2-3-1',
    name: '4-2-3-1',
    shape: '4-2-3-1',
    playerCount: 11,
    description:
      'Two holding midfielders shield the back four while three attacking midfielders create chances for a lone striker.',
  },
  {
    id: '4-1-4-1',
    name: '4-1-4-1',
    shape: '4-1-4-1',
    playerCount: 11,
    description:
      'A disciplined shape with a single defensive midfielder screening the defence and a lone striker up top.',
  },
  {
    id: '3-5-2',
    name: '3-5-2',
    shape: '3-5-2',
    playerCount: 11,
    description:
      'Three centre-backs and attacking wing-backs provide width, supporting a five-player midfield and two strikers.',
  },
  {
    id: '3-4-3',
    name: '3-4-3',
    shape: '3-4-3',
    playerCount: 11,
    description:
      'An attacking three-at-the-back system with wide midfielders stretching play in front of a front three.',
  },
  {
    id: '5-3-2',
    name: '5-3-2',
    shape: '5-3-2',
    playerCount: 11,
    description:
      'A defensively solid setup with five defenders and a compact midfield three supporting two strikers.',
  },
  {
    id: '5-4-1',
    name: '5-4-1',
    shape: '5-4-1',
    playerCount: 11,
    description:
      'A highly defensive formation with five defenders and four midfielders protecting a lone striker on the counter.',
  },
] as const;
