import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import type { SessionUser } from '../auth/auth.guard';
import { TeamInvitesController } from './team-invites.controller';
import { TeamInvitesService } from './team-invites.service';

const user = {
  id: 'user-id',
  name: 'Coach Smith',
  email: 'coach@example.com',
  emailVerified: true,
} as SessionUser;

const coachTeam = { id: 'team-id', name: 'Test Team', role: 'coach' };

describe('TeamInvitesController', () => {
  let controller: TeamInvitesController;

  const mockTeamInvitesService = {
    createInvite: jest.fn(),
    listInvites: jest.fn(),
    revokeInvite: jest.fn(),
    preview: jest.fn(),
    accept: jest.fn(),
  };

  const mockTeamsService = {
    requireCoachTeam: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTeamsService.requireCoachTeam.mockResolvedValue(coachTeam);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TeamInvitesController],
      providers: [
        {
          provide: TeamInvitesService,
          useValue: mockTeamInvitesService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<TeamInvitesController>(TeamInvitesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it("creates an invite for the coach's team with the submitted email", async () => {
      const invite = {
        token: 'token',
        inviteUrl: 'http://localhost:5173/join/token',
        email: 'assistant@example.com',
        expiresAt: new Date(),
      };
      mockTeamInvitesService.createInvite.mockResolvedValue(invite);

      const result = await controller.create(user, {
        email: 'assistant@example.com',
      });

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockTeamInvitesService.createInvite).toHaveBeenCalledWith(
        'team-id',
        'assistant@example.com',
        'user-id',
      );
      expect(result).toBe(invite);
    });

    it('rejects with 403 when the caller is an assistant', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );

      await expect(
        controller.create(user, { email: 'assistant@example.com' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockTeamInvitesService.createInvite).not.toHaveBeenCalled();
    });

    it('rejects an invalid email body', async () => {
      await expect(
        controller.create(user, { email: 'not-an-email' }),
      ).rejects.toThrow('Enter a valid email address.');
      expect(mockTeamInvitesService.createInvite).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it("lists the coach's pending invites", async () => {
      const invites = [
        {
          id: 'invite-id',
          email: 'assistant@example.com',
          createdAt: new Date(),
          expiresAt: new Date(),
        },
      ];
      mockTeamInvitesService.listInvites.mockResolvedValue(invites);

      const result = await controller.list(user);

      expect(mockTeamInvitesService.listInvites).toHaveBeenCalledWith(
        'team-id',
      );
      expect(result).toBe(invites);
    });

    it('rejects with 403 when the caller is an assistant', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );

      await expect(controller.list(user)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockTeamInvitesService.listInvites).not.toHaveBeenCalled();
    });
  });

  describe('revoke', () => {
    it("revokes one of the coach's team's pending invites", async () => {
      mockTeamInvitesService.revokeInvite.mockResolvedValue(undefined);

      const result = await controller.revoke(user, 'invite-id');

      expect(mockTeamInvitesService.revokeInvite).toHaveBeenCalledWith(
        'team-id',
        'invite-id',
      );
      expect(result).toEqual({ revoked: true });
    });

    it('rejects with 403 when the caller is an assistant', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );

      await expect(controller.revoke(user, 'invite-id')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockTeamInvitesService.revokeInvite).not.toHaveBeenCalled();
    });
  });

  describe('preview', () => {
    it('delegates to the service without requiring a session', async () => {
      const preview = { valid: true, teamName: 'Test Team' };
      mockTeamInvitesService.preview.mockResolvedValue(preview);

      const result = await controller.preview('token');

      expect(mockTeamInvitesService.preview).toHaveBeenCalledWith('token');
      expect(result).toBe(preview);
    });
  });

  describe('accept', () => {
    it('delegates with the session user id and email', async () => {
      const joined = { joined: true, teamId: 'team-id' };
      mockTeamInvitesService.accept.mockResolvedValue(joined);

      const result = await controller.accept('token', user);

      expect(mockTeamInvitesService.accept).toHaveBeenCalledWith(
        'token',
        'user-id',
        'coach@example.com',
      );
      expect(result).toBe(joined);
    });
  });
});
