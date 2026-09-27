import {
  buildSeasonInsightPrompt,
  computeSeasonInputDigest,
  type BuildSeasonInsightPromptInput,
} from './season-insight-prompt';

function baseInput(): BuildSeasonInsightPromptInput {
  return {
    teamName: 'Rovers',
    seasonLabel: '2025/26',
    totals: {
      matchesPlayed: 6,
      wins: 4,
      draws: 1,
      losses: 1,
      goalsFor: 14,
      goalsAgainst: 7,
      points: 13,
    },
    deltas: [
      {
        metric: 'pointsPerGame',
        label: 'Points per match',
        first: 1,
        last: 2.5,
        delta: 1.5,
        direction: 'improving',
        higherIsBetter: true,
      },
    ],
    topScorers: [{ name: 'Sam Rivers', goals: 5, assists: 1 }],
    topAssisters: [{ name: 'Alex Doe', goals: 1, assists: 4 }],
  };
}

describe('buildSeasonInsightPrompt', () => {
  it('includes the season record and label', () => {
    const { prompt } = buildSeasonInsightPrompt(baseInput());

    expect(prompt).toContain(
      "Rovers's record for 2025/26: 6 played, 4W 1D 1L, 14 scored, 7 conceded, 13 points.",
    );
  });

  it('includes the trend deltas', () => {
    const { prompt } = buildSeasonInsightPrompt(baseInput());

    expect(prompt).toContain('Points per match: 1 -> 2.5 (+1.5, improving)');
  });

  it('includes top scorers and assisters', () => {
    const { prompt } = buildSeasonInsightPrompt(baseInput());

    expect(prompt).toContain('Top scorers: Sam Rivers (5)');
    expect(prompt).toContain('Top assisters: Alex Doe (4)');
  });

  it('degrades gracefully with no deltas or top players', () => {
    const input: BuildSeasonInsightPromptInput = {
      ...baseInput(),
      deltas: [],
      topScorers: [],
      topAssisters: [],
    };

    const { prompt } = buildSeasonInsightPrompt(input);

    expect(prompt).toContain(
      'Not enough matches yet for a meaningful trend comparison.',
    );
    expect(prompt).toContain('Top scorers: (none recorded)');
  });
});

describe('computeSeasonInputDigest', () => {
  it('is deterministic and changes when input changes', () => {
    const first = buildSeasonInsightPrompt(baseInput());
    const changed = buildSeasonInsightPrompt({
      ...baseInput(),
      totals: { ...baseInput().totals, wins: 5 },
    });

    expect(computeSeasonInputDigest(first.digestPayload)).toBe(
      computeSeasonInputDigest(first.digestPayload),
    );
    expect(computeSeasonInputDigest(first.digestPayload)).not.toBe(
      computeSeasonInputDigest(changed.digestPayload),
    );
  });
});
