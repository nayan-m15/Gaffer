import { BadRequestException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { CompetitionsController } from './competitions.controller';
import { CompetitionsService } from './competitions.service';
import type { SessionUser } from '../auth/auth.guard';

const user: SessionUser = {
  id: 'user-1',
  name: 'Alex Coach',
  email: 'alex@example.com',
  emailVerified: true,
};

const COMPETITION_ID = '83ff97e6-a665-4605-9e72-c6f810d90202';
const FIXTURE_ID = '0a4b2d16-1f2c-4f0e-9c5a-2a5a4a9c1b33';
const RESULT_ID = '2b6c1f90-77a1-4c62-9f1e-0d2a4f6b8c10';
const TEAM_ID = '6d1f2e34-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const AWAY_TEAM_ID = '7e2f3a45-6b7c-4d8e-9f0a-1b2c3d4e5f60';

describe('CompetitionsController', () => {
  let controller: CompetitionsController;
  const service = {
    search: jest.fn(),
    listMine: jest.fn(),
    create: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    listFixtures: jest.fn(),
    generateFixtures: jest.fn(),
    acceptFixtureSchedule: jest.fn(),
    proposeFixtureSchedule: jest.fn(),
    createManualResult: jest.fn(),
    updateManualResult: jest.fn(),
    removeManualResult: jest.fn(),
    addParticipant: jest.fn(),
    renameParticipant: jest.fn(),
    removeParticipant: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const stub of Object.values(service))
      stub.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CompetitionsController],
      providers: [{ provide: CompetitionsService, useValue: service }],
    }).compile();
    controller = module.get(CompetitionsController);
  });

  describe('reads', () => {
    it('passes a trimmed search term through', async () => {
      service.search.mockResolvedValue([{ id: COMPETITION_ID }]);

      await expect(controller.search(user, '  league  ')).resolves.toEqual([
        { id: COMPETITION_ID },
      ]);
      expect(service.search).toHaveBeenCalledWith('user-1', 'league');
    });

    it.each([undefined, '', '   ', 'a'.repeat(101)])(
      'rejects an unusable search term: %p',
      async (term) => {
        await expect(controller.search(user, term)).rejects.toThrow(
          BadRequestException,
        );
        expect(service.search).not.toHaveBeenCalled();
      },
    );

    it('lists the caller’s own competitions', async () => {
      service.listMine.mockResolvedValue([{ id: COMPETITION_ID }]);

      await expect(controller.listMine(user)).resolves.toEqual([
        { id: COMPETITION_ID },
      ]);
      expect(service.listMine).toHaveBeenCalledWith('user-1');
    });

    it('returns one competition', async () => {
      service.findOne.mockResolvedValue({ id: COMPETITION_ID });

      await expect(controller.findOne(user, COMPETITION_ID)).resolves.toEqual({
        id: COMPETITION_ID,
      });
      expect(service.findOne).toHaveBeenCalledWith('user-1', COMPETITION_ID);
    });

    it('lists fixtures', async () => {
      service.listFixtures.mockResolvedValue([{ id: FIXTURE_ID }]);

      await expect(controller.fixtures(user, COMPETITION_ID)).resolves.toEqual([
        { id: FIXTURE_ID },
      ]);
    });
  });

  describe('create and update', () => {
    it('creates a competition from a valid body', async () => {
      service.create.mockResolvedValue({ id: COMPETITION_ID });

      await expect(
        controller.create(user, { name: 'Sunday League', type: 'league' }),
      ).resolves.toEqual({ id: COMPETITION_ID });
      expect(service.create).toHaveBeenCalledWith('user-1', {
        name: 'Sunday League',
        type: 'league',
      });
    });

    it.each([
      [{ type: 'league' }, 'a missing name'],
      [{ name: '', type: 'league' }, 'an empty name'],
      [{ name: 'Cup', type: 'tournament' }, 'an unsupported type'],
      [{ name: 'Cup', type: 'cup', configuredTeamCount: 1 }, 'too few teams'],
      [{ name: 'Cup', type: 'cup', playersPerSide: 9 }, 'an odd side size'],
    ])('rejects %p (%s)', async (body) => {
      await expect(controller.create(user, body)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.create).not.toHaveBeenCalled();
    });

    it('updates a competition', async () => {
      service.update.mockResolvedValue({ id: COMPETITION_ID });

      await expect(
        controller.update(user, COMPETITION_ID, { name: 'Renamed' }),
      ).resolves.toEqual({ id: COMPETITION_ID });
      expect(service.update).toHaveBeenCalledWith('user-1', COMPETITION_ID, {
        name: 'Renamed',
      });
    });

    it('rejects an update that changes nothing', async () => {
      await expect(controller.update(user, COMPETITION_ID, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('reports a successful delete', async () => {
      await expect(controller.remove(user, COMPETITION_ID)).resolves.toEqual({
        success: true,
      });
      expect(service.remove).toHaveBeenCalledWith('user-1', COMPETITION_ID);
    });
  });

  describe('fixtures', () => {
    it('defaults fixture generation to not regenerating', async () => {
      await controller.generateFixtures(user, COMPETITION_ID, undefined);

      expect(service.generateFixtures).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        false,
      );
    });

    it('forwards an explicit regenerate flag', async () => {
      await controller.generateFixtures(user, COMPETITION_ID, {
        regenerate: true,
      });

      expect(service.generateFixtures).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        true,
      );
    });

    it('rejects a non-boolean regenerate flag', async () => {
      await expect(
        controller.generateFixtures(user, COMPETITION_ID, {
          regenerate: 'yes',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a proposed schedule with its expected revision', async () => {
      await controller.acceptFixtureSchedule(user, COMPETITION_ID, FIXTURE_ID, {
        expectedRevision: 3,
      });

      expect(service.acceptFixtureSchedule).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        FIXTURE_ID,
        { expectedRevision: 3 },
      );
    });

    it.each([
      [undefined, 'a missing body'],
      [{}, 'a missing revision'],
      [{ expectedRevision: 0 }, 'a non-positive revision'],
      [{ expectedRevision: 1.5 }, 'a fractional revision'],
    ])('rejects a schedule acceptance with %s', async (body) => {
      await expect(
        controller.acceptFixtureSchedule(
          user,
          COMPETITION_ID,
          FIXTURE_ID,
          body,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('proposes a reschedule', async () => {
      const dto = {
        expectedRevision: 2,
        scheduledAt: '2026-11-01T14:00:00+00:00',
        note: 'Pitch unavailable',
      };

      await controller.proposeFixtureSchedule(
        user,
        COMPETITION_ID,
        FIXTURE_ID,
        dto,
      );

      expect(service.proposeFixtureSchedule).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        FIXTURE_ID,
        dto,
      );
    });

    it('rejects a reschedule without a valid timestamp', async () => {
      await expect(
        controller.proposeFixtureSchedule(user, COMPETITION_ID, FIXTURE_ID, {
          expectedRevision: 2,
          scheduledAt: 'next tuesday',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('results', () => {
    const result = {
      homeCompetitionTeamId: TEAM_ID,
      awayCompetitionTeamId: AWAY_TEAM_ID,
      homeScore: 2,
      awayScore: 1,
      playedAt: '2026-10-01T14:00:00+00:00',
    };

    it('records a manual result', async () => {
      await controller.createResult(user, COMPETITION_ID, result);

      expect(service.createManualResult).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        result,
      );
    });

    it('rejects a result where a team plays itself', async () => {
      await expect(
        controller.createResult(user, COMPETITION_ID, {
          ...result,
          awayCompetitionTeamId: TEAM_ID,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it.each([
      [{ homeScore: -1 }, 'a negative score'],
      [{ homeScore: 100 }, 'an impossible score'],
      [{ homeScore: 1.5 }, 'a fractional score'],
      [{ playedAt: 'yesterday' }, 'an unparseable date'],
    ])('rejects a result with %s', async (patch) => {
      await expect(
        controller.createResult(user, COMPETITION_ID, { ...result, ...patch }),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates a manual result', async () => {
      await controller.updateResult(user, COMPETITION_ID, RESULT_ID, result);

      expect(service.updateManualResult).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        RESULT_ID,
        result,
      );
    });

    it('reports a successful result delete', async () => {
      await expect(
        controller.removeResult(user, COMPETITION_ID, RESULT_ID),
      ).resolves.toEqual({ success: true });
      expect(service.removeManualResult).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        RESULT_ID,
      );
    });
  });

  describe('participants', () => {
    it('adds a participant slot', async () => {
      await controller.addParticipant(user, COMPETITION_ID, {
        displayName: '  Rovers  ',
      });

      expect(service.addParticipant).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        { displayName: 'Rovers' },
      );
    });

    it.each([{}, { displayName: '' }, { displayName: 'a'.repeat(101) }])(
      'rejects an unusable participant name: %p',
      async (body) => {
        await expect(
          controller.addParticipant(user, COMPETITION_ID, body),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('renames a participant', async () => {
      await controller.renameParticipant(user, COMPETITION_ID, TEAM_ID, {
        displayName: 'United',
      });

      expect(service.renameParticipant).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        TEAM_ID,
        { displayName: 'United' },
      );
    });

    it('reports a successful participant removal', async () => {
      await expect(
        controller.removeParticipant(user, COMPETITION_ID, TEAM_ID),
      ).resolves.toEqual({ success: true });
      expect(service.removeParticipant).toHaveBeenCalledWith(
        'user-1',
        COMPETITION_ID,
        TEAM_ID,
      );
    });
  });
});
