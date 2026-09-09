import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { teamInvites } from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { TeamInvitesService } from './team-invites.service';

// `crypto.randomBytes(32).toString('base64url')` shape — 43 URL-safe chars.
const TOKEN = 'a'.repeat(43);

const pendingInvite = {
  id: 'invite-id',
  teamId: 'team-id',
  email: 'assistant@example.com',
  tokenHash: 'stored-hash',
  status: 'pending',
  createdByUserId: 'coach-user-id',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  usedAt: null,
  usedByUserId: null,
};

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

describe('TeamInvitesService', () => {
  let service: TeamInvitesService;

  const mockDatabaseService = {
    database: {} as Record<string, unknown>,
  };

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
    addAssistantMember: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamInvitesService,
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

    service = module.get<TeamInvitesService>(TeamInvitesService);

    mockTeamsService.findTeamForUser.mockResolvedValue(null);
    mockTeamsService.addAssistantMember.mockResolvedValue(undefined);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvite', () => {
    it('returns a 72-hour one-time join link and stores only its sha256 hash', async () => {
      const updateChain = {
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      };
      const update = jest.fn().mockReturnValue(updateChain);
      const values = jest.fn().mockResolvedValue(undefined);
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { update, insert };

      const before = Date.now();
      const result = await service.createInvite(
        'team-id',
        'assistant@example.com',
        'coach-user-id',
      );

      // The raw token is URL-safe and appears only in this response.
      expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.inviteUrl).toContain(`/join-team/${result.token}`);
      expect(result.email).toBe('assistant@example.com');

      // Fixed 72-hour expiry (allowing a small clock buffer).
      expect(result.expiresAt.getTime()).toBeGreaterThan(
        before + 71 * 60 * 60 * 1000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 72 * 60 * 60 * 1000 + 1000,
      );

      // Only sha256(token) is persisted — never the raw token.
      const expectedHash = createHash('sha256')
        .update(result.token)
        .digest('hex');
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'team-id',
          email: 'assistant@example.com',
          createdByUserId: 'coach-user-id',
          tokenHash: expectedHash,
          expiresAt: result.expiresAt,
        }),
      );

      // Any existing pending invite for the same team + email is revoked first.
      expect(update).toHaveBeenCalledWith(teamInvites);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'revoked' }),
      );
    });
  });

  describe('listInvites', () => {
    it('returns the pending invites for the team', async () => {
      const rows = [
        {
          id: 'invite-id',
          email: 'assistant@example.com',
          createdAt: new Date('2026-01-02T00:00:00Z'),
          expiresAt: new Date('2026-01-05T00:00:00Z'),
        },
      ];
      const chain = {
        from: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockResolvedValue(rows),
      };
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      const result = await service.listInvites('team-id');

      expect(result).toBe(rows);
      expect(chain.where).toHaveBeenCalled();
    });
  });

  describe('revokeInvite', () => {
    it('revokes a pending invite belonging to the team', async () => {
      const revokeChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'invite-id' }]),
          }),
        }),
      };
      const update = jest.fn().mockReturnValue(revokeChain);
      mockDatabaseService.database = { update };

      await expect(
        service.revokeInvite('team-id', 'invite-id'),
      ).resolves.toBeUndefined();

      expect(update).toHaveBeenCalledWith(teamInvites);
      expect(revokeChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'revoked' }),
      );
    });

    it('rejects with 404 when no matching pending invite exists on the team', async () => {
      const revokeChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      };
      const update = jest.fn().mockReturnValue(revokeChain);
      mockDatabaseService.database = { update };

      // Another team's invite id is indistinguishable from an unknown id.
      await expect(
        service.revokeInvite('team-id', 'other-teams-invite-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.revokeInvite('team-id', 'other-teams-invite-id'),
      ).rejects.toThrow('Invite not found.');
    });
  });

  describe('preview', () => {
    it('returns the team preview for a pending, unexpired invite', async () => {
      const chain = selectChain([
        {
          status: 'pending',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          teamName: 'Riverside FC U16s',
        },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      const result = await service.preview(TOKEN);

      expect(result).toEqual({
        valid: true,
        teamName: 'Riverside FC U16s',
      });
    });

    it('returns valid false for a malformed token without querying', async () => {
      const select = jest.fn();
      mockDatabaseService.database = { select };

      await expect(service.preview('not a token!')).resolves.toEqual({
        valid: false,
      });
      expect(select).not.toHaveBeenCalled();
    });

    it('returns valid false when no invite matches the token', async () => {
      const chain = selectChain([]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.preview(TOKEN)).resolves.toEqual({ valid: false });
    });

    it('returns valid false for an expired invite', async () => {
      const chain = selectChain([
        {
          status: 'pending',
          expiresAt: new Date(Date.now() - 60 * 1000),
          teamName: 'Riverside FC U16s',
        },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.preview(TOKEN)).resolves.toEqual({ valid: false });
    });

    it('returns valid false for a used invite', async () => {
      const chain = selectChain([
        {
          status: 'used',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          teamName: 'Riverside FC U16s',
        },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.preview(TOKEN)).resolves.toEqual({ valid: false });
    });

    it('returns valid false for a revoked invite', async () => {
      const chain = selectChain([
        {
          status: 'revoked',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          teamName: 'Riverside FC U16s',
        },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      await expect(service.preview(TOKEN)).resolves.toEqual({ valid: false });
    });
  });

  describe('accept', () => {
    it('adds the assistant membership and marks the invite used', async () => {
      const chain = selectChain([{ invite: pendingInvite }]);
      const inviteUpdateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const update = jest.fn().mockReturnValue(inviteUpdateChain);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      const result = await service.accept(
        TOKEN,
        'assistant-user-id',
        'assistant@example.com',
      );

      expect(result).toEqual({ joined: true, teamId: 'team-id' });

      // Membership is written by TeamsService with role hardcoded assistant.
      expect(mockTeamsService.addAssistantMember).toHaveBeenCalledWith(
        'team-id',
        'assistant-user-id',
      );
      expect(update).toHaveBeenCalledWith(teamInvites);
      expect(inviteUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'used',
          usedByUserId: 'assistant-user-id',
        }),
      );
    });

    it('matches the session email case-insensitively', async () => {
      const chain = selectChain([{ invite: pendingInvite }]);
      const inviteUpdateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const update = jest.fn().mockReturnValue(inviteUpdateChain);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      await service.accept(
        TOKEN,
        'assistant-user-id',
        '  Assistant@Example.COM ',
      );

      expect(mockTeamsService.addAssistantMember).toHaveBeenCalledWith(
        'team-id',
        'assistant-user-id',
      );
      expect(inviteUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'used' }),
      );
    });

    it('rejects with 403 when the session email does not match the invite', async () => {
      const chain = selectChain([{ invite: pendingInvite }]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      const acceptance = service.accept(
        TOKEN,
        'someone-else-id',
        'someone-else@example.com',
      );
      await expect(acceptance).rejects.toBeInstanceOf(ForbiddenException);
      await expect(acceptance).rejects.toThrow(
        'This invite was issued to a different email address.',
      );
      expect(mockTeamsService.addAssistantMember).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects with 409 when the account already belongs to a team', async () => {
      const chain = selectChain([{ invite: pendingInvite }]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };
      // Covers both existing coaches and existing assistants — nobody can
      // use an invite to join (or promote themselves onto) a second team.
      mockTeamsService.findTeamForUser.mockResolvedValue({
        id: 'existing-team-id',
        name: 'Existing Team',
        role: 'coach',
      });

      const acceptance = service.accept(
        TOKEN,
        'coach-user-id',
        'assistant@example.com',
      );
      await expect(acceptance).rejects.toBeInstanceOf(ConflictException);
      await expect(acceptance).rejects.toThrow(
        'This account already belongs to a team.',
      );
      expect(mockTeamsService.addAssistantMember).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects an expired invite with the generic error', async () => {
      const expiredInvite = {
        ...pendingInvite,
        expiresAt: new Date(Date.now() - 60 * 1000),
      };
      const chain = selectChain([{ invite: expiredInvite }]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      await expect(
        service.accept(TOKEN, 'assistant-user-id', 'assistant@example.com'),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(mockTeamsService.addAssistantMember).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects an already-used invite with the same generic error', async () => {
      const usedInvite = {
        ...pendingInvite,
        status: 'used',
        usedAt: new Date(Date.now() - 60 * 1000),
        usedByUserId: 'someone-else',
      };
      const chain = selectChain([{ invite: usedInvite }]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      await expect(
        service.accept(TOKEN, 'assistant-user-id', 'assistant@example.com'),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(mockTeamsService.addAssistantMember).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a malformed token without querying', async () => {
      const select = jest.fn();
      const update = jest.fn();
      mockDatabaseService.database = { select, update };

      await expect(
        service.accept('not a token!', 'assistant-user-id', 'a@example.com'),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(select).not.toHaveBeenCalled();
      expect(mockTeamsService.addAssistantMember).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });
  });
});
