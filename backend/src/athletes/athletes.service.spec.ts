import { Test, TestingModule } from '@nestjs/testing';
import { SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { athletes, playerClaimInvites, teams } from '../database/schema';
import { AthletesService } from './athletes.service';

describe('AthletesService', () => {
  let service: AthletesService;

  const mockDatabaseService = {
    database: {},
  };

  /**
   * Creates a thenable select-chain stub. Drizzle query builders are
   * awaitable (they expose `.then`), so every chained method returns the
   * same object and `await` resolves to `result`.
   */
  function selectChain(result: unknown) {
    const chain: Record<string, unknown> = {
      from: jest.fn(() => chain),
      innerJoin: jest.fn(() => chain),
      leftJoin: jest.fn(() => chain),
      where: jest.fn(() => chain),
      groupBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AthletesService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<AthletesService>(AthletesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('persists the provided status', async () => {
      const athlete = { id: 'athlete-id', status: 'injured' };
      const returning = jest.fn().mockResolvedValue([athlete]);
      const values = jest.fn().mockReturnValue({ returning });
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      const result = await service.create('team-id', {
        firstName: 'Alex',
        lastName: 'Morgan',
        status: 'injured',
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-id', status: 'injured' }),
      );
      expect(result).toBe(athlete);
    });

    it('omits status when not provided so the database default applies', async () => {
      const athlete = { id: 'athlete-id', status: 'available' };
      const returning = jest.fn().mockResolvedValue([athlete]);
      const values = jest.fn().mockReturnValue({ returning });
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      const result = await service.create('team-id', {
        firstName: 'Alex',
        lastName: 'Morgan',
      });

      // The status key must be absent entirely so the column default
      // ('available') applies on insert.
      expect(values).toHaveBeenCalledWith({
        teamId: 'team-id',
        firstName: 'Alex',
        lastName: 'Morgan',
      });
      expect(result).toBe(athlete);
    });
  });

  describe('findAll', () => {
    it('derives claimStatus via a left join in a single query, not per-row lookups', async () => {
      const rows = [
        { id: 'athlete-1', claimStatus: 'unclaimed' },
        { id: 'athlete-2', claimStatus: 'invited' },
      ];
      const chain = selectChain(rows);
      const select = jest.fn().mockReturnValue(chain);
      mockDatabaseService.database = { select };

      const result = await service.findAll('team-id');

      expect(result).toBe(rows);
      // One query for the whole roster — claimStatus must never trigger a
      // per-athlete lookup.
      expect(select).toHaveBeenCalledTimes(1);
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ claimStatus: expect.any(SQL) as SQL }),
      );
      expect(chain.from).toHaveBeenCalledWith(athletes);
      expect(chain.leftJoin).toHaveBeenCalledWith(
        playerClaimInvites,
        expect.any(SQL),
      );
      expect(chain.groupBy).toHaveBeenCalledWith(athletes.id);
    });
  });

  describe('findOne', () => {
    it('derives claimStatus via the same left join', async () => {
      const athlete = { id: 'athlete-id', claimStatus: 'claimed' };
      const chain = selectChain([athlete]);
      const select = jest.fn().mockReturnValue(chain);
      mockDatabaseService.database = { select };

      const result = await service.findOne('team-id', 'athlete-id');

      expect(result).toBe(athlete);
      expect(select).toHaveBeenCalledTimes(1);
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ claimStatus: expect.any(SQL) as SQL }),
      );
      expect(chain.leftJoin).toHaveBeenCalledWith(
        playerClaimInvites,
        expect.any(SQL),
      );
      expect(chain.groupBy).toHaveBeenCalledWith(athletes.id);
      expect(chain.limit).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when the athlete is not found', async () => {
      const chain = selectChain([]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.findOne('team-id', 'missing-id')).rejects.toThrow(
        'Athlete not found.',
      );
    });
  });

  describe('findClaimedByUser', () => {
    it('returns claimed athletes joined to their team name', async () => {
      const summaries = [
        {
          id: 'athlete-1',
          teamId: 'team-1',
          teamName: 'Riverside FC',
          firstName: 'Alex',
          lastName: 'Morgan',
          position: 'ST',
          squadNumber: 9,
        },
      ];
      const chain = selectChain(summaries);
      const select = jest.fn().mockReturnValue(chain);
      mockDatabaseService.database = { select };

      const result = await service.findClaimedByUser('user-id');

      expect(result).toBe(summaries);
      expect(chain.from).toHaveBeenCalledWith(athletes);
      expect(chain.innerJoin).toHaveBeenCalledWith(teams, expect.any(SQL));
      expect(chain.where).toHaveBeenCalled();
    });

    it('returns an empty array, never null, when nothing is claimed', async () => {
      const chain = selectChain([]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.findClaimedByUser('user-id')).resolves.toEqual([]);
    });
  });

  describe('update', () => {
    it('updates the athlete status', async () => {
      const athlete = { id: 'athlete-id', status: 'suspended' };
      const returning = jest.fn().mockResolvedValue([athlete]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      mockDatabaseService.database = { update };

      const result = await service.update('team-id', 'athlete-id', {
        status: 'suspended',
      });

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      );
      expect(result).toBe(athlete);
    });
  });

  describe('archived athletes', () => {
    it('lists the archived squad', async () => {
      const chain = selectChain([{ id: 'athlete-1', archivedAt: new Date() }]);
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await expect(service.findArchived('team-1')).resolves.toHaveLength(1);
    });

    it('returns an empty list when nothing is archived', async () => {
      const chain = selectChain([]);
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await expect(service.findArchived('team-1')).resolves.toEqual([]);
    });
  });

  describe('resolving a claimed athlete', () => {
    it('returns the first athlete this user claimed', async () => {
      const chain: Record<string, unknown> = selectChain([
        { id: 'athlete-1', teamId: 'team-1' },
      ]);
      chain.orderBy = jest.fn(() => chain);
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await expect(
        service.findClaimedAthleteForUser('user-1'),
      ).resolves.toMatchObject({ id: 'athlete-1' });
    });

    it('narrows to a specific athlete id when one is given', async () => {
      const chain: Record<string, unknown> = selectChain([{ id: 'athlete-2' }]);
      chain.orderBy = jest.fn(() => chain);
      const where = jest.fn(() => chain);
      chain.where = where;
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await service.findClaimedAthleteForUser('user-1', 'athlete-2');

      // Both the user and the athlete id scope the lookup.
      expect(where).toHaveBeenCalledTimes(1);
      const [condition] = where.mock.calls[0] as [SQL];
      expect(condition).toBeDefined();
    });

    it('returns null when the user has claimed nobody', async () => {
      const chain: Record<string, unknown> = selectChain([]);
      chain.orderBy = jest.fn(() => chain);
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await expect(
        service.findClaimedAthleteForUser('user-1'),
      ).resolves.toBeNull();
    });

    it('resolves the athlete a user claimed on a specific team', async () => {
      const chain = selectChain([{ id: 'athlete-1' }]);
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await expect(
        service.findClaimedAthleteOnTeam('user-1', 'team-1'),
      ).resolves.toEqual({ id: 'athlete-1' });
    });

    it('returns null when the user claimed nobody on that team', async () => {
      const chain = selectChain([]);
      mockDatabaseService.database = { select: jest.fn(() => chain) };

      await expect(
        service.findClaimedAthleteOnTeam('user-1', 'team-1'),
      ).resolves.toBeNull();
    });
  });

  describe('archive and restore', () => {
    /** Stubs `update(...).set(...).where(...).returning()`. */
    const updateReturning = (rows: unknown[]) => {
      const returning = jest.fn(() => Promise.resolve(rows));
      mockDatabaseService.database = {
        update: jest.fn(() => ({
          set: jest.fn(() => ({ where: jest.fn(() => ({ returning })) })),
        })),
      };
      return returning;
    };

    it('archives an athlete', async () => {
      updateReturning([{ id: 'athlete-1' }]);

      await expect(service.archive('team-1', 'athlete-1')).resolves.toEqual({
        id: 'athlete-1',
      });
    });

    it('reports an already-archived or foreign athlete as not found', async () => {
      updateReturning([]);

      await expect(service.archive('team-1', 'athlete-1')).rejects.toThrow(
        'Athlete not found.',
      );
    });

    it('restores an archived athlete', async () => {
      updateReturning([{ id: 'athlete-1' }]);

      await expect(service.restore('team-1', 'athlete-1')).resolves.toEqual({
        id: 'athlete-1',
      });
    });

    it('reports an unknown athlete as not found on restore', async () => {
      updateReturning([]);

      await expect(service.restore('team-1', 'athlete-1')).rejects.toThrow(
        'Athlete not found.',
      );
    });
  });
});
