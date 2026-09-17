import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import type { SessionUser } from '../auth/auth.guard';
import { TeamsService } from '../teams/teams.service';
import { InjuriesController } from './injuries.controller';
import { InjuriesService } from './injuries.service';

const user = {
  id: 'user-id',
  name: 'Assistant Jones',
  email: 'assistant@example.com',
  emailVerified: true,
} as SessionUser;

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';
const INJURY_ID = '44444444-4444-4444-8444-444444444444';

/** Yesterday in UTC, so the not-in-the-future contract never races the clock. */
function yesterday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);

  return date.toISOString().slice(0, 10);
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    athleteId: ATHLETE_ID,
    bodyRegion: 'hamstring_right',
    injuryType: 'strain',
    severity: 'moderate',
    occurredOn: yesterday(),
    ...overrides,
  };
}

describe('InjuriesController', () => {
  let controller: InjuriesController;

  const mockInjuriesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    close: jest.fn(),
    addTimelineEntry: jest.fn(),
    remove: jest.fn(),
    protocolPreview: jest.fn(),
    recoveryFor: jest.fn(),
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
      role: 'assistant',
    });
    mockTeamsService.requireCoachTeam.mockResolvedValue({
      id: 'team-id',
      name: 'Test Team',
      role: 'coach',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InjuriesController],
      providers: [
        { provide: InjuriesService, useValue: mockInjuriesService },
        { provide: TeamsService, useValue: mockTeamsService },
      ],
    }).compile();

    controller = module.get(InjuriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  /**
   * Reporting an injury is deliberately member-level, unlike every other
   * managed-resource mutation: assistants run the live logger, so the person
   * who sees the injury happen has to be able to record it.
   */
  describe('member access', () => {
    it('lets an assistant log an injury', async () => {
      await controller.create(user, validBody());

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockInjuriesService.create).toHaveBeenCalledWith(
        'team-id',
        'user-id',
        expect.objectContaining({ athleteId: ATHLETE_ID }),
      );
    });

    it('lets an assistant read the injury record', async () => {
      await controller.findAll(user, { status: 'open' });

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockInjuriesService.findAll).toHaveBeenCalledWith('team-id', {
        status: 'open',
      });
    });

    it('lets an assistant read one record', async () => {
      await controller.findOne(user, INJURY_ID);

      expect(mockInjuriesService.findOne).toHaveBeenCalledWith(
        'team-id',
        INJURY_ID,
      );
    });

    it('lets an assistant preview return guidance', async () => {
      await controller.protocol(user, {
        bodyRegion: 'calf_left',
        injuryType: 'strain',
        severity: 'minor',
      });

      expect(mockInjuriesService.protocolPreview).toHaveBeenCalledWith({
        bodyRegion: 'calf_left',
        injuryType: 'strain',
        severity: 'minor',
      });
    });

    it('keeps return guidance behind team membership', async () => {
      // Guidance is not team data, but the endpoint must not become an
      // open lookup service for anyone with a session.
      mockTeamsService.findTeamForUser.mockResolvedValue(null);

      await expect(
        controller.protocol(user, {
          bodyRegion: 'calf_left',
          injuryType: 'strain',
          severity: 'minor',
        }),
      ).rejects.toThrow();
      expect(mockInjuriesService.protocolPreview).not.toHaveBeenCalled();
    });

    it('lets an assistant read recovery readings', async () => {
      await controller.recovery(user, ATHLETE_ID);

      expect(mockInjuriesService.recoveryFor).toHaveBeenCalledWith(
        'team-id',
        ATHLETE_ID,
      );
    });
  });

  /**
   * Amending the clinical record stays coach-only: an assistant can report
   * what they saw, but changing a diagnosis, moving a return estimate or
   * closing a record is the coach's decision.
   */
  describe('coach-only access', () => {
    it('requires a coach to edit a record', async () => {
      await controller.update(user, INJURY_ID, { severity: 'severe' });

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
    });

    it('requires a coach to close a record', async () => {
      await controller.close(user, INJURY_ID, {
        actualReturnOn: yesterday(),
      });

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
    });

    it('requires a coach to add a timeline entry', async () => {
      await controller.addTimelineEntry(user, INJURY_ID, {
        kind: 'reassessment',
        occurredOn: '2026-10-03',
        title: 'Progress evaluation',
      });

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
    });

    it('requires a coach to delete a record', async () => {
      await controller.remove(user, INJURY_ID);

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
    });

    it('propagates the refusal for a non-coach', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can manage this team.'),
      );

      await expect(
        controller.update(user, INJURY_ID, { severity: 'severe' }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockInjuriesService.update).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    it('rejects an invalid body before resolving the team', async () => {
      await expect(
        controller.create(user, validBody({ bodyRegion: 'left_ear' })),
      ).rejects.toThrow(BadRequestException);
      expect(mockInjuriesService.create).not.toHaveBeenCalled();
    });

    it('rejects an unsupported list filter', async () => {
      await expect(
        controller.findAll(user, { status: 'rehab' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('defaults an absent query to no filters', async () => {
      await controller.findAll(user, undefined);

      expect(mockInjuriesService.findAll).toHaveBeenCalledWith('team-id', {});
    });

    it('rejects an empty edit', async () => {
      await expect(controller.update(user, INJURY_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
