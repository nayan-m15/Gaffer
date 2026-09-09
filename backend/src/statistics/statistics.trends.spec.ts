import {
  buildTrends,
  choosePeriodMode,
  cumulativePoints,
  matchPoints,
  matchResult,
  per90,
  perAppearance,
  periodSplits,
  rollingForm,
  splitDeltas,
  summariseMatches,
  type MatchRow,
  type MatchTrendEntry,
} from './statistics.trends';

/** Builds a match row `daysFromStart` days after 2025-08-02T12:00:00Z. */
function row(
  daysFromStart: number,
  teamScore: number,
  opponentScore: number,
  overrides: Partial<MatchRow> = {},
): MatchRow {
  const date = new Date('2025-08-02T12:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + daysFromStart);

  return {
    matchId: `match-${daysFromStart}`,
    eventId: `event-${daysFromStart}`,
    date,
    opponent: `Opponent ${daysFromStart}`,
    isHome: true,
    teamScore,
    opponentScore,
    ...overrides,
  };
}

function entriesFrom(rows: MatchRow[]): MatchTrendEntry[] {
  return summariseMatches(rows).entries;
}

describe('matchResult / matchPoints', () => {
  it.each([
    [3, 1, 'W', 3],
    [1, 1, 'D', 1],
    [0, 2, 'L', 0],
    [0, 0, 'D', 1],
  ])('%i-%i is a %s worth %i points', (gf, ga, result, points) => {
    expect(matchResult(gf, ga)).toBe(result);
    expect(matchPoints(matchResult(gf, ga))).toBe(points);
  });
});

describe('summariseMatches', () => {
  it('returns zeroed totals and no entries for an empty season', () => {
    const { totals, entries } = summariseMatches([]);

    expect(entries).toEqual([]);
    expect(totals).toEqual({
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      winRate: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      cleanSheets: 0,
      points: 0,
      avgGoalsFor: 0,
      avgGoalsAgainst: 0,
    });
  });

  it('aggregates across multiple matches', () => {
    // W 3-1, L 0-2, D 1-1, W 2-0, W 4-1
    const { totals } = summariseMatches([
      row(0, 3, 1),
      row(7, 0, 2),
      row(14, 1, 1),
      row(21, 2, 0),
      row(28, 4, 1),
    ]);

    expect(totals.matchesPlayed).toBe(5);
    expect(totals.wins).toBe(3);
    expect(totals.draws).toBe(1);
    expect(totals.losses).toBe(1);
    expect(totals.points).toBe(10);
    expect(totals.goalsFor).toBe(10);
    expect(totals.goalsAgainst).toBe(5);
    expect(totals.goalDifference).toBe(5);
    expect(totals.cleanSheets).toBe(1);
    expect(totals.winRate).toBeCloseTo(0.6);
    expect(totals.avgGoalsFor).toBeCloseTo(2);
    expect(totals.avgGoalsAgainst).toBeCloseTo(1);
  });

  it('serialises dates to ISO strings and preserves order', () => {
    const { entries } = summariseMatches([row(0, 1, 0), row(7, 0, 1)]);

    expect(entries[0].date).toBe('2025-08-02T12:00:00.000Z');
    expect(entries[1].date).toBe('2025-08-09T12:00:00.000Z');
    expect(entries.map((e) => e.result)).toEqual(['W', 'L']);
  });
});

describe('rollingForm', () => {
  it('uses a partial trailing window for the opening matches', () => {
    // 7 matches, window 5. Points: 3, 0, 1, 3, 3, 0, 3
    const entries = entriesFrom([
      row(0, 2, 1), // W
      row(7, 0, 1), // L
      row(14, 1, 1), // D
      row(21, 3, 0), // W
      row(28, 1, 0), // W
      row(35, 0, 3), // L
      row(42, 2, 0), // W
    ]);

    const rolling = rollingForm(entries, 5);
    expect(rolling).toHaveLength(7);

    // Match 1: window of 1 -> 3 points / 1 game
    expect(rolling[0]).toMatchObject({
      index: 1,
      windowSize: 1,
      pointsPerGame: 3,
    });
    // Match 2: window of 2 -> (3+0)/2 = 1.5
    expect(rolling[1]).toMatchObject({
      index: 2,
      windowSize: 2,
      pointsPerGame: 1.5,
    });
    // Match 5: first full window -> (3+0+1+3+3)/5 = 2
    expect(rolling[4]).toMatchObject({
      index: 5,
      windowSize: 5,
      pointsPerGame: 2,
    });
    // Match 6: matches 2-6 -> (0+1+3+3+0)/5 = 1.4
    expect(rolling[5]).toMatchObject({
      index: 6,
      windowSize: 5,
      pointsPerGame: 1.4,
    });
    // Match 7: matches 3-7 -> (1+3+3+0+3)/5 = 2
    expect(rolling[6]).toMatchObject({
      index: 7,
      windowSize: 5,
      pointsPerGame: 2,
    });
  });

  it('averages goals over the trailing window', () => {
    const entries = entriesFrom([row(0, 4, 0), row(7, 0, 2), row(14, 2, 1)]);
    const rolling = rollingForm(entries, 2);

    // Match 3 covers matches 2-3: goals for (0+2)/2 = 1, against (2+1)/2 = 1.5
    expect(rolling[2]).toMatchObject({
      windowSize: 2,
      goalsForAvg: 1,
      goalsAgainstAvg: 1.5,
    });
  });

  it('returns an empty series for an empty season', () => {
    expect(rollingForm([], 5)).toEqual([]);
  });
});

describe('cumulativePoints', () => {
  it('accumulates points and goal difference monotonically in points', () => {
    const entries = entriesFrom([
      row(0, 3, 1), // W, +2
      row(7, 0, 2), // L, -2
      row(14, 1, 1), // D, 0
      row(21, 2, 0), // W, +2
      row(28, 4, 1), // W, +3
    ]);

    const cumulative = cumulativePoints(entries);

    expect(cumulative.map((c) => c.cumulativePoints)).toEqual([3, 3, 4, 7, 10]);
    expect(cumulative.map((c) => c.cumulativeGoalDifference)).toEqual([
      2, 0, 0, 2, 5,
    ]);
    expect(cumulative.map((c) => c.index)).toEqual([1, 2, 3, 4, 5]);

    // Points never decrease.
    for (let i = 1; i < cumulative.length; i += 1) {
      expect(cumulative[i].cumulativePoints).toBeGreaterThanOrEqual(
        cumulative[i - 1].cumulativePoints,
      );
    }
  });
});

describe('choosePeriodMode', () => {
  it('uses halves below 6 matches even when spread over many months', () => {
    // 5 matches across 5 distinct months
    const entries = entriesFrom([
      row(0, 1, 0),
      row(31, 1, 0),
      row(62, 1, 0),
      row(93, 1, 0),
      row(124, 1, 0),
    ]);

    expect(entries).toHaveLength(5);
    expect(choosePeriodMode(entries)).toBe('halves');
  });

  it('uses halves when 6+ matches sit in fewer than 3 months', () => {
    const entries = entriesFrom([
      row(0, 1, 0),
      row(2, 1, 0),
      row(4, 1, 0),
      row(6, 1, 0),
      row(8, 1, 0),
      row(10, 1, 0),
    ]);

    expect(choosePeriodMode(entries)).toBe('halves');
  });

  it('uses monthly at 6+ matches across 3+ months', () => {
    const entries = entriesFrom([
      row(0, 1, 0),
      row(3, 1, 0),
      row(31, 1, 0),
      row(34, 1, 0),
      row(62, 1, 0),
      row(65, 1, 0),
    ]);

    expect(choosePeriodMode(entries)).toBe('monthly');
  });
});

describe('periodSplits', () => {
  it('returns nothing below 2 matches', () => {
    expect(periodSplits([], 'halves')).toEqual([]);
    expect(periodSplits(entriesFrom([row(0, 1, 0)]), 'halves')).toEqual([]);
  });

  it('puts the odd match in the first half', () => {
    const entries = entriesFrom([
      row(0, 1, 0),
      row(7, 1, 0),
      row(14, 1, 0),
      row(21, 1, 0),
      row(28, 1, 0),
    ]);

    const splits = periodSplits(entries, 'halves');

    expect(splits).toHaveLength(2);
    expect(splits[0]).toMatchObject({
      key: 'first',
      label: 'First half',
      matchesPlayed: 3,
    });
    expect(splits[1]).toMatchObject({
      key: 'second',
      label: 'Second half',
      matchesPlayed: 2,
    });
  });

  it('summarises each half independently', () => {
    // First half: W 3-1, L 0-2, D 1-1 -> 4 pts in 3. Second half: W 2-0, W 4-1 -> 6 pts in 2.
    const entries = entriesFrom([
      row(0, 3, 1),
      row(7, 0, 2),
      row(14, 1, 1),
      row(21, 2, 0),
      row(28, 4, 1),
    ]);

    const [first, second] = periodSplits(entries, 'halves');

    expect(first).toMatchObject({
      matchesPlayed: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      points: 4,
      goalsFor: 4,
      goalsAgainst: 4,
      cleanSheets: 0,
      pointsPerGame: 1.33,
      avgGoalsAgainst: 1.33,
    });
    expect(second).toMatchObject({
      matchesPlayed: 2,
      wins: 2,
      points: 6,
      goalsFor: 6,
      goalsAgainst: 1,
      cleanSheets: 1,
      pointsPerGame: 3,
      winRate: 1,
    });
    expect(first.from).toBe('2025-08-02T12:00:00.000Z');
    expect(second.to).toBe('2025-08-30T12:00:00.000Z');
  });

  it('groups monthly buckets chronologically, skipping empty months', () => {
    const entries = entriesFrom([
      row(0, 1, 0), // Aug
      row(3, 1, 0), // Aug
      row(62, 2, 0), // Oct — September has no matches
      row(65, 0, 1), // Oct
    ]);

    const splits = periodSplits(entries, 'monthly');

    expect(splits.map((s) => s.key)).toEqual(['2025-08', '2025-10']);
    expect(splits.map((s) => s.label)).toEqual(['Aug 2025', 'Oct 2025']);
    expect(splits[0].matchesPlayed).toBe(2);
    expect(splits[1].matchesPlayed).toBe(2);
  });
});

describe('splitDeltas', () => {
  it('returns nothing with fewer than two periods', () => {
    expect(splitDeltas([])).toEqual([]);
    expect(
      splitDeltas(periodSplits(entriesFrom([row(0, 1, 0)]), 'halves')),
    ).toEqual([]);
  });

  it('reports an improving points-per-match trend', () => {
    // First half 4 pts in 3 (1.33), second half 6 pts in 2 (3).
    const splits = periodSplits(
      entriesFrom([
        row(0, 3, 1),
        row(7, 0, 2),
        row(14, 1, 1),
        row(21, 2, 0),
        row(28, 4, 1),
      ]),
      'halves',
    );

    const ppg = splitDeltas(splits).find((d) => d.metric === 'pointsPerGame');

    expect(ppg).toMatchObject({
      first: 1.33,
      last: 3,
      delta: 1.67,
      direction: 'improving',
      higherIsBetter: true,
    });
  });

  it('treats fewer goals conceded as improving', () => {
    // First half concedes 3 per match, second half concedes 0.
    const splits = periodSplits(
      entriesFrom([row(0, 0, 3), row(7, 0, 3), row(14, 1, 0), row(21, 1, 0)]),
      'halves',
    );

    const conceded = splitDeltas(splits).find(
      (d) => d.metric === 'avgGoalsAgainst',
    );

    expect(conceded).toMatchObject({
      first: 3,
      last: 0,
      delta: -3,
      direction: 'improving',
      higherIsBetter: false,
    });
  });

  it('treats more goals conceded as declining', () => {
    const splits = periodSplits(
      entriesFrom([row(0, 1, 0), row(7, 1, 0), row(14, 0, 3), row(21, 0, 3)]),
      'halves',
    );

    const conceded = splitDeltas(splits).find(
      (d) => d.metric === 'avgGoalsAgainst',
    );

    expect(conceded).toMatchObject({ delta: 3, direction: 'declining' });
  });

  it('reports an unchanged metric as steady', () => {
    const splits = periodSplits(
      entriesFrom([row(0, 2, 1), row(7, 2, 1), row(14, 2, 1), row(21, 2, 1)]),
      'halves',
    );

    for (const delta of splitDeltas(splits)) {
      expect(delta.delta).toBe(0);
      expect(delta.direction).toBe('steady');
    }
  });

  it('treats a non-zero sub-epsilon change as steady rather than a trend', () => {
    // 50 matches. Both halves concede one per match except the very last, which
    // concedes two: 25/25 = 1.0 against 26/25 = 1.04. The 0.04 delta is real but
    // below the 0.05 epsilon, so it must not be reported as a decline.
    const rows = Array.from({ length: 50 }, (_, i) =>
      row(i, 1, i === 49 ? 2 : 1),
    );

    const splits = periodSplits(entriesFrom(rows), 'halves');
    const conceded = splitDeltas(splits).find(
      (d) => d.metric === 'avgGoalsAgainst',
    );

    expect(conceded).toMatchObject({
      first: 1,
      last: 1.04,
      delta: 0.04,
      direction: 'steady',
    });
  });

  it('reports a just-over-epsilon change as a trend', () => {
    // Same shape, but the last two matches concede two: 27/25 = 1.08, delta 0.08.
    const rows = Array.from({ length: 50 }, (_, i) =>
      row(i, 1, i >= 48 ? 2 : 1),
    );

    const splits = periodSplits(entriesFrom(rows), 'halves');
    const conceded = splitDeltas(splits).find(
      (d) => d.metric === 'avgGoalsAgainst',
    );

    expect(conceded).toMatchObject({ delta: 0.08, direction: 'declining' });
  });
});

describe('per90 / perAppearance', () => {
  it('returns null below 90 recorded minutes', () => {
    expect(per90(1, 0)).toBeNull();
    expect(per90(1, 45)).toBeNull();
    expect(per90(1, 89)).toBeNull();
  });

  it('normalises to a 90-minute rate at or above the threshold', () => {
    expect(per90(1, 90)).toBe(1);
    expect(per90(3, 270)).toBe(1);
    expect(per90(5, 450)).toBe(1);
    expect(per90(1, 180)).toBe(0.5);
  });

  it('divides by appearances, guarding zero', () => {
    expect(perAppearance(6, 4)).toBe(1.5);
    expect(perAppearance(0, 0)).toBe(0);
    expect(perAppearance(5, 0)).toBe(0);
  });
});

describe('buildTrends', () => {
  it('assembles rolling form, cumulative points and period splits together', () => {
    const entries = entriesFrom([
      row(0, 3, 1),
      row(7, 0, 2),
      row(14, 1, 1),
      row(21, 2, 0),
      row(28, 4, 1),
    ]);

    const trends = buildTrends(entries);

    expect(trends.rollingWindow).toBe(5);
    expect(trends.form.rolling).toHaveLength(5);
    expect(trends.form.cumulative).toHaveLength(5);
    expect(trends.form.cumulative[4].cumulativePoints).toBe(10);
    expect(trends.periods.mode).toBe('halves');
    expect(trends.periods.splits).toHaveLength(2);
    expect(trends.periods.deltas).toHaveLength(4);
  });

  it('degrades gracefully for an empty season', () => {
    const trends = buildTrends([]);

    expect(trends.form.rolling).toEqual([]);
    expect(trends.form.cumulative).toEqual([]);
    expect(trends.periods.splits).toEqual([]);
    expect(trends.periods.deltas).toEqual([]);
    expect(trends.periods.mode).toBe('halves');
  });

  it('honours a custom rolling window', () => {
    const entries = entriesFrom([row(0, 1, 0), row(7, 1, 0), row(14, 1, 0)]);
    const trends = buildTrends(entries, { window: 2 });

    expect(trends.rollingWindow).toBe(2);
    expect(trends.form.rolling[2].windowSize).toBe(2);
  });
});
