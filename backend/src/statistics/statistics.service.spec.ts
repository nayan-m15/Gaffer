import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
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

  it('throws ForbiddenException from getCompetitions when no team', async () => {
    mockTeamsService.findTeamForUser.mockResolvedValue(null);

    await expect(service.getCompetitions('user-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
