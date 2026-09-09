import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import type { SessionUser } from '../auth/auth.guard';
import { GamePlansController } from './game-plans.controller';
import { GamePlansService } from './game-plans.service';

const user = {
  id: 'user-id',
  name: 'Sam Coach',
  email: 'coach@example.com',
  emailVerified: true,
} as SessionUser;

describe('GamePlansController', () => {
  let controller: GamePlansController;

  const mockGamePlansService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
    requireCoachTeam: jest.fn(),
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
      controllers: [GamePlansController],
      providers: [
        {
          provide: GamePlansService,
          useValue: mockGamePlansService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<GamePlansController>(GamePlansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();

    // Sanity-check the mock wiring: the specs below rely on
    // requireCoachTeam being the gate the controller actually calls.
    expect(mockTeamsService.requireCoachTeam).toBeDefined();
  });

  /* ── Game-plan mutations — coach-only (assistants may only view) ──── */

  describe('game-plan mutations — coach access', () => {
    it('creates a game plan for the coach', async () => {
      mockGamePlansService.create.mockResolvedValue({ id: 'plan-id' });
      const body = { name: '4-3-3 Press' };

      const result = await controller.create(user, body);

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockGamePlansService.create).toHaveBeenCalledWith('team-id', body);
      expect(result).toEqual({ id: 'plan-id' });
    });

    it('updates a game plan for the coach', async () => {
      mockGamePlansService.update.mockResolvedValue({ id: 'plan-id' });
      const body = { name: 'Updated plan' };

      await controller.update(user, 'plan-id', body);

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockGamePlansService.update).toHaveBeenCalledWith(
        'team-id',
        'plan-id',
        body,
      );
    });

    it('removes a game plan for the coach', async () => {
      mockGamePlansService.remove.mockResolvedValue(undefined);

      await controller.remove(user, 'plan-id');

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockGamePlansService.remove).toHaveBeenCalledWith(
        'team-id',
        'plan-id',
      );
    });
  });

  describe('game-plan mutations — assistant rejection', () => {
    beforeEach(() => {
      // The real TeamsService throws this for any non-coach member.
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );
    });

    it('rejects assistant create with 403 before touching the service', async () => {
      await expect(
        controller.create(user, { name: '4-3-3 Press' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockGamePlansService.create).not.toHaveBeenCalled();
    });

    it('rejects assistant update with 403 before touching the service', async () => {
      await expect(
        controller.update(user, 'plan-id', { name: 'Nope' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockGamePlansService.update).not.toHaveBeenCalled();
    });

    it('rejects assistant remove with 403 before touching the service', async () => {
      await expect(controller.remove(user, 'plan-id')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockGamePlansService.remove).not.toHaveBeenCalled();
    });
  });

  /* ── Reads — every team member keeps access ───────────────────────── */

  describe('game-plan reads — assistants keep access', () => {
    beforeEach(() => {
      // Reads resolve the team with findTeamForUser (not the coach gate),
      // so an assistant can still view saved plans on Team Management.
      mockTeamsService.findTeamForUser.mockResolvedValue({
        id: 'team-id',
        name: 'Test Team',
        role: 'assistant',
      });
    });

    it('lists game plans for an assistant', async () => {
      mockGamePlansService.findAll.mockResolvedValue([]);

      const result = await controller.findAll(user);

      expect(mockTeamsService.findTeamForUser).toHaveBeenCalledWith('user-id');
      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockGamePlansService.findAll).toHaveBeenCalledWith('team-id');
      expect(result).toEqual([]);
    });

    it('reads a single game plan for an assistant, still scoped to their team', async () => {
      mockGamePlansService.findOne.mockResolvedValue({ id: 'plan-id' });

      await controller.findOne(user, 'plan-id');

      // Team scoping is unchanged: the id is always the caller's own team,
      // so cross-team plans still surface as 404 from the service.
      expect(mockGamePlansService.findOne).toHaveBeenCalledWith(
        'team-id',
        'plan-id',
      );
    });

    it('rejects reads with 404 when the caller has no team', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue(null);

      await expect(controller.findAll(user)).rejects.toThrow(NotFoundException);
    });
  });
});
