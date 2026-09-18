import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PublicDashboardController } from './public-dashboard.controller';
import { PublicDashboardService } from './public-dashboard.service';

describe('PublicDashboardController', () => {
  let controller: PublicDashboardController;
  const service = {
    getFilters: jest.fn(),
    getMatches: jest.fn(),
    getPlayers: jest.fn(),
    getTeamStatistics: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicDashboardController],
      providers: [{ provide: PublicDashboardService, useValue: service }],
    }).compile();
    controller = module.get(PublicDashboardController);
  });

  it('returns public filters without requiring an authenticated user', async () => {
    const data = { teams: [], competitions: [], seasons: [] };
    service.getFilters.mockResolvedValue(data);

    await expect(controller.filters()).resolves.toEqual({
      success: true,
      data,
    });
  });

  it('validates and forwards match filters and pagination', async () => {
    service.getMatches.mockResolvedValue([{ id: 'match-1' }]);
    const teamId = '83ff97e6-a665-4605-9e72-c6f810d90202';

    await expect(
      controller.matches({ teamId, status: 'completed', limit: '20' }),
    ).resolves.toMatchObject({
      success: true,
      count: 1,
      limit: 20,
      offset: 0,
    });
    expect(service.getMatches).toHaveBeenCalledWith({
      teamId,
      status: 'completed',
      limit: 20,
      offset: 0,
    });
  });

  it('rejects invalid ids and unsupported match statuses', async () => {
    await expect(controller.players({ teamId: 'not-a-uuid' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(controller.matches({ status: 'private' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
