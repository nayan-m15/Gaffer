/**
 * Static reference catalog of tactical approaches exposed through the
 * public API (`GET /v1/tactics`).
 *
 * These mirror the defensive/offensive style options a coach picks from on
 * the Team Tactics screen (see
 * `frontend/src/features/team-tactics/tactics-options.ts`), but only the
 * generic, shared descriptions — never a team's saved game plan, squad
 * selection, or set-piece takers, which stay behind authentication.
 * `formationId` is always `null` because a style applies across every
 * formation; the field is kept so the shape matches `PublicFormation`
 * lookups and leaves room for formation-specific tactics later.
 */
export type PublicTacticCategory = 'defensive' | 'offensive';

export interface PublicTactic {
  id: string;
  name: string;
  category: PublicTacticCategory;
  description: string;
  formationId: string | null;
}

export const PUBLIC_TACTICS: readonly PublicTactic[] = [
  {
    id: 'drop_back',
    name: 'Drop back',
    category: 'defensive',
    description:
      'Team sits deep and holds shape, inviting pressure but limiting space in behind.',
    formationId: null,
  },
  {
    id: 'balanced_defensive',
    name: 'Balanced',
    category: 'defensive',
    description:
      'Team presses toward the middle third with no strong bias — a neutral shape.',
    formationId: null,
  },
  {
    id: 'pressure_on_heavy_touch',
    name: 'Pressure on heavy touch',
    category: 'defensive',
    description:
      "Players hold shape until an opponent's poor touch, then step out to pressure.",
    formationId: null,
  },
  {
    id: 'press_after_possession_loss',
    name: 'Press after possession loss',
    category: 'defensive',
    description:
      'The whole team counter-presses for a few seconds after losing the ball — wins it back quickly but tires players and risks gaps.',
    formationId: null,
  },
  {
    id: 'constant_pressure',
    name: 'Constant pressure',
    category: 'defensive',
    description:
      'Team closes down all over the pitch — fastest ball recovery, but drains stamina and leaves space in behind.',
    formationId: null,
  },
  {
    id: 'possession',
    name: 'Possession',
    category: 'offensive',
    description:
      'Short passing and support runs to keep the ball rather than break early.',
    formationId: null,
  },
  {
    id: 'balanced_offensive',
    name: 'Balanced',
    category: 'offensive',
    description:
      'Some players make attacking runs while the team keeps its shape on the ball.',
    formationId: null,
  },
  {
    id: 'fast_build_up',
    name: 'Fast build up',
    category: 'offensive',
    description:
      'All attackers run and even defenders push up — most threat forward, most exposed at the back.',
    formationId: null,
  },
  {
    id: 'long_ball',
    name: 'Long ball',
    category: 'offensive',
    description:
      'Forwards break in behind early, even before the defence has settled — direct, route-one football.',
    formationId: null,
  },
] as const;
