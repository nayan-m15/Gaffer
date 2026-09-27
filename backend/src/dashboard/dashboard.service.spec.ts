import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { StatisticsService } from '../statistics/statistics.service';
import { TeamsService } from '../teams/teams.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  let service: DashboardService;
  const queryLimits: number[] = [];

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
  };

  const mockStatisticsService = {
    getOverview: jest.fn(),
  };

  /**
   * Creates a thenable query-chain stub. Drizzle query builders are
   * awaitable (they expose `.then`), so every chained method returns the
   * same object and `await` resolves to `result`.
   */
  function thenable(result: unknown) {
    const obj: Record<string, unknown> = {};
    obj.from = jest.fn(() => obj);
    obj.innerJoin = jest.fn(() => obj);
    obj.where = jest.fn(() => obj);
    obj.orderBy = jest.fn(() => obj);
    obj.limit = jest.fn((value: number) => {
      queryLimits.push(value);
      return obj;
    });
    obj.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return obj;
  }

  const mockDatabaseService = {
    database: {
      select: jest.fn(() => thenable([])),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: StatisticsService, useValue: mockStatisticsService },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    jest.clearAllMocks();
    queryLimits.length = 0;
    mockDatabaseService.database.select.mockImplementation(() => thenable([]));
  });

  it('returns an empty summary without querying when the user has no team', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue(null);

    const summary = await service.getSummary('user-1');

    expect(summary).toEqual({
      activeAthletesCount: 0,
      totalEventsCount: 0,
      upcomingEvents: [],
      liveMatch: null,
      recentForm: [],
      seasonSummary: null,
      recentStats: [],
    });
    expect(mockDatabaseService.database.select).not.toHaveBeenCalled();
    expect(mockStatisticsService.getOverview).not.toHaveBeenCalled();
  });

  it("computes the current season's summary and recent-match rate stats", async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-1',
      name: 'Rovers',
    });

    // Queries fire in the fixed order the Promise.all in getSummary lists
    // them: active athletes, total events, upcoming events, active match,
    // recent matches, current season.
    mockDatabaseService.database.select
      .mockImplementationOnce(() => thenable([{ value: 3 }]))
      .mockImplementationOnce(() => thenable([{ value: 5 }]))
      .mockImplementationOnce(() =>
        thenable([{ id: 'event-1', title: 'Training' }]),
      )
      .mockImplementationOnce(() =>
        thenable([
          {
            id: 'live-match-1',
            eventTitle: 'Rovers vs United',
            opponent: 'United',
            isHome: true,
            teamScore: 1,
            opponentScore: 0,
            clockElapsedMs: 30 * 60 * 1000,
            clockStartedAt: null,
          },
        ]),
      )
      .mockImplementationOnce(() =>
        thenable([
          {
            id: 'match-1',
            opponent: 'City',
            isHome: true,
            teamScore: 2,
            opponentScore: 0,
            date: new Date('2024-01-10T00:00:00.000Z'),
          },
          {
            id: 'match-2',
            opponent: 'Town',
            isHome: false,
            teamScore: 1,
            opponentScore: 1,
            date: new Date('2024-01-05T00:00:00.000Z'),
          },
        ]),
      )
      .mockImplementationOnce(() => thenable([{ id: 'season-1' }]));

    mockStatisticsService.getOverview.mockResolvedValue({
      matchesPlayed: 5,
      wins: 3,
      draws: 1,
      losses: 1,
      goalsFor: 10,
      goalsAgainst: 5,
    });

    const summary = await service.getSummary('user-1');

    expect(summary.activeAthletesCount).toBe(3);
    expect(summary.totalEventsCount).toBe(5);
    expect(summary.upcomingEvents).toEqual([
      { id: 'event-1', title: 'Training' },
    ]);
    expect(summary.liveMatch).toEqual({
      id: 'live-match-1',
      eventTitle: 'Rovers vs United',
      homeTeam: 'Rovers',
      awayTeam: 'United',
      homeScore: 1,
      awayScore: 0,
      clockElapsedMs: 30 * 60 * 1000,
      clockStartedAt: null,
      elapsedMinutes: 30,
    });
    expect(summary.recentForm).toEqual([
      {
        id: 'match-1',
        opponent: 'City',
        isHome: true,
        result: 'W',
        score: '2-0',
        date: '2024-01-10T00:00:00.000Z',
      },
      {
        id: 'match-2',
        opponent: 'Town',
        isHome: false,
        result: 'D',
        score: '1-1',
        date: '2024-01-05T00:00:00.000Z',
      },
    ]);
    expect(queryLimits).toEqual([5, 1, 10, 1]);

    // Resolved from the current season, not recomputed by hand — shared with
    // StatisticsService so the two never disagree.
    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith('user-1', {
      seasonId: 'season-1',
    });
    expect(summary.seasonSummary).toEqual({
      played: 5,
      won: 3,
      drawn: 1,
      lost: 1,
      goalsFor: 10,
      goalsAgainst: 5,
    });

    // Rates over the same two recent matches: 1 win of 2 (50%), 1 clean sheet
    // of 2 (50%), both matches scored in (100%).
    expect(summary.recentStats).toEqual([
      { label: 'Win Rate', value: 50 },
      { label: 'Clean Sheets', value: 50 },
      { label: 'Scoring Rate', value: 100 },
    ]);
  });

  it('falls back to all-time totals when the team has no current season', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });
    mockDatabaseService.database.select
      .mockImplementationOnce(() => thenable([{ value: 0 }]))
      .mockImplementationOnce(() => thenable([{ value: 0 }]))
      .mockImplementationOnce(() => thenable([]))
      .mockImplementationOnce(() => thenable([]))
      .mockImplementationOnce(() => thenable([]))
      .mockImplementationOnce(() => thenable([])); // no current season row

    mockStatisticsService.getOverview.mockResolvedValue({
      matchesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
    });

    const summary = await service.getSummary('user-1');

    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith('user-1', {
      seasonId: undefined,
    });
    expect(summary.seasonSummary).toBeNull();
    expect(summary.recentStats).toEqual([]);
  });
});
