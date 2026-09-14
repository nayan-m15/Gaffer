import { ConflictException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { athletes, playerClaimInvites } from '../database/schema';
import { sendPlayerClaimInviteEmail } from '../email/email';
import { ClaimsService } from './claims.service';

jest.mock('../email/email', () => ({
  sendPlayerClaimInviteEmail: jest.fn(),
}));

// `crypto.randomBytes(32).toString('base64url')` shape — 43 URL-safe chars.
const TOKEN = 'a'.repeat(43);

const pendingInvite = {
  id: 'invite-id',
  athleteId: 'athlete-id',
  tokenHash: 'stored-hash',
  status: 'pending',
  email: 'player@example.com',
  createdByUserId: 'coach-user-id',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  usedAt: null,
  usedByUserId: null,
};

const unclaimedAthlete = {
  id: 'athlete-id',
  teamId: 'team-id',
  userId: null,
  firstName: 'Alex',
  lastName: 'Morgan',
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

describe('ClaimsService', () => {
  let service: ClaimsService;

  const mockDatabaseService = {
    database: {} as Record<string, unknown>,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimsService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<ClaimsService>(ClaimsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createInvite', () => {
    it('emails a 72-hour one-time link and stores only its sha256 hash', async () => {
      const chain = selectChain([{ firstName: 'Alex', lastName: 'Morgan' }]);
      const updateChain = {
        set: jest
          .fn()
          .mockReturnValue({ where: jest.fn().mockResolvedValue(undefined) }),
      };
      const update = jest.fn().mockReturnValue(updateChain);
      const values = jest.fn().mockResolvedValue(undefined);
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
        insert,
      };

      const before = Date.now();
      const result = await service.createInvite(
        'athlete-id',
        'player@example.com',
        'coach-user-id',
      );

      const mockedSend = jest.mocked(sendPlayerClaimInviteEmail);
      expect(mockedSend).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'player@example.com',
          playerName: 'Alex Morgan',
        }),
      );
      const sentEmail = mockedSend.mock.calls[0]?.[0];
      expect(sentEmail).toBeDefined();
      const token = sentEmail.url.split('/').pop()!;
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(result.email).toBe('player@example.com');

      // Fixed 72-hour expiry (allowing a small clock buffer).
      expect(result.expiresAt.getTime()).toBeGreaterThan(
        before + 71 * 60 * 60 * 1000,
      );
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(
        Date.now() + 72 * 60 * 60 * 1000 + 1000,
      );

      // Only sha256(token) is persisted — never the raw token.
      const expectedHash = createHash('sha256').update(token).digest('hex');
      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({
          athleteId: 'athlete-id',
          email: 'player@example.com',
          createdByUserId: 'coach-user-id',
          tokenHash: expectedHash,
          expiresAt: result.expiresAt,
        }),
      );

      // Any existing pending invite for the athlete is revoked first.
      expect(update).toHaveBeenCalledWith(playerClaimInvites);
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'revoked' }),
      );
    });
  });

  describe('preview', () => {
    it('returns the athlete preview for a pending, unexpired invite', async () => {
      const chain = selectChain([
        {
          status: 'pending',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
          firstName: 'Alex',
          lastName: 'Morgan',
          teamName: 'Riverside FC U16s',
        },
      ]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      const result = await service.preview(TOKEN);

      expect(result).toEqual({
        athlete: {
          firstName: 'Alex',
          lastName: 'Morgan',
          teamName: 'Riverside FC U16s',
        },
        valid: true,
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
          firstName: 'Alex',
          lastName: 'Morgan',
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
          firstName: 'Alex',
          lastName: 'Morgan',
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
          firstName: 'Alex',
          lastName: 'Morgan',
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
    it('claims the athlete and marks the invite used', async () => {
      const claimedAthlete = { ...unclaimedAthlete, userId: 'user-id' };
      const chain = selectChain(
        [{ invite: pendingInvite, athlete: unclaimedAthlete }],
        [], // no existing claim by this user on the team
      );
      const athleteUpdateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([claimedAthlete]),
          }),
        }),
      };
      const inviteUpdateChain = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      };
      const update = jest
        .fn()
        .mockReturnValueOnce(athleteUpdateChain)
        .mockReturnValueOnce(inviteUpdateChain);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      const result = await service.accept(
        TOKEN,
        'user-id',
        'player@example.com',
      );

      expect(result).toBe(claimedAthlete);
      expect(update).toHaveBeenNthCalledWith(1, athletes);
      expect(update).toHaveBeenNthCalledWith(2, playerClaimInvites);
      expect(athleteUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-id' }),
      );
      expect(inviteUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'used',
          usedByUserId: 'user-id',
        }),
      );
    });

    it('rejects an expired invite with the generic error', async () => {
      const expiredInvite = {
        ...pendingInvite,
        expiresAt: new Date(Date.now() - 60 * 1000),
      };
      const chain = selectChain([
        { invite: expiredInvite, athlete: unclaimedAthlete },
      ]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      await expect(
        service.accept(TOKEN, 'user-id', 'player@example.com'),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects an already-used invite with the same generic error', async () => {
      const usedInvite = {
        ...pendingInvite,
        status: 'used',
        usedAt: new Date(Date.now() - 60 * 1000),
        usedByUserId: 'someone-else',
      };
      const chain = selectChain([
        { invite: usedInvite, athlete: unclaimedAthlete },
      ]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      await expect(
        service.accept(TOKEN, 'user-id', 'player@example.com'),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects a malformed token without querying', async () => {
      const select = jest.fn();
      const update = jest.fn();
      mockDatabaseService.database = { select, update };

      await expect(
        service.accept('not a token!', 'user-id', 'player@example.com'),
      ).rejects.toThrow('This invite link is no longer valid.');
      expect(select).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects with a conflict when the athlete is already claimed', async () => {
      const claimedByOther = { ...unclaimedAthlete, userId: 'someone-else' };
      const chain = selectChain([
        { invite: pendingInvite, athlete: claimedByOther },
      ]);
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      const acceptance = service.accept(TOKEN, 'user-id', 'player@example.com');
      await expect(acceptance).rejects.toBeInstanceOf(ConflictException);
      await expect(acceptance).rejects.toThrow(
        'This player profile has already been claimed.',
      );
      expect(update).not.toHaveBeenCalled();
    });

    it('rejects with a conflict when the user already claimed another athlete on the same team', async () => {
      const chain = selectChain(
        [{ invite: pendingInvite, athlete: unclaimedAthlete }],
        [{ id: 'other-athlete-id' }],
      );
      const update = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
        update,
      };

      const acceptance = service.accept(TOKEN, 'user-id', 'player@example.com');
      await expect(acceptance).rejects.toBeInstanceOf(ConflictException);
      await expect(acceptance).rejects.toThrow(
        'This account has already claimed a player profile on this team.',
      );
      expect(update).not.toHaveBeenCalled();
    });
  });
});
