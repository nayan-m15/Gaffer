import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import type { AuthenticatedRequest } from '../auth/auth.guard';

const user: AuthenticatedRequest['user'] = {
  id: 'user-1',
  name: 'Alex Coach',
  email: 'alex@example.com',
  emailVerified: true,
};

const MATCH = '83ff97e6-a665-4605-9e72-c6f810d90202';
const SESSION = '0a4b2d16-1f2c-4f0e-9c5a-2a5a4a9c1b33';
const EVENT = '2b6c1f90-77a1-4c62-9f1e-0d2a4f6b8c10';
const REVIEW = '6d1f2e34-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const AMENDMENT = '7e2f3a45-6b7c-4d8e-9f0a-1b2c3d4e5f60';
const ATHLETE = '8f3a4b56-7c8d-4e9f-a0b1-2c3d4e5f6071';
const REQUEST = '9a4b5c67-8d9e-4f0a-b1c2-3d4e5f607182';

const goalEvent = {
  clientRequestId: REQUEST,
  team: 'own' as const,
  eventType: 'goal' as const,
  athleteId: ATHLETE,
  minute: 23,
};

describe('MatchesController', () => {
  let controller: MatchesController;
  const service = {
    getSessionReport: jest.fn(),
    getSessionReportForSheet: jest.fn(),
    getSquad: jest.fn(),
    getOpponentSquad: jest.fn(),
    getInsight: jest.fn(),
    listEvents: jest.fn(),
    logEvent: jest.fn(),
    listEventReviews: jest.fn(),
    listEventOperations: jest.fn(),
    resolveEventReview: jest.fn(),
    disputeEventReview: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    finish: jest.fn(),
    resume: jest.fn(),
    finaliseProjection: jest.fn(),
    listAmendments: jest.fn(),
    requestAmendment: jest.fn(),
    respondAmendment: jest.fn(),
    reopenProjection: jest.fn(),
    updateClock: jest.fn(),
    listClockOperations: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const stub of Object.values(service))
      stub.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [{ provide: MatchesService, useValue: service }],
    }).compile();
    controller = module.get(MatchesController);
  });

  describe('reads', () => {
    it('passes every plain read straight through to the service', async () => {
      const reads: Array<[string, () => Promise<unknown>, jest.Mock, string]> =
        [
          [
            'sessionReport',
            () => controller.sessionReport(user, SESSION),
            service.getSessionReport,
            SESSION,
          ],
          [
            'sessionReportForSheet',
            () => controller.sessionReportForSheet(user, MATCH),
            service.getSessionReportForSheet,
            MATCH,
          ],
          [
            'getSquad',
            () => controller.getSquad(user, MATCH),
            service.getSquad,
            MATCH,
          ],
          [
            'getOpponentSquad',
            () => controller.getOpponentSquad(user, MATCH),
            service.getOpponentSquad,
            MATCH,
          ],
          [
            'getInsight',
            () => controller.getInsight(user, MATCH),
            service.getInsight,
            MATCH,
          ],
          [
            'listEvents',
            () => controller.listEvents(user, MATCH),
            service.listEvents,
            MATCH,
          ],
          [
            'listEventReviews',
            () => controller.listEventReviews(user, MATCH),
            service.listEventReviews,
            MATCH,
          ],
          [
            'listEventOperations',
            () => controller.listEventOperations(user, MATCH),
            service.listEventOperations,
            MATCH,
          ],
          [
            'amendments',
            () => controller.amendments(user, MATCH),
            service.listAmendments,
            MATCH,
          ],
          [
            'listClockOperations',
            () => controller.listClockOperations(user, MATCH),
            service.listClockOperations,
            MATCH,
          ],
          [
            'findOne',
            () => controller.findOne(user, MATCH),
            service.findOne,
            MATCH,
          ],
        ];

      for (const [name, run, stub, id] of reads) {
        stub.mockResolvedValue({ route: name });

        await expect(run()).resolves.toEqual({ route: name });
        expect(stub).toHaveBeenCalledWith('user-1', id);
      }
    });

    it('finishes a match', async () => {
      await controller.finish(user, MATCH);
      expect(service.finish).toHaveBeenCalledWith('user-1', MATCH);
    });

    it('disputes a review', async () => {
      await controller.disputeEventReview(user, MATCH, REVIEW);
      expect(service.disputeEventReview).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        REVIEW,
      );
    });

    it('deletes an event', async () => {
      await controller.deleteEvent(user, MATCH, EVENT);
      expect(service.deleteEvent).toHaveBeenCalledWith('user-1', MATCH, EVENT);
    });
  });

  describe('logEvent', () => {
    it('forwards a validated event', async () => {
      await controller.logEvent(user, MATCH, goalEvent);

      expect(service.logEvent).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        expect.objectContaining({ eventType: 'goal', minute: 23 }),
      );
    });

    it.each([
      [{ ...goalEvent, clientRequestId: 'not-a-uuid' }, 'a bad request id'],
      [{ ...goalEvent, minute: 151 }, 'an impossible minute'],
      [{ ...goalEvent, minute: -1 }, 'a negative minute'],
      [{ ...goalEvent, eventType: 'teleport' }, 'an unknown event type'],
      [
        { ...goalEvent, eventType: 'tactical_change', team: 'opponent' },
        'a tactical change for the opponent',
      ],
    ])('rejects %p (%s)', async (body) => {
      await expect(controller.logEvent(user, MATCH, body)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.logEvent).not.toHaveBeenCalled();
    });

    it('updates an event', async () => {
      await controller.updateEvent(user, MATCH, EVENT, { minute: 30 });

      expect(service.updateEvent).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        EVENT,
        expect.objectContaining({ minute: 30 }),
      );
    });

    it('rejects an update with an invalid athlete id', async () => {
      await expect(
        controller.updateEvent(user, MATCH, EVENT, { athleteId: 'nope' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('event reviews', () => {
    it('splits the operation metadata from the decision', async () => {
      await controller.resolveEventReview(user, MATCH, REVIEW, {
        resolution: 'same_event',
        explanation: 'Duplicate log from both devices.',
        operationId: REQUEST,
        causalParentIds: [EVENT],
      });

      expect(service.resolveEventReview).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        REVIEW,
        {
          resolution: 'same_event',
          explanation: 'Duplicate log from both devices.',
        },
        REQUEST,
        [EVENT],
      );
    });

    it('defaults the causal parents to an empty list', async () => {
      await controller.resolveEventReview(user, MATCH, REVIEW, {
        resolution: 'separate_events',
      });

      expect(service.resolveEventReview).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        REVIEW,
        { resolution: 'separate_events' },
        undefined,
        [],
      );
    });

    it('rejects an unknown resolution', async () => {
      await expect(
        controller.resolveEventReview(user, MATCH, REVIEW, {
          resolution: 'maybe',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('clock and lifecycle', () => {
    it('resumes with the expected clock revision', async () => {
      await controller.resume(user, MATCH, { expectedClockRevision: 4 });

      expect(service.resume).toHaveBeenCalledWith('user-1', MATCH, 4);
    });

    it('rejects a resume without a revision', async () => {
      await expect(controller.resume(user, MATCH, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('finalises with both revisions', async () => {
      await controller.finalise(user, MATCH, {
        expectedRevision: 3,
        expectedSessionRevision: 2,
      });

      expect(service.finaliseProjection).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        3,
        2,
      );
    });

    it('finalises without an optional session revision', async () => {
      await controller.finalise(user, MATCH, { expectedRevision: 3 });

      expect(service.finaliseProjection).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        3,
        undefined,
      );
    });

    it('rejects a finalise with a zero revision', async () => {
      await expect(
        controller.finalise(user, MATCH, { expectedRevision: 0 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('reopens with a reason', async () => {
      await controller.reopen(user, MATCH, { reason: 'Wrong scorer logged' });

      expect(service.reopenProjection).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        'Wrong scorer logged',
      );
    });

    it('rejects a reopen with too short a reason', async () => {
      await expect(
        controller.reopen(user, MATCH, { reason: 'no' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates the clock', async () => {
      await controller.updateClock(user, MATCH, {
        period: 'first_half',
        running: true,
        elapsedMs: 60_000,
      });

      expect(service.updateClock).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        expect.objectContaining({
          period: 'first_half',
          running: true,
          elapsedMs: 60_000,
          baseRevision: 0,
        }),
      );
    });

    it.each([
      [{ period: 'extra_time', running: true, elapsedMs: 0 }, 'a bad period'],
      [
        { period: 'first_half', running: true, elapsedMs: -1 },
        'negative elapsed time',
      ],
      [
        { period: 'first_half', running: true, elapsedMs: 11_000_000 },
        'an impossible elapsed time',
      ],
    ])('rejects a clock update with %s', async (body) => {
      await expect(controller.updateClock(user, MATCH, body)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('amendments', () => {
    it('requests a correction amendment', async () => {
      await controller.requestAmendment(user, MATCH, {
        id: EVENT,
        expectedSessionRevision: 2,
        action: 'correct',
        reason: 'Wrong scorer recorded',
        canonicalEventId: EVENT,
        replacement: { minute: 24 },
      });

      expect(service.requestAmendment).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        expect.objectContaining({ action: 'correct', canonicalEventId: EVENT }),
      );
    });

    it('requests an added-event amendment', async () => {
      await controller.requestAmendment(user, MATCH, {
        id: EVENT,
        expectedSessionRevision: 2,
        action: 'add',
        reason: 'Missed a goal while offline',
        replacement: goalEvent,
      });

      expect(service.requestAmendment).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        expect.objectContaining({ action: 'add' }),
      );
    });

    it('requests a void amendment', async () => {
      await controller.requestAmendment(user, MATCH, {
        id: EVENT,
        expectedSessionRevision: 2,
        action: 'void',
        reason: 'Logged against the wrong match',
        canonicalEventId: EVENT,
      });

      expect(service.requestAmendment).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        expect.objectContaining({ action: 'void' }),
      );
    });

    it('rejects a correction that omits the canonical event', async () => {
      await expect(
        controller.requestAmendment(user, MATCH, {
          id: EVENT,
          expectedSessionRevision: 2,
          action: 'correct',
          reason: 'Wrong scorer recorded',
          replacement: { minute: 24 },
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an amendment with an unknown action', async () => {
      await expect(
        controller.requestAmendment(user, MATCH, {
          id: EVENT,
          expectedSessionRevision: 2,
          action: 'rewrite',
          reason: 'Because',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each(['approve', 'withdraw'])(
      'responds %s without needing a reason',
      async (response) => {
        await controller.respondAmendment(user, MATCH, AMENDMENT, {
          response,
        });

        expect(service.respondAmendment).toHaveBeenCalledWith(
          'user-1',
          MATCH,
          AMENDMENT,
          response,
          undefined,
        );
      },
    );

    it('passes the reason through on a rejection', async () => {
      await controller.respondAmendment(user, MATCH, AMENDMENT, {
        response: 'reject',
        reason: 'The original log was correct',
      });

      expect(service.respondAmendment).toHaveBeenCalledWith(
        'user-1',
        MATCH,
        AMENDMENT,
        'reject',
        'The original log was correct',
      );
    });

    it.each(['reject', 'request_changes'])(
      'requires a reason to %s',
      async (response) => {
        await expect(
          controller.respondAmendment(user, MATCH, AMENDMENT, { response }),
        ).rejects.toThrow(BadRequestException);
      },
    );
  });
});
