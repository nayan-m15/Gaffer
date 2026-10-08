import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { InsightsService } from '../insights/insights.service';
import { SeasonsService } from '../seasons/seasons.service';
import { TeamsService } from '../teams/teams.service';
import { StatisticsService } from './statistics.service';

/** A Postgres unique-violation (SQLSTATE 23505) as the driver raises it. */
function uniqueViolation(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint'),
    {
      code: '23505',
    },
  );
}

describe('StatisticsService', () => {
  let service: StatisticsService;

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
  };

  const mockSeasonsService = {
    resolveSeasonWindow: jest.fn(),
  };

  const mockInsightsService = {
    getRecentForTeam: jest.fn(),
    answerQuestion: jest.fn(),
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
    obj.leftJoin = jest.fn(() => obj);
    obj.where = jest.fn(() => obj);
    obj.groupBy = jest.fn(() => obj);
    obj.orderBy = jest.fn(() => obj);
    obj.limit = jest.fn(() => obj);
    obj.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return obj;
  }

  function firstCallArgument<T>(mock: { mock: { calls: unknown[][] } }): T {
    return mock.mock.calls[0]?.[0] as T;
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
        values: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([])),
        })),
      })),
      update: jest.fn(() => ({
        ...thenable([]),
        set: jest.fn(() => ({ returning: jest.fn(() => Promise.resolve([])) })),
      })),
      delete: jest.fn(() => ({
        ...thenable([]),
        where: jest.fn(() => thenable([])),
      })),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatisticsService,
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: SeasonsService, useValue: mockSeasonsService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: InsightsService, useValue: mockInsightsService },
      ],
    }).compile();

    service = module.get<StatisticsService>(StatisticsService);

    jest.clearAllMocks();
    mockInsightsService.getRecentForTeam.mockResolvedValue([]);
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
      primaryColor: null,
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

  /**
   * Self-contained block: each test sets up its own complete query chain rather
   * than adding to the chains above, which are matched positionally.
   */
  /** `.where(condition)` spy — typed so the captured condition is `unknown`, not `any`. */
  type WhereSpy = jest.Mock<unknown, [unknown]>;

  describe('season scoping', () => {
    const season = {
      id: 'season-1',
      teamId: 'team-1',
      name: '2025/26',
      startDate: '2025-08-01',
      endDate: '2026-05-31',
      isCurrent: true,
    };
    const window = {
      start: new Date('2025-08-01T00:00:00.000Z'),
      end: new Date('2026-05-31T23:59:59.999Z'),
    };

    beforeEach(() => {
      mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });
      mockSeasonsService.resolveSeasonWindow.mockResolvedValue({
        season,
        window,
      });
    });

    it('does not resolve a season when none is requested', async () => {
      await service.getOverview('user-1');

      expect(mockSeasonsService.resolveSeasonWindow).not.toHaveBeenCalled();
    });

    it("resolves the season against the caller's own team", async () => {
      await service.getOverview('user-1', { seasonId: 'season-1' });

      expect(mockSeasonsService.resolveSeasonWindow).toHaveBeenCalledWith(
        'team-1',
        'season-1',
      );
    });

    it('binds the season window into both the match and player queries', async () => {
      const whereSpies: WhereSpy[] = [];
      mockDatabaseService.database.select.mockImplementation(() => {
        const chain = thenable([]);
        whereSpies.push(chain.where as WhereSpy);
        return chain;
      });

      await service.getOverview('user-1', { seasonId: 'season-1' });

      expect(whereSpies).toHaveLength(2);
      for (const where of whereSpies) {
        const bound = collectBoundValues(where.mock.calls[0][0]);
        expect(bound).toContainEqual(window.start);
        expect(bound).toContainEqual(window.end);
      }
    });

    it('omits the window from the query when no season is requested', async () => {
      const whereSpies: WhereSpy[] = [];
      mockDatabaseService.database.select.mockImplementation(() => {
        const chain = thenable([]);
        whereSpies.push(chain.where as WhereSpy);
        return chain;
      });

      await service.getOverview('user-1');

      const bound = collectBoundValues(whereSpies[0].mock.calls[0][0]);
      expect(bound.some((v) => v instanceof Date)).toBe(false);
    });

    it('echoes the resolved season back to the client', async () => {
      const result = await service.getOverview('user-1', {
        seasonId: 'season-1',
      });

      expect(result.season).toEqual({
        id: 'season-1',
        name: '2025/26',
        startDate: '2025-08-01',
        endDate: '2026-05-31',
        isCurrent: true,
      });
    });

    it('reports a null season when unfiltered', async () => {
      const result = await service.getOverview('user-1');

      expect(result.season).toBeNull();
    });

    it('includes the trend payload alongside the existing fields', async () => {
      const result = await service.getOverview('user-1');

      expect(result.rollingWindow).toBe(5);
      expect(result.form.rolling).toEqual([]);
      expect(result.form.cumulative).toEqual([]);
      expect(result.periods.splits).toEqual([]);
      expect(result.periods.deltas).toEqual([]);
    });
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
            appeared: true,
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
            appeared: true,
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
            appeared: true,
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
      saves: 0,
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
      saves: 0,
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

  it('loads member competitions and fills missing participant standings with zeroes', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-2',
      name: 'Riverside App Team',
      role: 'coach',
    });

    mockDatabaseService.database.select
      .mockImplementationOnce(() =>
        thenable([
          {
            competition: {
              id: 'comp-1',
              teamId: 'team-1',
              adminUserId: 'user-1',
              name: 'Shared League',
              type: 'league',
              seasonId: null,
              season: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        ]),
      )
      .mockImplementationOnce(() =>
        thenable([
          {
            id: 'participant-1',
            competitionId: 'comp-1',
            teamId: 'team-1',
            displayName: 'Founders FC',
          },
          {
            id: 'participant-2',
            competitionId: 'comp-1',
            teamId: 'team-2',
            displayName: 'Riverside FC',
          },
          {
            id: 'participant-3',
            competitionId: 'comp-1',
            teamId: null,
            displayName: 'Albion FC',
          },
        ]),
      )
      .mockImplementationOnce(() =>
        thenable([
          {
            id: 'standing-1',
            competitionId: 'comp-1',
            teamName: 'Founders FC',
            position: 1,
            played: 1,
            won: 1,
            drawn: 0,
            lost: 0,
            goalsFor: 2,
            goalsAgainst: 0,
            points: 3,
            isOwnTeam: true,
          },
        ]),
      );

    const [competition] = await service.getCompetitions('user-2');

    expect(competition.id).toBe('comp-1');
    expect(competition.isAdmin).toBe(false);
    expect(competition.standings).toEqual([
      expect.objectContaining({
        id: 'standing-1',
        teamName: 'Founders FC',
        position: 1,
        isOwnTeam: false,
      }),
      expect.objectContaining({
        id: 'participant:participant-3',
        teamName: 'Albion FC',
        position: 2,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        isOwnTeam: false,
      }),
      expect.objectContaining({
        id: 'participant:participant-2',
        teamName: 'Riverside FC',
        position: 3,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        isOwnTeam: true,
      }),
    ]);
  });

  it('rejects standings mutation for a non-admin participant', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-2',
      role: 'coach',
    });
    mockDatabaseService.database.select.mockImplementationOnce(() =>
      thenable([
        {
          competition: {
            id: 'comp-1',
            adminUserId: 'user-1',
            teamId: 'team-1',
          },
        },
      ]),
    );

    await expect(
      service.createStanding('user-2', 'comp-1', {
        teamName: 'Riverside FC',
        position: 1,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects creating a friendly competition through the legacy statistics API', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-1',
      role: 'coach',
    });

    await expect(
      service.createCompetition('user-1', {
        name: 'Legacy Friendly',
        type: 'friendly',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockDatabaseService.database.insert).not.toHaveBeenCalled();
  });

  describe('createStanding uniqueness', () => {
    it('throws ConflictException when a standing with the same position exists', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });

      mockDatabaseService.database.select.mockImplementationOnce(() =>
        thenable([
          {
            competition: {
              id: 'comp-1',
              adminUserId: 'user-1',
              teamId: 'team-1',
            },
          },
        ]),
      );
      mockDatabaseService.database.select.mockImplementationOnce(() =>
        thenable([{ position: 1, teamName: 'Other FC' }]),
      );

      await expect(
        service.createStanding('user-1', 'comp-1', {
          teamName: 'My Team',
          position: 1,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when a standing with the same team name exists', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });

      mockDatabaseService.database.select.mockImplementationOnce(() =>
        thenable([
          {
            competition: {
              id: 'comp-1',
              adminUserId: 'user-1',
              teamId: 'team-1',
            },
          },
        ]),
      );
      mockDatabaseService.database.select.mockImplementationOnce(() =>
        thenable([{ position: 2, teamName: 'My Team' }]),
      );

      await expect(
        service.createStanding('user-1', 'comp-1', {
          teamName: 'My Team',
          position: 1,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('updateStanding integrity', () => {
    it('validates a partial update against the complete stored standing', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue({ id: 'team-1' });
      mockDatabaseService.database.select.mockImplementationOnce(() =>
        thenable([
          {
            id: 'standing-1',
            competitionId: 'competition-1',
            teamName: 'Sporting FC',
            position: 1,
            played: 1,
            won: 1,
            drawn: 0,
            lost: 0,
            goalsFor: 2,
            goalsAgainst: 0,
            points: 3,
            isOwnTeam: true,
            competitionAdminUserId: 'user-1',
            legacyOwnerTeamId: 'team-1',
          },
        ]),
      );

      await expect(
        service.updateStanding('user-1', 'standing-1', { won: 0 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockDatabaseService.database.update).not.toHaveBeenCalled();
    });
  });

  describe('askAssistant', () => {
    beforeEach(() => {
      mockTeamsService.findTeamForUser.mockResolvedValue({
        id: 'team-1',
        name: 'Rovers',
      });
    });

    it('builds a prompt from the overview and delegates to InsightsService', async () => {
      mockInsightsService.answerQuestion.mockResolvedValue({
        status: 'ready',
        answer: 'Nobody has scored yet.',
      });

      const result = await service.askAssistant('user-1', {
        question: 'Who scored the most goals?',
      });

      expect(result).toEqual({
        status: 'ready',
        answer: 'Nobody has scored yet.',
      });
      expect(mockInsightsService.answerQuestion).toHaveBeenCalledTimes(1);
      const prompt = firstCallArgument<string>(
        mockInsightsService.answerQuestion,
      );
      expect(prompt).toContain("Rovers's record");
      expect(prompt).toContain('Question: Who scored the most goals?');
    });

    it('scopes the prompt to the resolved season when seasonId is given', async () => {
      mockSeasonsService.resolveSeasonWindow.mockResolvedValue({
        season: {
          id: 'season-1',
          name: '2025/26',
          startDate: '2025-08-01',
          endDate: '2026-05-31',
          isCurrent: true,
        },
        window: { start: new Date('2025-08-01'), end: new Date('2026-05-31') },
      });
      mockInsightsService.answerQuestion.mockResolvedValue({
        status: 'ready',
        answer: 'Answer.',
      });

      await service.askAssistant('user-1', {
        question: 'How are we doing?',
        seasonId: 'season-1',
      });

      const prompt = firstCallArgument<string>(
        mockInsightsService.answerQuestion,
      );
      expect(prompt).toContain('record for 2025/26');
    });

    it('propagates a failed status without throwing', async () => {
      mockInsightsService.answerQuestion.mockResolvedValue({
        status: 'failed',
        answer: null,
      });

      const result = await service.askAssistant('user-1', {
        question: 'Who scored the most goals?',
      });

      expect(result).toEqual({ status: 'failed', answer: null });
    });
  });

  describe('competition and standing management', () => {
    const TEAM = { id: 'team-1', name: 'Gaffer FC' };
    const COMPETITION = 'competition-1';
    const STANDING = 'standing-1';

    /** A standing row shaped as `requireStandingAdmin` returns it. */
    const standingRow = (overrides: Record<string, unknown> = {}) => ({
      id: STANDING,
      competitionId: COMPETITION,
      teamName: 'Rovers',
      position: 3,
      played: 4,
      won: 2,
      drawn: 1,
      lost: 1,
      goalsFor: 7,
      goalsAgainst: 5,
      points: 7,
      isOwnTeam: false,
      competitionAdminUserId: 'user-1',
      legacyOwnerTeamId: 'team-1',
      ...overrides,
    });

    const adminCompetition = (overrides: Record<string, unknown> = {}) => [
      {
        competition: {
          id: COMPETITION,
          adminUserId: 'user-1',
          teamId: 'team-1',
          ...overrides,
        },
      },
    ];

    /** Restores permissive defaults; individual tests narrow them. */
    beforeEach(() => {
      mockTeamsService.findTeamForUser.mockResolvedValue(TEAM);
      mockDatabaseService.database.select.mockImplementation(() =>
        thenable([]),
      );
      mockDatabaseService.database.insert.mockImplementation(() => ({
        values: jest.fn(() => ({
          returning: jest.fn(() => Promise.resolve([{ id: COMPETITION }])),
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve(undefined).then(resolve),
        })),
      }));
      mockDatabaseService.database.update.mockImplementation(() => ({
        set: jest.fn(() => ({
          where: jest.fn(() => ({
            returning: jest.fn(() => Promise.resolve([{ id: COMPETITION }])),
          })),
        })),
      }));
      mockDatabaseService.database.delete.mockImplementation(() => ({
        where: jest.fn(() => Promise.resolve(undefined)),
      }));
    });

    describe('createCompetition', () => {
      it('creates the competition and adds the founding participant', async () => {
        const result = await service.createCompetition('user-1', {
          name: 'Sunday League',
          type: 'league',
        } as never);

        expect(result).toEqual({ id: COMPETITION });
        // Once for the competition, once for its participant row.
        expect(mockDatabaseService.database.insert).toHaveBeenCalledTimes(2);
      });

      it('refuses to create a friendly through the legacy API', async () => {
        await expect(
          service.createCompetition('user-1', {
            name: 'Kickabout',
            type: 'friendly',
          } as never),
        ).rejects.toThrow(BadRequestException);
      });

      it('maps a duplicate name to a conflict', async () => {
        mockDatabaseService.database.insert.mockImplementation(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(() => Promise.reject(uniqueViolation())),
          })),
        }));

        await expect(
          service.createCompetition('user-1', {
            name: 'Sunday League',
            type: 'league',
          } as never),
        ).rejects.toThrow(ConflictException);
      });

      it('rethrows an unrelated insert failure', async () => {
        const failure = new Error('connection reset');
        mockDatabaseService.database.insert.mockImplementation(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(() => Promise.reject(failure)),
          })),
        }));

        await expect(
          service.createCompetition('user-1', {
            name: 'Sunday League',
            type: 'league',
          } as never),
        ).rejects.toBe(failure);
      });

      it('never leaves a competition without its founding participant', async () => {
        const failure = new Error('participant insert failed');
        let call = 0;
        mockDatabaseService.database.insert.mockImplementation(() => {
          call += 1;
          return call === 1
            ? {
                values: jest.fn(() => ({
                  returning: jest.fn(() =>
                    Promise.resolve([{ id: COMPETITION }]),
                  ),
                })),
              }
            : { values: jest.fn(() => Promise.reject(failure)) };
        });

        await expect(
          service.createCompetition('user-1', {
            name: 'Sunday League',
            type: 'league',
          } as never),
        ).rejects.toBe(failure);
        expect(mockDatabaseService.database.delete).toHaveBeenCalled();
      });

      it('requires a team', async () => {
        mockTeamsService.findTeamForUser.mockResolvedValue(null);

        await expect(
          service.createCompetition('user-1', {
            name: 'Sunday League',
            type: 'league',
          } as never),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('updateCompetition', () => {
      it('updates a competition the caller administers', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition()),
        );

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Renamed',
          }),
        ).resolves.toEqual({ id: COMPETITION });
      });

      it('refuses to turn a competition into a friendly', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition()),
        );

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            type: 'friendly',
          } as never),
        ).rejects.toThrow(BadRequestException);
      });

      it('maps a duplicate name to a conflict', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition()),
        );
        mockDatabaseService.database.update.mockImplementation(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(() => Promise.reject(uniqueViolation())),
            })),
          })),
        }));

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Taken',
          }),
        ).rejects.toThrow(ConflictException);
      });

      it('rethrows an unrelated update failure', async () => {
        const failure = new Error('connection reset');
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition()),
        );
        mockDatabaseService.database.update.mockImplementation(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(() => Promise.reject(failure)),
            })),
          })),
        }));

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Unlucky',
          }),
        ).rejects.toBe(failure);
      });

      it('reports an unknown competition as not found', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([]),
        );

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Renamed',
          }),
        ).rejects.toThrow(NotFoundException);
      });

      it('refuses a caller who is not the competition admin', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition({ adminUserId: 'someone-else' })),
        );

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Renamed',
          }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('still lets the founding coach manage a legacy competition', async () => {
        // Rows predating the admin backfill carry a null adminUserId.
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition({ adminUserId: null })),
        );

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Renamed',
          }),
        ).resolves.toEqual({ id: COMPETITION });
      });

      it('refuses a legacy competition owned by another team', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(
            adminCompetition({ adminUserId: null, teamId: 'other-team' }),
          ),
        );

        await expect(
          service.updateCompetition('user-1', COMPETITION, {
            name: 'Renamed',
          }),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('deleteCompetition', () => {
      it('deletes a competition the caller administers', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition()),
        );

        await expect(
          service.deleteCompetition('user-1', COMPETITION),
        ).resolves.toEqual({ success: true });
        expect(mockDatabaseService.database.delete).toHaveBeenCalled();
      });

      it('refuses a non-admin', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable(adminCompetition({ adminUserId: 'someone-else' })),
        );

        await expect(
          service.deleteCompetition('user-1', COMPETITION),
        ).rejects.toThrow(ForbiddenException);
      });
    });

    describe('createStanding', () => {
      const dto = {
        teamName: 'Rovers',
        position: 3,
        played: 4,
        won: 2,
        drawn: 1,
        lost: 1,
        goalsFor: 7,
        goalsAgainst: 5,
        points: 7,
      };

      it('inserts a standing when nothing conflicts', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? adminCompetition() : []);
        });
        mockDatabaseService.database.insert.mockImplementation(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(() => Promise.resolve([{ id: STANDING }])),
          })),
        }));

        await expect(
          service.createStanding('user-1', COMPETITION, dto as never),
        ).resolves.toEqual({ id: STANDING });
      });

      it('rethrows a non-unique insert failure', async () => {
        const failure = new Error('connection reset');
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? adminCompetition() : []);
        });
        mockDatabaseService.database.insert.mockImplementation(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(() => Promise.reject(failure)),
          })),
        }));

        await expect(
          service.createStanding('user-1', COMPETITION, dto as never),
        ).rejects.toBe(failure);
      });

      it('maps a late unique violation to a conflict', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? adminCompetition() : []);
        });
        mockDatabaseService.database.insert.mockImplementation(() => ({
          values: jest.fn(() => ({
            returning: jest.fn(() => Promise.reject(uniqueViolation())),
          })),
        }));

        await expect(
          service.createStanding('user-1', COMPETITION, dto as never),
        ).rejects.toThrow(ConflictException);
      });
    });

    describe('updateStanding', () => {
      it('updates a standing in place when nothing changes identity', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? [standingRow()] : []);
        });
        mockDatabaseService.database.update.mockImplementation(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(() => Promise.resolve([{ id: STANDING }])),
            })),
          })),
        }));

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).resolves.toEqual({ id: STANDING });
        // Only the admin lookup ran; no conflict probe was needed.
        expect(mockDatabaseService.database.select).toHaveBeenCalledTimes(1);
      });

      it('probes for a conflict when the position changes', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? [standingRow()] : []);
        });

        await service.updateStanding('user-1', STANDING, {
          position: 4,
        });

        expect(mockDatabaseService.database.select).toHaveBeenCalledTimes(2);
      });

      it('rejects a position already taken in the competition', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(
            call === 1
              ? [standingRow()]
              : [{ position: 4, teamName: 'Another' }],
          );
        });

        await expect(
          service.updateStanding('user-1', STANDING, { position: 4 }),
        ).rejects.toThrow('position 4 already exists');
      });

      it('rejects a team name already taken in the competition', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(
            call === 1
              ? [standingRow()]
              : [{ position: 9, teamName: 'United' }],
          );
        });

        await expect(
          service.updateStanding('user-1', STANDING, {
            teamName: 'United',
          }),
        ).rejects.toThrow('"United" already exists');
      });

      it('maps a late unique violation to a conflict', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? [standingRow()] : []);
        });
        mockDatabaseService.database.update.mockImplementation(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(() => Promise.reject(uniqueViolation())),
            })),
          })),
        }));

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).rejects.toThrow(ConflictException);
      });

      it('rethrows an unrelated update failure', async () => {
        const failure = new Error('connection reset');
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(call === 1 ? [standingRow()] : []);
        });
        mockDatabaseService.database.update.mockImplementation(() => ({
          set: jest.fn(() => ({
            where: jest.fn(() => ({
              returning: jest.fn(() => Promise.reject(failure)),
            })),
          })),
        }));

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).rejects.toBe(failure);
      });

      it('reports an unknown standing as not found', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([]),
        );

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).rejects.toThrow(NotFoundException);
      });

      it('refuses a caller who does not administer the competition', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([standingRow({ competitionAdminUserId: 'someone-else' })]),
        );

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('still lets the founding coach edit a legacy standing', async () => {
        let call = 0;
        mockDatabaseService.database.select.mockImplementation(() => {
          call += 1;
          return thenable(
            call === 1 ? [standingRow({ competitionAdminUserId: null })] : [],
          );
        });

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).resolves.toBeDefined();
      });

      it('refuses a legacy standing owned by another team', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([
            standingRow({
              competitionAdminUserId: null,
              legacyOwnerTeamId: 'other-team',
            }),
          ]),
        );

        await expect(
          service.updateStanding('user-1', STANDING, { goalsFor: 9 }),
        ).rejects.toThrow(ForbiddenException);
      });

      it('validates the merged standing, not just the patch', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([standingRow()]),
        );

        await expect(
          service.updateStanding('user-1', STANDING, {
            position: -1,
          }),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('deleteStanding', () => {
      it('deletes a standing the caller administers', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([standingRow()]),
        );

        await expect(
          service.deleteStanding('user-1', STANDING),
        ).resolves.toEqual({ success: true });
        expect(mockDatabaseService.database.delete).toHaveBeenCalled();
      });

      it('refuses a non-admin', async () => {
        mockDatabaseService.database.select.mockImplementation(() =>
          thenable([standingRow({ competitionAdminUserId: 'someone-else' })]),
        );

        await expect(
          service.deleteStanding('user-1', STANDING),
        ).rejects.toThrow(ForbiddenException);
      });

      it('requires a team', async () => {
        mockTeamsService.findTeamForUser.mockResolvedValue(null);

        await expect(
          service.deleteStanding('user-1', STANDING),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });
});
