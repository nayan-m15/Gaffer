import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import type { SessionUser } from '../auth/auth.guard';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const user = {
  id: 'user-id',
  name: 'Sam Coach',
  email: 'coach@example.com',
  emailVerified: true,
} as SessionUser;

/** 11 distinct RFC-4122-shaped UUIDs for the starting-XI payload. */
const startingAthleteIds = Array.from(
  { length: 11 },
  (_, i) => `${String(i).padStart(8, '0')}-0000-4000-8000-000000000000`,
);

const createBody = {
  title: 'Team training',
  type: 'training',
  scheduledAt: '2026-09-10T18:00:00+02:00',
  location: 'Main pitch',
};

describe('EventsController', () => {
  let controller: EventsController;

  const mockEventsService = {
    create: jest.fn(),
    list: jest.fn(),
    startMatch: jest.fn(),
    rsvp: jest.fn(),
    listRsvps: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    cancel: jest.fn(),
  };

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
    requireCoachTeam: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTeamsService.requireCoachTeam.mockResolvedValue({
      id: 'team-id',
      name: 'Test Team',
      role: 'coach',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: EventsService,
          useValue: mockEventsService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();

    // Sanity-check the mock wiring: the specs below rely on
    // requireCoachTeam being the gate the controller actually calls.
    expect(mockTeamsService.requireCoachTeam).toBeDefined();
  });

  /* ── Event mutations — coach-only (assistants may only view) ──────── */

  describe('event mutations — coach access', () => {
    it('creates an event for the coach', async () => {
      mockEventsService.create.mockResolvedValue({ id: 'event-id' });

      const result = await controller.create(user, createBody);

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockEventsService.create).toHaveBeenCalledWith(
        'user-id',
        createBody,
      );
      expect(result).toEqual({ id: 'event-id' });
    });

    it('updates an event for the coach', async () => {
      mockEventsService.update.mockResolvedValue({ id: 'event-id' });
      const body = { title: 'New title' };

      await controller.update(user, 'event-id', body);

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockEventsService.update).toHaveBeenCalledWith(
        'user-id',
        'event-id',
        body,
      );
    });

    it('cancels an event for the coach', async () => {
      mockEventsService.cancel.mockResolvedValue({ id: 'event-id' });

      await controller.cancel(user, 'event-id');

      expect(mockTeamsService.requireCoachTeam).toHaveBeenCalledWith('user-id');
      expect(mockEventsService.cancel).toHaveBeenCalledWith(
        'user-id',
        'event-id',
      );
    });
  });

  describe('event mutations — assistant rejection', () => {
    beforeEach(() => {
      // The real TeamsService throws this for any non-coach member.
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('Only coaches can perform this action.'),
      );
    });

    it('rejects assistant create with 403 before touching the service', async () => {
      await expect(controller.create(user, createBody)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockEventsService.create).not.toHaveBeenCalled();
    });

    it('rejects assistant update with 403 before touching the service', async () => {
      await expect(
        controller.update(user, 'event-id', { title: 'New title' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockEventsService.update).not.toHaveBeenCalled();
    });

    it('rejects assistant cancel with 403 before touching the service', async () => {
      await expect(controller.cancel(user, 'event-id')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockEventsService.cancel).not.toHaveBeenCalled();
    });
  });

  describe('event mutations — team-less rejection', () => {
    it('rejects with 403 rather than 404 when the caller has no team', async () => {
      mockTeamsService.requireCoachTeam.mockRejectedValue(
        new ForbiddenException('No team associated with this account.'),
      );

      await expect(controller.create(user, createBody)).rejects.toThrow(
        'No team associated with this account.',
      );
      expect(mockEventsService.create).not.toHaveBeenCalled();
    });
  });

  /* ── Views and live-logging — every team member keeps access ──────── */

  describe('reads, RSVPs and live-logging — assistants keep access', () => {
    // These routes resolve the team inside EventsService (no role gate),
    // so an assistant still sees the calendar, RSVPs, event details and
    // can start a match to begin live event logging.

    it('lists events without the coach gate', async () => {
      mockEventsService.list.mockResolvedValue([]);

      const result = await controller.list(user);

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockEventsService.list).toHaveBeenCalledWith('user-id');
      expect(result).toEqual([]);
    });

    it('reads a single event without the coach gate', async () => {
      mockEventsService.findOne.mockResolvedValue({ id: 'event-id' });

      await controller.findOne(user, 'event-id');

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockEventsService.findOne).toHaveBeenCalledWith(
        'user-id',
        'event-id',
      );
    });

    it('lets an assistant start a match (live-logging entry)', async () => {
      mockEventsService.startMatch.mockResolvedValue({ id: 'match-id' });
      const body = {
        opponentName: 'Rivals FC',
        isHome: true,
        startingAthleteIds,
      };

      await controller.startMatch(user, 'event-id', body);

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockEventsService.startMatch).toHaveBeenCalledWith(
        'user-id',
        'event-id',
        body,
      );
    });

    it('lets a claimed player submit an RSVP without the coach gate', async () => {
      mockEventsService.rsvp.mockResolvedValue({ status: 'going' });

      await controller.rsvp(user, 'event-id', { status: 'going' });

      expect(mockTeamsService.requireCoachTeam).not.toHaveBeenCalled();
      expect(mockEventsService.rsvp).toHaveBeenCalledWith(
        'user-id',
        'event-id',
        {
          status: 'going',
        },
      );
    });
  });
});
