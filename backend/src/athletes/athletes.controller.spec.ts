import { NotFoundException } from '@nestjs/common';
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
  });

  describe('createClaimInvite', () => {
    it("creates an invite for an athlete on the coach's team", async () => {
      mockAthletesService.findOne.mockResolvedValue({ id: 'athlete-id' });
      const invite = {
        token: 'token',
        claimUrl: 'http://localhost:5173/claim/token',
        expiresAt: new Date(),
      };
      mockClaimsService.createInvite.mockResolvedValue(invite);

      const result = await controller.createClaimInvite(user, 'athlete-id');

      expect(mockAthletesService.findOne).toHaveBeenCalledWith(
        'team-id',
        'athlete-id',
      );
      expect(mockClaimsService.createInvite).toHaveBeenCalledWith(
        'athlete-id',
        'user-id',
      );
      expect(result).toBe(invite);
    });

    it("rejects when the athlete is not on the coach's team", async () => {
      mockAthletesService.findOne.mockRejectedValue(
        new NotFoundException('Athlete not found.'),
      );

      await expect(
        controller.createClaimInvite(user, 'athlete-id'),
      ).rejects.toThrow(NotFoundException);
      expect(mockClaimsService.createInvite).not.toHaveBeenCalled();
    });

    it('rejects when the user has no team', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue(null);

      await expect(
        controller.createClaimInvite(user, 'athlete-id'),
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
