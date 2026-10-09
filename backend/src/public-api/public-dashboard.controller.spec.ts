import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PublicDashboardCacheService } from './public-dashboard-cache.service';
import { PublicDashboardController } from './public-dashboard.controller';
import { PublicDashboardRateLimitService } from './public-dashboard-rate-limit.service';
import { PublicDashboardService } from './public-dashboard.service';

describe('PublicDashboardController', () => {
  let controller: PublicDashboardController;
  let cache: PublicDashboardCacheService;
  const service = {
    getFilters: jest.fn(),
    getMatches: jest.fn(),
    getMatchSummary: jest.fn().mockResolvedValue({ total: 1, cleanSheets: 1 }),
    getPlayers: jest.fn(),
    getTeamStatistics: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicDashboardController],
      providers: [
        { provide: PublicDashboardService, useValue: service },
        PublicDashboardCacheService,
        // The controller's guard is instantiated with it, so its collaborator
        // has to be resolvable even though these tests call methods directly.
        PublicDashboardRateLimitService,
      ],
    }).compile();
    controller = module.get(PublicDashboardController);
    cache = module.get(PublicDashboardCacheService);
    cache.clear();
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

  it('rejects a player page larger than the public cap (SEC-008)', async () => {
    await expect(controller.players({ limit: '500' })).rejects.toThrow(
      BadRequestException,
    );
    expect(service.getPlayers).not.toHaveBeenCalled();
  });

  it('reuses complete match summaries across pages of the same filters', async () => {
    service.getMatches.mockResolvedValue([]);
    await controller.matches({ limit: 1, offset: 0, status: 'completed' });
    const second = await controller.matches({
      limit: 1,
      offset: 1,
      status: 'completed',
    });
    expect(second.summary).toEqual({ total: 1, cleanSheets: 1 });
    expect(service.getMatches).toHaveBeenCalledTimes(2);
    expect(service.getMatchSummary).toHaveBeenCalledTimes(1);
    expect(service.getMatchSummary).toHaveBeenCalledWith({
      teamId: undefined,
      competitionId: undefined,
      seasonId: undefined,
      status: 'completed',
    });
  });

  it('validates player search and position filters before forwarding them', async () => {
    service.getPlayers.mockResolvedValue([]);
    await controller.players({ search: '  Ari  ', position: 'GK', limit: 40 });
    expect(service.getPlayers).toHaveBeenCalledWith({
      search: 'Ari',
      position: 'GK',
      limit: 40,
      offset: 0,
    });
    await expect(
      controller.players({ search: 'a'.repeat(101) }),
    ).rejects.toThrow(BadRequestException);
    await expect(controller.players({ position: 'unknown' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      controller.players({ search: ['Ari', 'Sam'] }),
    ).rejects.toThrow(BadRequestException);
  });

  describe('response caching (SEC-008)', () => {
    it('serves a repeated identical request without re-querying', async () => {
      service.getPlayers.mockResolvedValue([{ id: 'player-1' }]);

      await controller.players({ limit: '100' });
      await controller.players({ limit: '100' });

      expect(service.getPlayers).toHaveBeenCalledTimes(1);
    });

    it('treats equivalent queries as the same request', async () => {
      service.getMatches.mockResolvedValue([]);
      const teamId = '83ff97e6-a665-4605-9e72-c6f810d90202';

      await controller.matches({ teamId, limit: '20', offset: '0' });
      // Same resolved DTO, written in a different order.
      await controller.matches({ offset: '0', limit: '20', teamId });

      expect(service.getMatches).toHaveBeenCalledTimes(1);
    });

    it('still queries separately for different filters', async () => {
      service.getPlayers.mockResolvedValue([]);

      await controller.players({
        teamId: '83ff97e6-a665-4605-9e72-c6f810d90202',
      });
      await controller.players({
        teamId: '0a4b2d16-1f2c-4f0e-9c5a-2a5a4a9c1b33',
      });

      expect(service.getPlayers).toHaveBeenCalledTimes(2);
    });

    it('does not let one route read another route’s cached payload', async () => {
      service.getPlayers.mockResolvedValue([{ id: 'player-1' }]);
      service.getTeamStatistics.mockResolvedValue([{ id: 'standing-1' }]);

      await controller.players({});
      await expect(controller.teamStatistics({})).resolves.toMatchObject({
        data: [{ id: 'standing-1' }],
      });
    });
  });
});
