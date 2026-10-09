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
    groupBy: jest.fn(),
    as: jest.fn(),
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
    chain.groupBy,
    chain.as,
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
    select
      .mockReturnValueOnce(queryResult([{ id: 'athlete-1' }]))
      .mockReturnValueOnce(queryResult([]))
      .mockReturnValueOnce(
        queryResult([
          {
            id: 'athlete-1',
            firstName: 'Ari',
            lastName: 'Nkosi',
            position: 'CM',
            squadNumber: 8,
            teamId: 'team-1',
            teamName: 'Gaffer FC',
            appearances: 1,
            minutesPlayed: 90,
            goals: 1,
            assists: 2,
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

  describe('filters', () => {
    const TEAM = '83ff97e6-a665-4605-9e72-c6f810d90202';
    const COMPETITION = '0a4b2d16-1f2c-4f0e-9c5a-2a5a4a9c1b33';
    const SEASON = '2b6c1f90-77a1-4c62-9f1e-0d2a4f6b8c10';

    it('skips the stats query entirely when no athlete matches the page', async () => {
      select.mockReturnValueOnce(queryResult([]));

      await expect(
        service.getPlayers({ limit: 100, offset: 0 }),
      ).resolves.toEqual([]);
      // Only the page-of-ids query ran; the expensive fan-out was never issued.
      expect(select).toHaveBeenCalledTimes(1);
    });

    it.each([
      [{ teamId: TEAM }],
      [{ competitionId: COMPETITION }],
      [{ seasonId: SEASON }],
      [{ competitionId: COMPETITION, seasonId: SEASON }],
      [{ teamId: TEAM, competitionId: COMPETITION, seasonId: SEASON }],
    ])(
      'applies player filters %p without widening the page',
      async (filter) => {
        const where = jest.fn();
        const page = queryResult([{ id: 'athlete-1' }]);
        page.where = where.mockReturnValue(page);
        select
          .mockReturnValueOnce(page)
          .mockReturnValueOnce(queryResult([]))
          .mockReturnValueOnce(queryResult([]));

        await service.getPlayers({ ...filter, limit: 100, offset: 0 });

        expect(where).toHaveBeenCalledTimes(1);
        expect(select).toHaveBeenCalledTimes(3);
      },
    );

    it('returns an entry for every athlete on the page, even with no stats', async () => {
      select
        .mockReturnValueOnce(queryResult([{ id: 'athlete-1' }]))
        .mockReturnValueOnce(queryResult([]))
        .mockReturnValueOnce(
          queryResult([
            {
              id: 'athlete-1',
              firstName: 'Sam',
              lastName: 'Keeper',
              position: 'GK',
              squadNumber: 1,
              teamId: 'team-1',
              teamName: 'Gaffer FC',
              appearances: 0,
              minutesPlayed: 0,
              goals: 0,
              assists: 0,
              yellowCards: 0,
              redCards: 0,
            },
          ]),
        );

      await expect(
        service.getPlayers({ limit: 100, offset: 0 }),
      ).resolves.toEqual([
        {
          id: 'athlete-1',
          firstName: 'Sam',
          lastName: 'Keeper',
          position: 'GK',
          squadNumber: 1,
          team: { id: 'team-1', name: 'Gaffer FC' },
          statistics: {
            appearances: 0,
            minutesPlayed: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
          },
        },
      ]);
    });

    it.each([
      [{ teamId: TEAM }],
      [{ competitionId: COMPETITION }],
      [{ seasonId: SEASON }],
      [{ status: 'completed' as const }],
      [{ teamId: TEAM, status: 'scheduled' as const }],
    ])('applies match filters %p', async (filter) => {
      const chain = queryResult([]);
      select.mockReturnValue(chain);

      await expect(
        service.getMatches({ ...filter, limit: 50, offset: 0 }),
      ).resolves.toEqual([]);
      expect(chain.limit).toHaveBeenCalledWith(50);
      expect(chain.offset).toHaveBeenCalledWith(0);
    });

    it.each([
      [{ teamId: TEAM }],
      [{ competitionId: COMPETITION }],
      [{ seasonId: SEASON }],
      [{ teamId: TEAM, competitionId: COMPETITION, seasonId: SEASON }],
    ])('applies standings filters %p', async (filter) => {
      select.mockReturnValue(queryResult([]));

      await expect(service.getTeamStatistics(filter)).resolves.toEqual([]);
    });

    it('marks the filtered team’s own standing row', async () => {
      select.mockReturnValue(
        queryResult([
          {
            id: 'standing-1',
            teamName: 'Gaffer FC',
            position: 2,
            played: 1,
            won: 0,
            drawn: 1,
            lost: 0,
            goalsFor: 1,
            goalsAgainst: 1,
            points: 1,
            isOwnTeam: true,
            ownerTeam: { id: 'team-1', name: 'Gaffer FC' },
            competition: {
              id: 'competition-1',
              name: 'League',
              type: 'league',
            },
            season: { id: 'season-1', name: '2026/27' },
          },
        ]),
      );

      const [standing] = await service.getTeamStatistics({ teamId: TEAM });
      expect(standing).toMatchObject({ isOwnTeam: true, goalDifference: 0 });
    });
  });
});
