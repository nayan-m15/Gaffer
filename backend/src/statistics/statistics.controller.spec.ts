import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { InsightsService } from '../insights/insights.service';
import { TeamsService } from '../teams/teams.service';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

describe('StatisticsController', () => {
  let controller: StatisticsController;

  const user = {
    id: 'user-1',
    name: 'Coach',
    email: 'coach@test.com',
    emailVerified: true,
  };

  const mockStatisticsService = {
    getOverview: jest.fn(),
    getAthleteStatistics: jest.fn(),
    compareAthletes: jest.fn(),
    getCompetitions: jest.fn(),
    createCompetition: jest.fn(),
    updateCompetition: jest.fn(),
    deleteCompetition: jest.fn(),
    createStanding: jest.fn(),
    updateStanding: jest.fn(),
    deleteStanding: jest.fn(),
    askAssistant: jest.fn(),
  };

  const mockTeamsService = {
    requireCoachTeam: jest.fn(),
    findTeamForUser: jest.fn(),
  };

  const mockInsightsService = {
    getSeasonInsight: jest.fn(),
    generateSeasonInsight: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatisticsController],
      providers: [
        { provide: StatisticsService, useValue: mockStatisticsService },
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: InsightsService, useValue: mockInsightsService },
      ],
    }).compile();

    controller = module.get<StatisticsController>(StatisticsController);
    jest.clearAllMocks();
    mockTeamsService.requireCoachTeam.mockResolvedValue({
      id: 'team-1',
      role: 'coach',
    });
    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-1',
      role: 'coach',
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls service.getOverview with userId and optional competitionId', async () => {
    mockStatisticsService.getOverview.mockResolvedValue({ matchesPlayed: 0 });

    await controller.getOverview(user, 'comp-1');

    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith('user-1', {
      competitionId: 'comp-1',
      seasonId: undefined,
    });
  });

  it('calls service.getOverview without filters when none are provided', async () => {
    mockStatisticsService.getOverview.mockResolvedValue({ matchesPlayed: 0 });

    await controller.getOverview(user, undefined);

    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith('user-1', {
      competitionId: undefined,
      seasonId: undefined,
    });
  });

  it('passes seasonId through to the overview', async () => {
    mockStatisticsService.getOverview.mockResolvedValue({ matchesPlayed: 0 });

    await controller.getOverview(user, undefined, 'season-1');

    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith('user-1', {
      competitionId: undefined,
      seasonId: 'season-1',
    });
  });

  it('calls service.getAthleteStatistics with userId and athlete id', async () => {
    mockStatisticsService.getAthleteStatistics.mockResolvedValue({
      appearances: 0,
    });

    await controller.getAthleteStatistics(user, 'athlete-1');

    expect(mockStatisticsService.getAthleteStatistics).toHaveBeenCalledWith(
      'user-1',
      'athlete-1',
    );
  });

  it('calls service.getCompetitions with userId', async () => {
    mockStatisticsService.getCompetitions.mockResolvedValue([]);

    await controller.getCompetitions(user);

    expect(mockStatisticsService.getCompetitions).toHaveBeenCalledWith(
      'user-1',
    );
  });

  describe('compareAthletes', () => {
    const idA = '11111111-1111-4111-8111-111111111111';
    const idB = '22222222-2222-4222-8222-222222222222';

    it('splits a comma-joined athleteIds param', async () => {
      mockStatisticsService.compareAthletes.mockResolvedValue({ athletes: [] });

      await controller.compareAthletes(user, `${idA},${idB}`, undefined);

      expect(mockStatisticsService.compareAthletes).toHaveBeenCalledWith(
        'user-1',
        {
          athleteIds: [idA, idB],
          seasonId: undefined,
        },
      );
    });

    it('rejects fewer than two athletes', async () => {
      await expect(
        controller.compareAthletes(user, idA, undefined),
      ).rejects.toThrow('Select at least two athletes to compare.');
      expect(mockStatisticsService.compareAthletes).not.toHaveBeenCalled();
    });

    it('rejects duplicate athletes', async () => {
      await expect(
        controller.compareAthletes(user, `${idA},${idA}`, undefined),
      ).rejects.toThrow('Select different athletes to compare.');
    });
  });

  describe('coach-only mutations', () => {
    it('keeps a standing PATCH partial instead of applying create defaults', async () => {
      mockStatisticsService.updateStanding.mockResolvedValue({
        id: 'standing-1',
      });

      await controller.updateStanding(user, 'standing-1', { won: 0 });

      expect(mockStatisticsService.updateStanding).toHaveBeenCalledWith(
        'user-1',
        'standing-1',
        { won: 0 },
      );
    });

    it.each([
      [
        'createCompetition',
        () => controller.createCompetition(user, { name: 'Cup', type: 'cup' }),
      ],
      [
        'updateCompetition',
        () => controller.updateCompetition(user, 'comp-1', { name: 'Renamed' }),
      ],
      ['deleteCompetition', () => controller.deleteCompetition(user, 'comp-1')],
      ['deleteStanding', () => controller.deleteStanding(user, 'standing-1')],
    ])('%s requires a coach', async (_name, call) => {
      await call();

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
    });

    it('does not reach the service when the caller is not a coach', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );

      await expect(
        controller.deleteCompetition(user, 'comp-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockStatisticsService.deleteCompetition).not.toHaveBeenCalled();
    });

    it('leaves reads open to assistants', async () => {
      mockStatisticsService.getOverview.mockResolvedValue({ matchesPlayed: 0 });

      await controller.getOverview(user, undefined);

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
    });
  });

  describe('season insight', () => {
    it("reads the season insight for the caller's team without requiring a coach", async () => {
      mockInsightsService.getSeasonInsight.mockResolvedValue({
        status: 'ready',
      });

      await controller.getSeasonInsight(user, 'season-1');

      expect(mockTeamsService.findTeamForUser).toHaveBeenCalledWith('user-1');
      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockInsightsService.getSeasonInsight).toHaveBeenCalledWith(
        'team-1',
        'season-1',
      );
    });

    it('passes a null seasonId through for the all-time overview', async () => {
      mockInsightsService.getSeasonInsight.mockResolvedValue(null);

      const result = await controller.getSeasonInsight(user, undefined);

      expect(mockInsightsService.getSeasonInsight).toHaveBeenCalledWith(
        'team-1',
        null,
      );
      expect(result).toEqual({
        teamId: 'team-1',
        seasonId: null,
        status: 'unavailable',
      });
    });

    it('requires a coach to generate a season insight', async () => {
      mockInsightsService.generateSeasonInsight.mockResolvedValue({
        status: 'ready',
      });
      const seasonId = '11111111-1111-4111-8111-111111111111';

      await controller.generateSeasonInsight(user, { seasonId });

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
      expect(mockInsightsService.generateSeasonInsight).toHaveBeenCalledWith(
        'team-1',
        seasonId,
        'user-1',
      );
    });

    it('does not reach the service when the caller is not a coach', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );

      await expect(controller.generateSeasonInsight(user, {})).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockInsightsService.generateSeasonInsight).not.toHaveBeenCalled();
    });
  });

  describe('assistant', () => {
    it('validates and forwards the question to the service', async () => {
      mockStatisticsService.askAssistant.mockResolvedValue({
        status: 'ready',
        answer: 'Sam Rivers, with 5 goals.',
      });

      const result = await controller.askAssistant(user, {
        question: 'Who scored the most goals?',
      });

      expect(result).toEqual({
        status: 'ready',
        answer: 'Sam Rivers, with 5 goals.',
      });
      expect(mockStatisticsService.askAssistant).toHaveBeenCalledWith(
        'user-1',
        { question: 'Who scored the most goals?' },
      );
    });

    it('rejects a question that is too short', async () => {
      await expect(
        controller.askAssistant(user, { question: 'hi' }),
      ).rejects.toThrow();
      expect(mockStatisticsService.askAssistant).not.toHaveBeenCalled();
    });

    it('rejects a question over the length limit', async () => {
      await expect(
        controller.askAssistant(user, { question: 'x'.repeat(301) }),
      ).rejects.toThrow();
      expect(mockStatisticsService.askAssistant).not.toHaveBeenCalled();
    });

    it('does not require the caller to be a coach', async () => {
      mockStatisticsService.askAssistant.mockResolvedValue({
        status: 'ready',
        answer: 'An answer.',
      });

      await controller.askAssistant(user, { question: 'How are we doing?' });

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
    });
  });
});
