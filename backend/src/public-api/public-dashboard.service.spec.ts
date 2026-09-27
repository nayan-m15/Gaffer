import { Test, type TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { PublicDashboardService } from './public-dashboard.service';

function queryResult<T>(rows: T[]) {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    offset: jest.fn(),
    then: (
      resolve: (value: T[]) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject),
  };
  for (const method of [
    chain.from,
    chain.innerJoin,
    chain.leftJoin,
    chain.where,
    chain.orderBy,
    chain.limit,
    chain.offset,
  ]) {
    method.mockReturnValue(chain);
  }
  return chain;
}

describe('PublicDashboardService', () => {
  let service: PublicDashboardService;
  const select = jest.fn();
  const databaseService = { database: { select } };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicDashboardService,
        { provide: DatabaseService, useValue: databaseService },
      ],
    }).compile();
    service = module.get(PublicDashboardService);
  });

  it('returns dynamic public filter catalogs', async () => {
    const teamRows = [{ id: 'team-1', name: 'Gaffer FC' }];
    const seasonRows = [{ id: 'season-1', name: '2026/27' }];
    const competitionRows = [
      {
        id: 'competition-1',
        name: 'League',
        teamId: 'team-1',
        seasonId: 'season-1',
      },
    ];
    const participantRows = [
      { competitionId: 'competition-1', teamId: 'team-1' },
      { competitionId: 'competition-1', teamId: 'team-2' },
    ];
    select
      .mockReturnValueOnce(queryResult(teamRows))
      .mockReturnValueOnce(queryResult(seasonRows))
      .mockReturnValueOnce(queryResult(competitionRows))
      .mockReturnValueOnce(queryResult(participantRows));

    await expect(service.getFilters()).resolves.toEqual({
      teams: teamRows,
      seasons: seasonRows,
      competitions: [
        {
          ...competitionRows[0],
          teamIds: ['team-1', 'team-2'],
        },
      ],
    });
  });

  it('aggregates completed-match player statistics and keeps safe fields only', async () => {
    select.mockReturnValue(
      queryResult([
        {
          id: 'athlete-1',
          firstName: 'Ari',
          lastName: 'Nkosi',
          position: 'CM',
          squadNumber: 8,
          teamId: 'team-1',
          teamName: 'Gaffer FC',
          matchId: 'match-1',
          eventStatus: 'completed',
          minutesPlayed: 90,
          appeared: true,
          goals: 1,
          assists: 2,
          yellowCards: 0,
          redCards: 0,
        },
        {
          id: 'athlete-1',
          firstName: 'Ari',
          lastName: 'Nkosi',
          position: 'CM',
          squadNumber: 8,
          teamId: 'team-1',
          teamName: 'Gaffer FC',
          matchId: 'match-2',
          eventStatus: 'scheduled',
          minutesPlayed: null,
          appeared: false,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
        },
      ]),
    );

    const result = await service.getPlayers({ limit: 200, offset: 0 });

    expect(result).toEqual([
      {
        id: 'athlete-1',
        firstName: 'Ari',
        lastName: 'Nkosi',
        position: 'CM',
        squadNumber: 8,
        team: { id: 'team-1', name: 'Gaffer FC' },
        statistics: {
          appearances: 1,
          minutesPlayed: 90,
          goals: 1,
          assists: 2,
          yellowCards: 0,
          redCards: 0,
        },
      },
    ]);
    const serialized = JSON.stringify(result).toLowerCase();
    for (const forbidden of [
      'email',
      'password',
      'token',
      'userid',
      'dateofbirth',
      'notes',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('derives goal difference for public standings', async () => {
    select.mockReturnValue(
      queryResult([
        {
          id: 'standing-1',
          teamName: 'Gaffer FC',
          position: 1,
          played: 2,
          won: 2,
          drawn: 0,
          lost: 0,
          goalsFor: 5,
          goalsAgainst: 1,
          points: 6,
          isOwnTeam: true,
          ownerTeam: { id: 'team-1', name: 'Gaffer FC' },
          competition: { id: 'competition-1', name: 'League', type: 'league' },
          season: { id: 'season-1', name: '2026/27' },
        },
      ]),
    );

    const [standing] = await service.getTeamStatistics({});
    expect(standing.goalDifference).toBe(4);
  });
});
