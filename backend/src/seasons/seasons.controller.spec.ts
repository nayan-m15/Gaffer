import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import { SeasonsController } from './seasons.controller';
import { SeasonsService } from './seasons.service';

describe('SeasonsController', () => {
  let controller: SeasonsController;

  const user = {
    id: 'user-1',
    name: 'Coach',
    email: 'coach@test.com',
    emailVerified: true,
  };

  const mockSeasonsService = {
    listSeasons: jest.fn(),
    createSeason: jest.fn(),
    updateSeason: jest.fn(),
    deleteSeason: jest.fn(),
  };

  const mockTeamsService = { requireCoachTeam: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SeasonsController],
      providers: [
        { provide: SeasonsService, useValue: mockSeasonsService },
        { provide: TeamsService, useValue: mockTeamsService },
      ],
    }).compile();

    controller = module.get<SeasonsController>(SeasonsController);
    jest.clearAllMocks();
    mockTeamsService.requireCoachTeam.mockResolvedValue({
      id: 'team-1',
      role: 'coach',
    });
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lists seasons without requiring a coach — assistants filter stats too', async () => {
    mockSeasonsService.listSeasons.mockResolvedValue([]);

    await controller.list(user);

    expect(mockSeasonsService.listSeasons).toHaveBeenCalledWith('user-1');
    expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
  });

  it('requires a coach to create a season', async () => {
    mockSeasonsService.createSeason.mockResolvedValue({ id: 'season-1' });

    await controller.create(user, {
      name: '2025/26',
      startDate: '2025-08-01',
      endDate: '2026-05-31',
    });

    expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
    expect(mockSeasonsService.createSeason).toHaveBeenCalledWith('user-1', {
      name: '2025/26',
      startDate: '2025-08-01',
      endDate: '2026-05-31',
      isCurrent: false,
    });
  });

  it('requires a coach to update a season', async () => {
    mockSeasonsService.updateSeason.mockResolvedValue({ id: 'season-1' });

    await controller.update(user, 'season-1', { isCurrent: true });

    expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
    expect(mockSeasonsService.updateSeason).toHaveBeenCalledWith(
      'user-1',
      'season-1',
      { isCurrent: true },
    );
  });

  it('requires a coach to delete a season', async () => {
    mockSeasonsService.deleteSeason.mockResolvedValue({ success: true });

    await controller.remove(user, 'season-1');

    expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
    expect(mockSeasonsService.deleteSeason).toHaveBeenCalledWith(
      'user-1',
      'season-1',
    );
  });

  it('does not reach the service when the caller is not a coach', async () => {
    mockTeamsService.requireCoachTeam.mockRejectedValue(
      new ForbiddenException('Only coaches can perform this action.'),
    );

    await expect(controller.remove(user, 'season-1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockSeasonsService.deleteSeason).not.toHaveBeenCalled();
  });

  it('rejects an invalid payload before checking the role', async () => {
    await expect(
      controller.create(user, { name: '', startDate: 'nope', endDate: 'nope' }),
    ).rejects.toThrow();

    expect(mockSeasonsService.createSeason).not.toHaveBeenCalled();
  });
});
