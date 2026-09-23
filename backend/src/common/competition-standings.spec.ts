import { calculateCompetitionStandings } from './competition-standings';

const participants = [
  { id: 'team-c', teamId: null, displayName: 'Team C' },
  { id: 'mine', teamId: 'app-team-1', displayName: 'My Team' },
  { id: 'team-e', teamId: null, displayName: 'Team E' },
];

describe('calculateCompetitionStandings', () => {
  it('shows a new competition alphabetically with visible 1..N positions', () => {
    const rows = calculateCompetitionStandings(
      'competition-1',
      participants,
      [],
      'app-team-1',
    );

    expect(rows.map((row) => [row.position, row.teamName])).toEqual([
      [1, 'My Team'],
      [2, 'Team C'],
      [3, 'Team E'],
    ]);
    expect(rows.every((row) => row.played === 0 && row.points === 0)).toBe(
      true,
    );
  });

  it('updates both participants from one recorded result, including an external team', () => {
    const rows = calculateCompetitionStandings(
      'competition-1',
      participants,
      [
        {
          homeCompetitionTeamId: 'mine',
          awayCompetitionTeamId: 'team-c',
          homeScore: 2,
          awayScore: 1,
        },
      ],
      'app-team-1',
    );

    expect(rows[0]).toMatchObject({
      teamName: 'My Team',
      played: 1,
      won: 1,
      drawn: 0,
      lost: 0,
      goalsFor: 2,
      goalsAgainst: 1,
      points: 3,
      isOwnTeam: true,
    });
    expect(rows.find((row) => row.teamName === 'Team C')).toMatchObject({
      played: 1,
      won: 0,
      drawn: 0,
      lost: 1,
      goalsFor: 1,
      goalsAgainst: 2,
      points: 0,
    });
    expect(rows.find((row) => row.teamName === 'Team E')).toMatchObject({
      played: 0,
      points: 0,
    });
  });

  it('applies an external-vs-external manual result through the same calculation', () => {
    const rows = calculateCompetitionStandings(
      'competition-1',
      participants,
      [
        {
          homeCompetitionTeamId: 'team-c',
          awayCompetitionTeamId: 'team-e',
          homeScore: 3,
          awayScore: 2,
        },
      ],
      'app-team-1',
    );

    expect(rows.find((row) => row.teamName === 'Team C')).toMatchObject({
      played: 1,
      won: 1,
      goalsFor: 3,
      goalsAgainst: 2,
      points: 3,
    });
    expect(rows.find((row) => row.teamName === 'Team E')).toMatchObject({
      played: 1,
      lost: 1,
      goalsFor: 2,
      goalsAgainst: 3,
      points: 0,
    });
  });
});
