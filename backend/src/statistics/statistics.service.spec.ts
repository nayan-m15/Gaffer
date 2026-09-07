import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TeamsService } from '../teams/teams.service';
import { StatisticsService } from './statistics.service';

describe('StatisticsService', () => {
  let service: StatisticsService;

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
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
    obj.limit = jest.fn(() => obj);
    obj.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return obj;
  }

  /**
   * Recursively collects bound parameter values from a drizzle SQL AST —
   * `and`/`eq` conditions carry their literal values inside `Param` chunks,
   * so this lets a test prove which values a query was actually scoped by.
   */
  function collectBoundValues(node: unknown, out: unknown[] = []): unknown[] {
    if (node && typeof node === 'object') {
      const sql = node as { queryChunks?: unknown[]; value?: unknown };
      if (Array.isArray(sql.queryChunks)) {
        for (const chunk of sql.queryChunks) {
          collectBoundValues(chunk, out);
        }
      } else if (sql.value !== undefined) {
        out.push(sql.value);
      }
    }
    return out;
  }

  const mockDatabaseService = {
    database: {
      select: jest.fn(() => thenable([])),
      insert: jest.fn(() => ({
        ...thenable([]),
        values: jest.fn(() => ({ returning: jest.fn(() => Promise.resolve([])) })),
      })),
      update: jest.fn(() => ({
        ...thenable([]),
        set: jest.fn(() => ({ returning: jest.fn(() => Promise.resolve([])) })),
      })),
      delete: jest.fn(() => ({ ...thenable([]), where: jest.fn(() => thenable([])) })),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('throws ForbiddenException when the user has no team', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue(null);

    await expect(service.getOverview('user-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockTeamsService.findTeamForUser).toHaveBeenCalledWith('user-1');
  });

  it('returns zeroed overview for a team with no matches', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-1',
      name: 'Test Team',
      role: 'coach',
    });

    const result = await service.getOverview('user-1');

    expect(result.matchesPlayed).toBe(0);
    expect(result.wins).toBe(0);
    expect(result.draws).toBe(0);
    expect(result.losses).toBe(0);
    expect(result.winRate).toBe(0);
    expect(result.goalsFor).toBe(0);
    expect(result.goalsAgainst).toBe(0);
    expect(result.goalDifference).toBe(0);
    expect(result.cleanSheets).toBe(0);
    expect(result.points).toBe(0);
    expect(result.avgGoalsFor).toBe(0);
    expect(result.avgGoalsAgainst).toBe(0);
    expect(result.trends).toEqual([]);
    expect(result.players).toEqual([]);
  });

  it('throws ForbiddenException from getAthleteStatistics when no team', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue(null);

    await expect(
      service.getAthleteStatistics('user-1', 'athlete-1'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aggregates athlete totals and match-by-match statistics from recorded rows', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });

    mockDatabaseService.database.select
      .mockImplementationOnce(() =>
        thenable([
          {
            id: 'athlete-1',
            firstName: 'Alex',
            lastName: 'Morgan',
            position: 'ST',
            squadNumber: 13,
          },
        ]),
      )
      .mockImplementationOnce(() =>
        thenable([
          {
            matchId: 'match-1',
            eventId: 'event-1',
            opponentName: 'Rivals FC',
            teamScore: 3,
            opponentScore: 1,
            date: new Date('2026-08-01T15:00:00Z'),
            started: true,
            minutesPlayed: 90,
            goals: 2,
            assists: 1,
            yellowCards: 1,
            redCards: 0,
          },
          {
            matchId: 'match-2',
            eventId: 'event-2',
            opponentName: 'United',
            teamScore: 0,
            opponentScore: 0,
            date: new Date('2026-08-08T15:00:00Z'),
            started: false,
            minutesPlayed: 45,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
          },
          {
            matchId: 'match-3',
            eventId: 'event-3',
            opponentName: 'Town FC',
            teamScore: 1,
            opponentScore: 2,
            date: new Date('2026-08-15T15:00:00Z'),
            started: true,
            minutesPlayed: null,
            goals: 1,
            assists: 0,
            yellowCards: 0,
            redCards: 1,
          },
        ]),
      );

    const result = await service.getAthleteStatistics('user-1', 'athlete-1');

    expect(result).toMatchObject({
      athleteId: 'athlete-1',
      name: 'Alex Morgan',
      position: 'ST',
      squadNumber: 13,
      appearances: 3,
      starts: 2,
      goals: 3,
      assists: 1,
      yellowCards: 1,
      redCards: 1,
    });
    expect(result.matches).toHaveLength(3);

    // W/D/L is derived from the recorded team/opponent scores.
    expect(result.matches.map((m) => m.result)).toEqual(['W', 'D', 'L']);

    // Match-by-match rows carry the recorded per-match data verbatim.
    expect(result.matches[0]).toEqual({
      matchId: 'match-1',
      eventId: 'event-1',
      date: '2026-08-01T15:00:00.000Z',
      opponent: 'Rivals FC',
      result: 'W',
      teamScore: 3,
      opponentScore: 1,
      started: true,
      minutesPlayed: 90,
      goals: 2,
      assists: 1,
      yellowCards: 1,
      redCards: 0,
    });
    expect(result.matches[1]).toMatchObject({
      opponent: 'United',
      result: 'D',
      started: false,
      minutesPlayed: 45,
      goals: 0,
      assists: 0,
    });
    expect(result.matches[2]).toMatchObject({
      opponent: 'Town FC',
      result: 'L',
      started: true,
      minutesPlayed: null,
      goals: 1,
      redCards: 1,
    });
  });

  it('returns zero totals and an empty matches array when no stats are recorded', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });

    mockDatabaseService.database.select
      .mockImplementationOnce(() =>
        thenable([
          {
            id: 'athlete-1',
            firstName: 'Alex',
            lastName: 'Morgan',
            position: 'ST',
            squadNumber: 13,
          },
        ]),
      )
      .mockImplementationOnce(() => thenable([]));

    const result = await service.getAthleteStatistics('user-1', 'athlete-1');

    expect(result).toMatchObject({
      athleteId: 'athlete-1',
      appearances: 0,
      starts: 0,
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
    });
    expect(result.matches).toEqual([]);
  });

  it('throws NotFoundException for an athlete outside the coach team', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });

    let athleteQuery: Record<string, unknown> | undefined;
    mockDatabaseService.database.select.mockImplementationOnce(() => {
      athleteQuery = thenable([]);
      return athleteQuery;
    });

    await expect(
      service.getAthleteStatistics('user-1', 'athlete-1'),
    ).rejects.toThrow(NotFoundException);

    // The lookup must bind both the athlete id and the coach's team id, so
    // an athlete belonging to another team is invisible (404), never readable.
    const where = athleteQuery?.where as jest.Mock | undefined;
    expect(where).toBeDefined();
    const whereCalls = where?.mock.calls as unknown[][] | undefined;
    const boundValues = collectBoundValues(whereCalls?.[0]?.[0]);
    expect(boundValues).toContain('athlete-1');
    expect(boundValues).toContain('team-1');
  });

  it('throws ForbiddenException from getCompetitions when no team', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue(null);

    await expect(service.getCompetitions('user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
