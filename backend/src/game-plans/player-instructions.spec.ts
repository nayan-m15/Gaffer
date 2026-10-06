import { BadRequestException } from '@nestjs/common';
import { FORMATIONS } from './lineup-engine';
import {
  assertValidPlayerInstructions,
  positionGroupForSlot,
  type PlayerInstructionsValidationInput,
} from './player-instructions';

const ATHLETE = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

/** The slot ID carrying `label` in a preset formation. */
function slotId(formationId: string, label: string): string {
  const slot = FORMATIONS[formationId].positions.find(
    (position) => position.label === label,
  );
  if (!slot) throw new Error(`${formationId} has no ${label}`);
  return slot.id;
}

/** A plan with one athlete starting at `label`, carrying `instructions`. */
function startingAt(
  formationId: string,
  label: string,
  instructions: Record<string, string>,
): PlayerInstructionsValidationInput {
  return {
    instructions: { [ATHLETE]: instructions },
    formationId,
    assignments: { [slotId(formationId, label)]: ATHLETE },
    customPositions: null,
    teamAthleteIds: new Set([ATHLETE]),
  };
}

describe('assertValidPlayerInstructions', () => {
  it('accepts an instruction the player’s position asks about', () => {
    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-2-3-1', 'CAM', { positioning_freedom: 'free_roam' }),
      ),
    ).not.toThrow();
  });

  it('accepts an empty set', () => {
    expect(() =>
      assertValidPlayerInstructions({
        instructions: {},
        formationId: '4-3-3',
        assignments: {},
        customPositions: null,
        teamAthleteIds: new Set(),
      }),
    ).not.toThrow();
  });

  it('rejects an unknown category', () => {
    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-2-3-1', 'CAM', { make_tea: 'strong' }),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an option that belongs to another category', () => {
    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-2-3-1', 'CAM', { positioning_freedom: 'claim_crosses' }),
      ),
    ).toThrow(/not an option/);
  });

  it('rejects a category the position is never asked', () => {
    // Distribution is a goalkeeper's card; a number ten does not get it.
    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-2-3-1', 'CAM', { distribution: 'go_long' }),
      ),
    ).toThrow(/does not apply/);
  });

  it('rejects an option scoped to a different kind of player', () => {
    // `come_inside` is the winger's answer to Width; a full-back inverts.
    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-3-3', 'LB', { width: 'come_inside' }),
      ),
    ).toThrow(/not an option/);

    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-3-3', 'LB', { width: 'invert_inside' }),
      ),
    ).not.toThrow();
  });

  it('rejects wide cover for a centre-back who is not one of three', () => {
    expect(() =>
      assertValidPlayerInstructions(
        startingAt('4-3-3', 'CB', { wide_cover: 'cover_wide' }),
      ),
    ).toThrow(/outside defenders/);
  });

  it('accepts wide cover for the outside defender of a back three', () => {
    const formation = FORMATIONS['3-5-2'];
    const centreBacks = formation.positions
      .filter((slot) => positionGroupForSlot(slot) === 'CB')
      .sort((a, b) => a.x - b.x);
    expect(centreBacks).toHaveLength(3);

    expect(() =>
      assertValidPlayerInstructions({
        instructions: { [ATHLETE]: { wide_cover: 'cover_wide' } },
        formationId: '3-5-2',
        assignments: { [centreBacks[0].id]: ATHLETE },
        customPositions: null,
        teamAthleteIds: new Set([ATHLETE]),
      }),
    ).not.toThrow();

    expect(() =>
      assertValidPlayerInstructions({
        instructions: { [ATHLETE]: { wide_cover: 'cover_wide' } },
        formationId: '3-5-2',
        assignments: { [centreBacks[1].id]: ATHLETE },
        customPositions: null,
        teamAthleteIds: new Set([ATHLETE]),
      }),
    ).toThrow(/outside defenders/);
  });

  it('rejects an athlete who is not on the team', () => {
    expect(() =>
      assertValidPlayerInstructions({
        instructions: { [OTHER]: { crosses: 'claim_crosses' } },
        formationId: '4-3-3',
        assignments: {},
        customPositions: null,
        teamAthleteIds: new Set([ATHLETE]),
      }),
    ).toThrow(/athletes on this team/);
  });

  it('checks a substitute’s IDs without holding them to a position', () => {
    // Nobody is on the pitch, so there is no slot to measure against: a real
    // instruction passes and an invented one still does not.
    const base = {
      formationId: '4-3-3',
      assignments: {},
      customPositions: null,
      teamAthleteIds: new Set([ATHLETE]),
    };

    expect(() =>
      assertValidPlayerInstructions({
        ...base,
        instructions: { [ATHLETE]: { final_third_movement: 'cut_inside' } },
      }),
    ).not.toThrow();

    expect(() =>
      assertValidPlayerInstructions({
        ...base,
        instructions: { [ATHLETE]: { final_third_movement: 'nonsense' } },
      }),
    ).toThrow(/not an option/);
  });

  it('reads a custom formation’s slot from the coordinates it was sent', () => {
    const customPositions = [
      { id: 'custom-11-gk', label: 'GK', role: 'GK' as const, x: 50, y: 94 },
      { id: 'custom-11-1', label: 'DEF', role: 'DEF' as const, x: 10, y: 74 },
    ];

    // A defender on the touchline is a full-back, so Run Type applies...
    expect(() =>
      assertValidPlayerInstructions({
        instructions: { [ATHLETE]: { run_type: 'overlap' } },
        formationId: 'custom-11',
        assignments: { 'custom-11-1': ATHLETE },
        customPositions,
        teamAthleteIds: new Set([ATHLETE]),
      }),
    ).not.toThrow();

    // ...but a goalkeeper's card does not.
    expect(() =>
      assertValidPlayerInstructions({
        instructions: { [ATHLETE]: { crosses: 'claim_crosses' } },
        formationId: 'custom-11',
        assignments: { 'custom-11-1': ATHLETE },
        customPositions,
        teamAthleteIds: new Set([ATHLETE]),
      }),
    ).toThrow(/does not apply/);
  });
});
