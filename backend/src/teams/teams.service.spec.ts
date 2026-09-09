import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { teamMembers } from '../database/schema';
import { TeamsService } from './teams.service';

/**
 * Stubs a drizzle select chain. Each queued `results` entry resolves one
 * `.limit()` call, in the order the service performs its selects.
 */
function selectChain(...results: unknown[][]) {
  const chain = {
    from: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn(),
  };
  for (const result of results) {
    chain.limit.mockResolvedValueOnce(result);
  }
  return chain;
}

describe('TeamsService', () => {
  let service: TeamsService;

  const mockDatabaseService = {
    database: {} as Record<string, unknown>,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamsService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<TeamsService>(TeamsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requireCoachTeam', () => {
    it('returns the team summary for a coach', async () => {
      const chain = selectChain([
        { id: 'team-id', name: 'Test Team', role: 'coach' },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.requireCoachTeam('coach-user-id')).resolves.toEqual({
        id: 'team-id',
        name: 'Test Team',
        role: 'coach',
      });
    });

    it('rejects an assistant with 403 even though they belong to the team', async () => {
      const chain = selectChain([
        { id: 'team-id', name: 'Test Team', role: 'assistant' },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      const rejection = service.requireCoachTeam('assistant-user-id');
      await expect(rejection).rejects.toBeInstanceOf(ForbiddenException);
      await expect(rejection).rejects.toThrow(
        'Only coaches can perform this action.',
      );
    });

    it('rejects a user with no team membership', async () => {
      const chain = selectChain([]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      const rejection = service.requireCoachTeam('teamless-user-id');
      await expect(rejection).rejects.toBeInstanceOf(ForbiddenException);
      await expect(rejection).rejects.toThrow(
        'No team associated with this account.',
      );
    });
  });

  describe('addAssistantMember', () => {
    it('inserts a membership with the role hardcoded to assistant', async () => {
      const values = jest.fn().mockResolvedValue(undefined);
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      await service.addAssistantMember('team-id', 'assistant-user-id');

      expect(insert).toHaveBeenCalledWith(teamMembers);
      expect(values).toHaveBeenCalledWith({
        teamId: 'team-id',
        userId: 'assistant-user-id',
        role: 'assistant',
      });
    });

    it('maps a unique-constraint violation to a 409 conflict', async () => {
      const values = jest
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('duplicate key'), { code: '23505' }),
        );
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      await expect(
        service.addAssistantMember('team-id', 'assistant-user-id'),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        service.addAssistantMember('team-id', 'assistant-user-id'),
      ).rejects.toThrow('This account already belongs to a team.');
    });

    it('rethrows unrelated database errors untouched', async () => {
      const dbError = new Error('connection reset');
      const values = jest.fn().mockRejectedValue(dbError);
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      await expect(
        service.addAssistantMember('team-id', 'assistant-user-id'),
      ).rejects.toBe(dbError);
    });
  });
});
