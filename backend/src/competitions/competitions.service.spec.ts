import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { competitions, competitionTeams } from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { CompetitionsService } from './competitions.service';

const team = {
  id: 'team-1',
  name: 'Team One',
  role: 'coach' as const,
  primaryColor: null,
};

const competitionRow = {
  id: 'comp-1',
  teamId: 'team-1',
  name: 'Durban Sunday League',
  type: 'league' as const,
  seasonId: null,
  season: null,
  adminUserId: 'coach-user-id',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

const participantRow = {
  id: 'participant-1',
  competitionId: 'comp-1',
  teamId: 'team-1',
  displayName: 'Team One',
  createdAt: new Date('2026-09-01T00:00:00.000Z'),
  updatedAt: new Date('2026-09-01T00:00:00.000Z'),
};

/**
 * Stubs a drizzle select chain resolving to `result`. The builder is itself
 * thenable so queries without a terminal `.limit()` (search/mine/lists) also
 * resolve when awaited.
 */
function selectChain(result: unknown[]) {
  const promise = Promise.resolve(result);
  const chain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
    then: (
      resolve: (value: unknown[]) => unknown[] | PromiseLike<unknown[]>,
      reject: (reason?: unknown) => unknown,
    ) => promise.then(resolve, reject),
  };
  return chain;
}

/** Stubs a drizzle insert chain resolving `.returning()` to `rows`. */
function insertChain(rows: unknown[] = []) {
  return {
    values: jest.fn(() => ({
      returning: jest.fn(() => Promise.resolve(rows)),
    })),
  };
}

/** A Postgres 23505 violation shaped the way the neon driver surfaces it. */
function uniqueViolation(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint'),
    { code: '23505' },
  );
}

/** Stubs a drizzle insert chain whose `.returning()` rejects with `error`. */
function failingInsert(error: Error) {
  return {
    values: jest.fn(() => ({
      returning: jest.fn(() => Promise.reject(error)),
    })),
  };
}

describe('CompetitionsService', () => {
  let service: CompetitionsService;

  const mockDatabaseService = {
    database: {} as Record<string, unknown>,
  };

  const mockTeamsService = {
    requireCoachTeam: jest.fn(),
    findTeamForUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitionsService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    service = module.get<CompetitionsService>(CompetitionsService);

    mockTeamsService.requireCoachTeam.mockResolvedValue(team);
    mockTeamsService.findTeamForUser.mockResolvedValue(team);
  });

  describe('create', () => {
    it('makes the creator the admin and auto-inserts their team as a participant', async () => {
      const nameCheck = selectChain([]); // assertNameAvailable -> no conflict
      const insertCompetition = insertChain([competitionRow]);
      const insertParticipant = insertChain([participantRow]);
      const participantsList = selectChain([participantRow]);
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(nameCheck)
          .mockReturnValueOnce(participantsList),
        insert: jest
          .fn()
          .mockReturnValueOnce(insertCompetition)
          .mockReturnValueOnce(insertParticipant),
      };

      const result = await service.create('coach-user-id', {
        name: 'Durban Sunday League',
        type: 'league',
      });

      expect(result.isAdmin).toBe(true);
      expect(result.id).toBe('comp-1');
      expect(result.participants).toMatchObject([
        {
          id: 'participant-1',
          displayName: 'Team One',
          teamId: 'team-1',
          createdAt: participantRow.createdAt,
        },
      ]);

      // The competition row records both the legacy teamId and the new admin.
      expect(insertCompetition.values).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-1',
          name: 'Durban Sunday League',
          type: 'league',
          adminUserId: 'coach-user-id',
        }),
      );

      // The creator's team is inserted as the founding participant.
      expect(insertParticipant.values).toHaveBeenCalledWith({
        competitionId: 'comp-1',
        teamId: 'team-1',
        displayName: 'Team One',
      });
    });

    it('rejects a duplicate competition name before inserting', async () => {
      const nameCheck = selectChain([{ id: 'existing-comp' }]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(nameCheck),
        insert: jest.fn(),
      };

      await expect(
        service.create('coach-user-id', {
          name: 'Durban Sunday League',
          type: 'league',
        }),
      ).rejects.toThrow(ConflictException);
      expect(mockDatabaseService.database.insert).not.toHaveBeenCalled();
    });

    it('maps a unique-index race violation to the same conflict', async () => {
      const nameCheck = selectChain([]);
      const insertCompetition = failingInsert(uniqueViolation());
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(nameCheck),
        insert: jest.fn().mockReturnValueOnce(insertCompetition),
      };

      await expect(
        service.create('coach-user-id', {
          name: 'Durban Sunday League',
          type: 'league',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a coach without a team', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('No team associated with this account.'),
      );

      await expect(
        service.create('assistant-user-id', {
          name: 'Durban Sunday League',
          type: 'league',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('rejects a non-admin with the same 404 as an unknown competition', async () => {
      const adminCheck = selectChain([
        { ...competitionRow, adminUserId: 'someone-else' },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(adminCheck),
        update: jest.fn(),
      };

      await expect(
        service.update('coach-user-id', 'comp-1', { name: 'Renamed' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockDatabaseService.database.update).not.toHaveBeenCalled();
    });

    it('lets the admin rename, excluding the competition itself from the duplicate check', async () => {
      const adminCheck = selectChain([competitionRow]);
      const nameCheck = selectChain([]); // same name, excluded by id
      const updateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest
              .fn()
              .mockResolvedValue([{ ...competitionRow, name: 'Renamed' }]),
          }),
        }),
      };
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(adminCheck)
          .mockReturnValueOnce(nameCheck),
        update: jest.fn().mockReturnValue(updateChain),
      };

      const result = await service.update('coach-user-id', 'comp-1', {
        name: 'Renamed',
      });

      expect(result.name).toBe('Renamed');
      expect(result.isAdmin).toBe(true);
    });
  });

  describe('remove', () => {
    it('lets the admin delete and rejects anyone else', async () => {
      const adminCheck = selectChain([competitionRow]);
      const deleteChain = {
        where: jest.fn().mockResolvedValue(undefined),
      };
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(adminCheck),
        delete: jest.fn().mockReturnValue(deleteChain),
      };

      await expect(service.remove('coach-user-id', 'comp-1')).resolves.toBe(
        undefined,
      );
      expect(mockDatabaseService.database.delete).toHaveBeenCalledWith(
        competitions,
      );

      const otherCheck = selectChain([
        { ...competitionRow, adminUserId: 'someone-else' },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(otherCheck),
        delete: jest.fn(),
      };
      await expect(service.remove('coach-user-id', 'comp-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('addParticipant', () => {
    it('adds an unlinked participant slot for the admin', async () => {
      const adminCheck = selectChain([competitionRow]);
      const insertParticipant = insertChain([
        {
          id: 'participant-2',
          competitionId: 'comp-1',
          teamId: null,
          displayName: 'Riverside FC',
          createdAt: participantRow.createdAt,
          updatedAt: participantRow.updatedAt,
        },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(adminCheck),
        insert: jest.fn().mockReturnValueOnce(insertParticipant),
      };

      const result = await service.addParticipant('coach-user-id', 'comp-1', {
        displayName: 'Riverside FC',
      });

      expect(result).toEqual({
        id: 'participant-2',
        displayName: 'Riverside FC',
        teamId: null,
        createdAt: participantRow.createdAt,
      });
      expect(insertParticipant.values).toHaveBeenCalledWith({
        competitionId: 'comp-1',
        teamId: null,
        displayName: 'Riverside FC',
      });
    });

    it('rejects a duplicate participant with a conflict', async () => {
      const adminCheck = selectChain([competitionRow]);
      const insertParticipant = failingInsert(uniqueViolation());
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(adminCheck),
        insert: jest.fn().mockReturnValueOnce(insertParticipant),
      };

      await expect(
        service.addParticipant('coach-user-id', 'comp-1', {
          displayName: 'Riverside FC',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a non-admin', async () => {
      const adminCheck = selectChain([
        { ...competitionRow, adminUserId: 'someone-else' },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(adminCheck),
        insert: jest.fn(),
      };

      await expect(
        service.addParticipant('coach-user-id', 'comp-1', {
          displayName: 'Riverside FC',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockDatabaseService.database.insert).not.toHaveBeenCalled();
    });
  });

  describe('removeParticipant', () => {
    it('refuses to remove the admin team and removes other slots', async () => {
      const adminCheck = selectChain([competitionRow]);
      const ownTeamSlot = selectChain([
        { id: 'participant-1', teamId: 'team-1' },
      ]);
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(adminCheck)
          .mockReturnValueOnce(ownTeamSlot),
        delete: jest.fn(),
      };

      await expect(
        service.removeParticipant('coach-user-id', 'comp-1', 'participant-1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockDatabaseService.database.delete).not.toHaveBeenCalled();

      const otherSlot = selectChain([
        { id: 'participant-2', teamId: 'team-2' },
      ]);
      const deleteChain = {
        where: jest.fn().mockResolvedValue(undefined),
      };
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(adminCheck)
          .mockReturnValueOnce(otherSlot),
        delete: jest.fn().mockReturnValue(deleteChain),
      };

      await expect(
        service.removeParticipant('coach-user-id', 'comp-1', 'participant-2'),
      ).resolves.toBe(undefined);
      expect(mockDatabaseService.database.delete).toHaveBeenCalledWith(
        competitionTeams,
      );
    });

    it('404s a participant from another competition', async () => {
      const adminCheck = selectChain([competitionRow]);
      const foreignSlot = selectChain([]); // scoped by competitionId
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(adminCheck)
          .mockReturnValueOnce(foreignSlot),
        delete: jest.fn(),
      };

      await expect(
        service.removeParticipant('coach-user-id', 'comp-1', 'participant-9'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('returns participant-backed standings with alphabetical fallback positions', async () => {
      const competition = selectChain([
        {
          id: 'comp-1',
          name: 'Durban Sunday League',
          type: 'league',
          season: null,
          seasonId: null,
          isAdmin: false,
          createdAt: competitionRow.createdAt,
        },
      ]);
      const participants = selectChain([
        participantRow,
        {
          ...participantRow,
          id: 'participant-2',
          teamId: 'team-2',
          displayName: 'Riverside FC',
        },
        {
          ...participantRow,
          id: 'participant-3',
          teamId: 'team-3',
          displayName: 'Albion FC',
        },
      ]);
      const storedStandings = selectChain([
        {
          id: 'standing-1',
          competitionId: 'comp-1',
          teamName: 'Team One',
          position: 1,
          played: 2,
          won: 2,
          drawn: 0,
          lost: 0,
          goalsFor: 5,
          goalsAgainst: 1,
          points: 6,
        },
      ]);
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(competition)
          .mockReturnValueOnce(participants)
          .mockReturnValueOnce(storedStandings),
      };

      const result = await service.findOne('assistant-user-id', 'comp-1');

      expect(result.standings).toEqual([
        expect.objectContaining({
          teamName: 'Team One',
          position: 1,
          played: 2,
          points: 6,
          isOwnTeam: true,
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
          isOwnTeam: false,
        }),
      ]);
      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
    });
  });

  describe('listMine', () => {
    it('is scoped by the caller team participant membership', async () => {
      const mineChain = selectChain([
        {
          id: 'comp-1',
          name: 'Durban Sunday League',
          type: 'league',
          season: null,
          seasonId: null,
          isAdmin: true,
          createdAt: competitionRow.createdAt,
          participantCount: 2,
        },
      ]);
      const select = jest.fn().mockReturnValueOnce(mineChain);
      mockDatabaseService.database = { select };

      const result = await service.listMine('coach-user-id');

      expect(result).toHaveLength(1);
      expect(result[0].participantCount).toBe(2);
      // Read access resolves any team member (coach or assistant) without
      // applying the coach-only mutation gate.
      expect(mockTeamsService.findTeamForUser).toHaveBeenCalledWith(
        'coach-user-id',
      );
      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
    });
  });
});
