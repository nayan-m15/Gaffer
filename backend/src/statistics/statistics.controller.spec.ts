import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

describe('StatisticsController', () => {
  let controller: StatisticsController;

  const mockStatisticsService = {
    getOverview: jest.fn(),
    getAthleteStatistics: jest.fn(),
    getCompetitions: jest.fn(),
    createCompetition: jest.fn(),
    updateCompetition: jest.fn(),
    deleteCompetition: jest.fn(),
    createStanding: jest.fn(),
    updateStanding: jest.fn(),
    deleteStanding: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatisticsController],
      providers: [
        { provide: StatisticsService, useValue: mockStatisticsService },
      ],
    }).compile();

    controller = module.get<StatisticsController>(StatisticsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('calls service.getOverview with userId and optional competitionId', async () => {
    mockStatisticsService.getOverview.mockResolvedValue({ matchesPlayed: 0 });

    await controller.getOverview(
      {
        id: 'user-1',
        name: 'Coach',
        email: 'coach@test.com',
        emailVerified: true,
      },
      'comp-1',
    );

    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith(
      'user-1',
      'comp-1',
    );
  });

  it('calls service.getOverview without competitionId when not provided', async () => {
    mockStatisticsService.getOverview.mockResolvedValue({ matchesPlayed: 0 });

    await controller.getOverview(
      {
        id: 'user-1',
        name: 'Coach',
        email: 'coach@test.com',
        emailVerified: true,
      },
      undefined,
    );

    expect(mockStatisticsService.getOverview).toHaveBeenCalledWith(
      'user-1',
      undefined,
    );
  });

  it('calls service.getAthleteStatistics with userId and athlete id', async () => {
    mockStatisticsService.getAthleteStatistics.mockResolvedValue({
      appearances: 0,
    });

    await controller.getAthleteStatistics(
      {
        id: 'user-1',
        name: 'Coach',
        email: 'coach@test.com',
        emailVerified: true,
      },
      'athlete-1',
    );

    expect(mockStatisticsService.getAthleteStatistics).toHaveBeenCalledWith(
      'user-1',
      'athlete-1',
    );
  });

  it('calls service.getCompetitions with userId', async () => {
    mockStatisticsService.getCompetitions.mockResolvedValue([]);

    await controller.getCompetitions({
      id: 'user-1',
      name: 'Coach',
      email: 'coach@test.com',
      emailVerified: true,
    });

    expect(mockStatisticsService.getCompetitions).toHaveBeenCalledWith(
      'user-1',
    );
  });
});
