import {
  FORMATIONS,
  autoFillFormation,
  getPositionRole,
  suggestStartingXi,
  type SuggestionAthlete,
} from './lineup-engine';

function athlete(
  id: string,
  position: string | null,
  overrides: Partial<SuggestionAthlete> = {},
): SuggestionAthlete {
  return {
    id,
    firstName: id,
    lastName: 'Player',
    position,
    status: 'available',
    squadNumber: null,
    ...overrides,
  };
}

/** A full, exactly-matching 4-3-3 squad — one athlete per slot's exact label. */
function fullFourThreeThreeSquad(): SuggestionAthlete[] {
  return [
    athlete('gk', 'GK'),
    athlete('lb', 'LB'),
    athlete('cb1', 'CB'),
    athlete('cb2', 'CB'),
    athlete('rb', 'RB'),
    athlete('cm1', 'CM'),
    athlete('cm2', 'CM'),
    athlete('cm3', 'CM'),
    athlete('lw', 'LW'),
    athlete('st', 'ST'),
    athlete('rw', 'RW'),
  ];
}

describe('getPositionRole', () => {
  it('maps known abbreviations to their role bucket', () => {
    expect(getPositionRole('CB')).toBe('DEF');
    expect(getPositionRole('cm')).toBe('MID');
    expect(getPositionRole('ST')).toBe('FWD');
    expect(getPositionRole('GK')).toBe('GK');
  });

  it('returns null for an unknown or missing position', () => {
    expect(getPositionRole('SWEEPER')).toBeNull();
    expect(getPositionRole(null)).toBeNull();
  });
});

describe('autoFillFormation', () => {
  it('fills every slot from an exact-label match with no duplicates', () => {
    const squad = fullFourThreeThreeSquad();
    const { assignments, substituteIds } = autoFillFormation(
      '4-3-3',
      squad.map((a) => a.id),
      (id) => squad.find((a) => a.id === id)?.position ?? null,
    );

    const placed = Object.values(assignments).filter(Boolean);
    expect(placed).toHaveLength(11);
    expect(new Set(placed).size).toBe(11);
    expect(substituteIds).toHaveLength(0);
  });

  it('falls back to a general role match for a non-exact position label, but never puts an outfield player in goal', () => {
    // "cb1" fills the first CB slot by exact label. "x" (RWB — not an exact
    // label in this formation) has no exact-label slot, so it's only placed
    // in pass 2 via a general role match (RWB -> DEF) — the first still-open
    // DEF slot in formation order, which is LB. No GK-role candidate exists,
    // so GK stays empty.
    const squad = [athlete('cb1', 'CB'), athlete('x', 'RWB')];
    const { assignments } = autoFillFormation(
      '4-3-3',
      squad.map((a) => a.id),
      (id) => squad.find((a) => a.id === id)?.position ?? null,
    );

    expect(assignments['433-gk']).toBeNull();
    expect(assignments['433-cb1']).toBe('cb1');
    expect(assignments['433-lb']).toBe('x');
  });
});

describe('suggestStartingXi', () => {
  it('produces a complete, warning-free XI from a squad with one natural player per slot', () => {
    const result = suggestStartingXi({
      formationId: '4-3-3',
      athletes: fullFourThreeThreeSquad(),
    });

    expect(result.startingIds).toHaveLength(11);
    expect(new Set(result.startingIds).size).toBe(11);
    expect(result.warnings).toHaveLength(0);
    expect(result.reasons['gk']).toMatch(/Natural GK/);
  });

  it('excludes injured and suspended athletes from selection', () => {
    const squad = fullFourThreeThreeSquad();
    const injuredGk = squad.find((a) => a.id === 'gk')!;
    injuredGk.status = 'injured';

    const result = suggestStartingXi({ formationId: '4-3-3', athletes: squad });

    expect(result.startingIds).not.toContain('gk');
    expect(result.assignments['433-gk']).toBeNull();
    expect(result.warnings).toContain(
      'There is currently no available player registered as a goalkeeper.',
    );
  });

  it('warns when the formation cannot be fully filled from the available squad', () => {
    const result = suggestStartingXi({
      formationId: '4-3-3',
      athletes: [athlete('gk', 'GK'), athlete('st', 'ST')],
    });

    expect(result.startingIds).toHaveLength(2);
    expect(
      result.warnings.some((warning) => warning.includes('Only 2 of 11')),
    ).toBe(true);
  });

  it('excludeAthleteIds removes a player entirely, even if they are the only natural fit', () => {
    const squad = fullFourThreeThreeSquad();
    const result = suggestStartingXi({
      formationId: '4-3-3',
      athletes: squad,
      excludeAthleteIds: ['st'],
    });

    expect(result.startingIds).not.toContain('st');
    expect(result.assignments['433-st']).toBeNull();
  });

  it('preferredAthleteIdBySlotLabel forces a player into a slot, bumping the incumbent to substitutes', () => {
    const squad = fullFourThreeThreeSquad();
    // Force the natural CB ("cb1") to play striker instead of the natural ST.
    const result = suggestStartingXi({
      formationId: '4-3-3',
      athletes: squad,
      preferredAthleteIdBySlotLabel: { ST: 'cb1' },
    });

    expect(result.assignments['433-st']).toBe('cb1');
    expect(result.substituteIds).toContain('st');
    // cb1 no longer double-booked at its old slot.
    expect(
      Object.values(result.assignments).filter((id) => id === 'cb1'),
    ).toHaveLength(1);
  });

  it('never selects the same athlete for two slots', () => {
    // Only one truly natural CM, but the pool has plenty of leftover
    // athletes that could role-match into the other two CM slots.
    const squad = [
      athlete('gk', 'GK'),
      athlete('lb', 'LB'),
      athlete('cb1', 'CB'),
      athlete('cb2', 'CB'),
      athlete('rb', 'RB'),
      athlete('cm1', 'CM'),
      athlete('lw', 'LW'),
      athlete('st', 'ST'),
      athlete('rw', 'RW'),
    ];
    const result = suggestStartingXi({
      formationId: FORMATIONS['4-3-3'].id,
      athletes: squad,
    });

    expect(new Set(result.startingIds).size).toBe(result.startingIds.length);
  });
});
