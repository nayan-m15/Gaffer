import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { ClaimsService } from '../claims/claims.service';
import { TeamsService } from '../teams/teams.service';
import type { SessionUser } from '../auth/auth.guard';
import { AthletesController } from './athletes.controller';
import { AthletesService } from './athletes.service';

const user = {
  id: 'user-id',
  name: 'Coach Smith',
  email: 'coach@example.com',
  emailVerified: true,
} as SessionUser;

describe('AthletesController', () => {
  let controller: AthletesController;

  const mockAthletesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    findArchived: jest.fn(),
  };

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
    requireCoachTeam: jest.fn(),
  };

  const mockClaimsService = {
    createInvite: jest.fn(),
    revokeInvite: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTeamsService.findTeamForUser.mockResolvedValue({
      id: 'team-id',
      name: 'Test Team',
      role: 'coach',
    });
    mockTeamsService.requireCoachTeam.mockResolvedValue({
      id: 'team-id',
      name: 'Test Team',
      role: 'coach',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AthletesController],
      providers: [
        {
          provide: AthletesService,
          useValue: mockAthletesService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
        {
          provide: ClaimsService,
          useValue: mockClaimsService,
        },
      ],
    }).compile();

    controller = module.get<AthletesController>(AthletesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();

    // Sanity-check the mock wiring: the spec below relies on
    // requireCoachTeam being the gate the controller actually calls.
    expect(mockTeamsService.requireCoachTeam).toBeDefined();
  });

  /* ── Roster mutation permissions (Sprint 2 roles & permissions) ─────── */

  describe('roster mutations — coach access', () => {
    it('creates an athlete on the coach\u2019s team', async () => {
      mockAthletesService.create.mockResolvedValue({ id: 'athlete-id' });
      const body = { firstName: 'Alex', lastName: 'Morgan' };

      const result = await controller.create(user, body);

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockAthletesService.create).toHaveBeenCalledWith('team-id', body);
      expect(result).toEqual({ id: 'athlete-id' });
    });

    it('updates an athlete on the coach\u2019s team', async () => {
      mockAthletesService.update.mockResolvedValue({ id: 'athlete-id' });
      const body = { position: 'CM' };

      await controller.update(user, 'athlete-id', body);

      expect(mockAthletesService.update).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
        body,
      );
    });

    it('archives an athlete on the coach\u2019s team', async () => {
      mockAthletesService.archive.mockResolvedValue({ id: 'athlete-id' });

      await controller.archive(user, 'athlete-id');

      expect(mockAthletesService.archive).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
      );
    });

    it('restores an athlete on the coach\u2019s team', async () => {
      mockAthletesService.restore.mockResolvedValue({ id: 'athlete-id' });

      await controller.restore(user, 'athlete-id');

      expect(mockAthletesService.restore).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
      );
    });
  });

  describe('roster mutations — assistant rejection', () => {
    beforeEach(() => {
      // The real TeamsService throws this for any non-coach member.
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );
    });

    it('rejects assistant create with 403 before touching the service', async () => {
      await expect(
        controller.create(user, { firstName: 'A', lastName: 'B' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAthletesService.create).not.toHaveBeenCalled();
    });

    it('rejects assistant update with 403 before touching the service', async () => {
      await expect(
        controller.update(user, 'athlete-id', { position: 'CM' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAthletesService.update).not.toHaveBeenCalled();
    });

    it('rejects assistant archive with 403 before touching the service', async () => {
      await expect(
        controller.archive(user, 'athlete-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAthletesService.archive).not.toHaveBeenCalled();
    });

    it('rejects assistant restore with 403 before touching the service', async () => {
      await expect(
        controller.restore(user, 'athlete-id'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockAthletesService.restore).not.toHaveBeenCalled();
    });
  });

  describe('roster mutations — team-less rejection', () => {
    it('rejects with 403 rather than 404 when the caller has no team', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('No team associated with this account.'),
      );

      await expect(
        controller.create(user, { firstName: 'A', lastName: 'B' }),
      ).rejects.toThrow('No team associated with this account.');
      expect(mockAthletesService.create).not.toHaveBeenCalled();
    });
  });

  describe('roster reads — assistants keep access', () => {
    beforeEach(() => {
      // Reads resolve the team with findTeamForUser (not the coach gate),
      // so an assistant still sees the roster, archived list and details.
      mockTeamsService.findTeamForUser.mockResolvedValue({
        id: 'team-id',
        name: 'Test Team',
        role: 'assistant',
      });
    });

    it('lists the active roster for an assistant', async () => {
      mockAthletesService.findAll.mockResolvedValue([]);

      const result = await controller.findAll(user);

      expect(mockTeamsService.findTeamForUser).toHaveBeenCalledWith('user-id');
      expect(mockAthletesService.findAll).toHaveBeenCalledWith('team-id');
      expect(result).toEqual([]);
    });

    it('lists the archived roster for an assistant', async () => {
      mockAthletesService.findArchived.mockResolvedValue([]);

      await controller.findArchived(user);

      expect(mockAthletesService.findArchived).toHaveBeenCalledWith('team-id');
    });

    it('reads a single athlete for an assistant, still scoped to their team', async () => {
      mockAthletesService.findOne.mockResolvedValue({ id: 'athlete-id' });

      await controller.findOne(user, 'athlete-id');

      // Team scoping is unchanged: the id is always the caller's own team,
      // so cross-team athletes still surface as 404 from the service.
      expect(mockAthletesService.findOne).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
      );
    });
  });

  describe('createClaimInvite', () => {
    it("creates an invite for an athlete on the coach's team", async () => {
      mockAthletesService.findOne.mockResolvedValue({ id: 'athlete-id' });
      const invite = {
        email: 'player@example.com',
        expiresAt: new Date(),
      };
      mockClaimsService.createInvite.mockResolvedValue(invite);

      const result = await controller.createClaimInvite(user, 'athlete-id', {
        email: ' Player@Example.com ',
      });

      expect(mockAthletesService.findOne).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
      );
      expect(mockClaimsService.createInvite).toHaveBeenCalledWith(
        'athlete-id',
        'player@example.com',
        'user-id',
      );
      expect(result).toBe(invite);
    });

    it("rejects when the athlete is not on the coach's team", async () => {
      mockAthletesService.findOne.mockRejectedValue(
        new NotFoundException('Athlete not found.'),
      );

      await expect(
        controller.createClaimInvite(user, 'athlete-id', {
          email: 'player@example.com',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockClaimsService.createInvite).not.toHaveBeenCalled();
    });

    it('rejects when the user has no team', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue(null);

      await expect(
        controller.createClaimInvite(user, 'athlete-id', {
          email: 'player@example.com',
        }),
      ).rejects.toThrow('Team not found.');
      expect(mockAthletesService.findOne).not.toHaveBeenCalled();
      expect(mockClaimsService.createInvite).not.toHaveBeenCalled();
    });
  });

  describe('revokeClaimInvite', () => {
    it("revokes the pending invite for an athlete on the coach's team", async () => {
      mockAthletesService.findOne.mockResolvedValue({ id: 'athlete-id' });
      mockClaimsService.revokeInvite.mockResolvedValue(undefined);

      const result = await controller.revokeClaimInvite(user, 'athlete-id');

      expect(mockAthletesService.findOne).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
      );
      expect(mockClaimsService.revokeInvite).toHaveBeenCalledWith('athlete-id');
      expect(result).toEqual({ revoked: true });
    });

    it("rejects when the athlete is not on the coach's team", async () => {
      mockAthletesService.findOne.mockRejectedValue(
        new NotFoundException('Athlete not found.'),
      );

      await expect(
        controller.revokeClaimInvite(user, 'athlete-id'),
      ).rejects.toThrow(NotFoundException);
      expect(mockClaimsService.revokeInvite).not.toHaveBeenCalled();
    });
  });
});
