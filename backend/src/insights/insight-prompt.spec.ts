import {
  buildInsightPrompt,
  computeInputDigest,
  type BuildInsightPromptInput,
} from './insight-prompt';

function baseInput(): BuildInsightPromptInput {
  return {
    teamName: 'Rovers',
    match: {
      opponentName: 'City',
      isHome: true,
      teamScore: 2,
      opponentScore: 1,
      date: '2025-09-14T14:00:00.000Z',
      competitionName: 'Sunday League',
    },
    events: [
      {
        eventType: 'goal',
        team: 'own',
        minute: 23,
        athleteName: 'Sam Rivers',
        opponentLabel: null,
      },
      {
        eventType: 'yellow_card',
        team: 'opponent',
        minute: 40,
        athleteName: null,
        opponentLabel: '#4',
      },
    ],
    athletePerformances: [
      {
        athleteName: 'Sam Rivers',
        goals: 1,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
      },
      {
        athleteName: 'Alex Doe',
        goals: 0,
        assists: 0,
        yellowCards: 0,
        redCards: 0,
      },
    ],
    season: {
      matchesPlayed: 6,
      wins: 4,
      draws: 1,
      losses: 1,
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
    },
  };
}

describe('buildInsightPrompt', () => {
  it('includes the match result, venue, and opponent', () => {
    const { prompt } = buildInsightPrompt(baseInput());

    expect(prompt).toContain('Rovers won 2-1 at home against City');
    expect(prompt).toContain('Sunday League');
    expect(prompt).toContain('2025-09-14');
  });

  it('lists match events with minute and actor', () => {
    const { prompt } = buildInsightPrompt(baseInput());

    expect(prompt).toContain("23': goal for us (Sam Rivers)");
    expect(prompt).toContain("40': yellow card for the opponent (#4)");
  });

  it('lists only athletes with a scoring/card contribution', () => {
    const { prompt } = buildInsightPrompt(baseInput());

    expect(prompt).toContain('Sam Rivers: 1g 0a');
    expect(prompt).not.toContain('Alex Doe');
  });

  it('includes the season trend deltas when present', () => {
    const { prompt } = buildInsightPrompt(baseInput());

    expect(prompt).toContain('6 played, 4W 1D 1L');
    expect(prompt).toContain('Points per match: 1 -> 2.5 (+1.5, improving)');
  });

  it('degrades gracefully with no season context', () => {
    const input = { ...baseInput(), season: null };

    const { prompt } = buildInsightPrompt(input);

    expect(prompt).toContain('No season trend data is available yet.');
  });

  it('degrades gracefully with no events or performances', () => {
    const input: BuildInsightPromptInput = {
      ...baseInput(),
      events: [],
      athletePerformances: [],
    };

    const { prompt } = buildInsightPrompt(input);

    expect(prompt).toContain('(No notable events were logged.)');
    expect(prompt).toContain('(No goal/assist/card contributions logged.)');
  });
});

describe('computeInputDigest', () => {
  it('is deterministic for identical input', () => {
    const { digestPayload } = buildInsightPrompt(baseInput());

    expect(computeInputDigest(digestPayload)).toBe(
      computeInputDigest(digestPayload),
    );
  });

  it('changes when the underlying data changes', () => {
    const first = buildInsightPrompt(baseInput());
    const changed = buildInsightPrompt({
      ...baseInput(),
      match: { ...baseInput().match, teamScore: 3 },
    });

    expect(computeInputDigest(first.digestPayload)).not.toBe(
      computeInputDigest(changed.digestPayload),
    );
  });
});
