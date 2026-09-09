import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TeamsService } from '../teams/teams.service';
import { SeasonsService } from './seasons.service';

describe('SeasonsService', () => {
  let service: SeasonsService;

  const team = {
    id: 'team-1',
    name: 'Test Team',
    role: 'coach',
    primaryColor: null,
  };

  const season = {
    id: 'season-1',
    teamId: 'team-1',
    name: '2025/26',
    startDate: '2025-08-01',
    endDate: '2026-05-31',
    isCurrent: true,
    createdAt: new Date('2025-08-01T00:00:00.000Z'),
    updatedAt: new Date('2025-08-01T00:00:00.000Z'),
  };

  const mockTeamsService = { findTeamForUser: jest.fn() };

  /**
   * Thenable query-chain stub. Drizzle builders are awaitable, so every chained
   * method returns the same object and `await` resolves to `result`.
   */
  function thenable(result: unknown) {
    const obj: Record<string, unknown> = {};
    for (const method of [
      'from',
      'where',
      'orderBy',
      'limit',
      'set',
      'values',
      'returning',
    ]) {
      obj[method] = jest.fn(() => obj);
    }
    obj.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return obj;
  }

  const mockDatabaseService = {
    database: {
      select: jest.fn(() => thenable([])),
      insert: jest.fn(() => thenable([season])),
      update: jest.fn(() => thenable([season])),
      delete: jest.fn(() => thenable([])),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SeasonsService,
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get<SeasonsService>(SeasonsService);
    jest.clearAllMocks();
    mockTeamsService.findTeamForUser.mockResolvedValue(team);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('team scoping', () => {
    it('throws ForbiddenException when the user has no team', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue(null);

      await expect(service.listSeasons('user-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createSeason', () => {
    const dto = {
      name: '2025/26',
      startDate: '2025-08-01',
      endDate: '2026-05-31',
      isCurrent: false,
    };

    it('inserts when no existing season overlaps', async () => {
      // 1: overlap check -> none
      mockDatabaseService.database.select.mockReturnValueOnce(thenable([]));

      const result = await service.createSeason('user-1', dto);

      expect(result).toEqual(season);
      expect(mockDatabaseService.database.insert).toHaveBeenCalled();
    });

    it('rejects an overlapping range with the clashing season name', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(
        thenable([{ id: 'season-9', name: '2024/25' }]),
      );

      await expect(service.createSeason('user-1', dto)).rejects.toThrow(
        /Seasons cannot overlap.*2024\/25/,
      );
      expect(mockDatabaseService.database.insert).not.toHaveBeenCalled();
    });

    it('demotes the existing current season before inserting a new current one', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(thenable([]));

      await service.createSeason('user-1', { ...dto, isCurrent: true });

      // The clear-then-insert order matters: the partial unique index would
      // reject the insert if the old current season were still flagged.
      expect(mockDatabaseService.database.update).toHaveBeenCalledTimes(1);
      const updateOrder =
        mockDatabaseService.database.update.mock.invocationCallOrder[0];
      const insertOrder =
        mockDatabaseService.database.insert.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(insertOrder);
    });

    it('does not touch other seasons when the new one is not current', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(thenable([]));

      await service.createSeason('user-1', dto);

      expect(mockDatabaseService.database.update).not.toHaveBeenCalled();
    });
  });

  describe('updateSeason', () => {
    it('throws NotFoundException for a season on another team', async () => {
      // 1: requireSeason -> not found (the query is team-scoped)
      mockDatabaseService.database.select.mockReturnValueOnce(thenable([]));

      await expect(
        service.updateSeason('user-1', 'season-x', { name: 'Renamed' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('re-checks the merged range when only one end moves', async () => {
      // 1: requireSeason -> the stored 2025-08-01..2026-05-31 season
      mockDatabaseService.database.select.mockReturnValueOnce(
        thenable([season]),
      );

      // Moving the end before the stored start inverts the range.
      await expect(
        service.updateSeason('user-1', 'season-1', { endDate: '2025-07-01' }),
      ).rejects.toThrow(ConflictException);

      expect(mockDatabaseService.database.update).not.toHaveBeenCalled();
    });

    it('skips the overlap check when only the name changes', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(
        thenable([season]),
      );

      await service.updateSeason('user-1', 'season-1', { name: 'Renamed' });

      // requireSeason only — no second select for the overlap check.
      expect(mockDatabaseService.database.select).toHaveBeenCalledTimes(1);
      expect(mockDatabaseService.database.update).toHaveBeenCalledTimes(1);
    });

    it('excludes itself from the overlap check when moving its own dates', async () => {
      mockDatabaseService.database.select
        .mockReturnValueOnce(thenable([season])) // requireSeason
        .mockReturnValueOnce(thenable([])); // overlap check -> none

      await service.updateSeason('user-1', 'season-1', {
        endDate: '2026-06-30',
      });

      expect(mockDatabaseService.database.select).toHaveBeenCalledTimes(2);
      expect(mockDatabaseService.database.update).toHaveBeenCalledTimes(1);
    });

    it('demotes the previous current season before promoting this one', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(
        thenable([season]),
      );

      await service.updateSeason('user-1', 'season-1', { isCurrent: true });

      // One update to clear the flag elsewhere, one to write this season.
      expect(mockDatabaseService.database.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteSeason', () => {
    it('throws NotFoundException for a season on another team', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(thenable([]));

      await expect(service.deleteSeason('user-1', 'season-x')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockDatabaseService.database.delete).not.toHaveBeenCalled();
    });

    it('deletes an owned season', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(
        thenable([season]),
      );

      await expect(service.deleteSeason('user-1', 'season-1')).resolves.toEqual(
        {
          success: true,
        },
      );
      expect(mockDatabaseService.database.delete).toHaveBeenCalled();
    });
  });

  describe('resolveSeasonWindow', () => {
    it('returns the UTC instant range for an owned season', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(
        thenable([season]),
      );

      const { season: row, window } = await service.resolveSeasonWindow(
        'team-1',
        'season-1',
      );

      expect(row).toEqual(season);
      expect(window.start.toISOString()).toBe('2025-08-01T00:00:00.000Z');
      expect(window.end.toISOString()).toBe('2026-05-31T23:59:59.999Z');
    });

    it('throws NotFoundException rather than returning an empty window', async () => {
      mockDatabaseService.database.select.mockReturnValueOnce(thenable([]));

      await expect(
        service.resolveSeasonWindow('team-1', 'season-x'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
