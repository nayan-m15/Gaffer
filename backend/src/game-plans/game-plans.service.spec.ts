import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { GamePlansService } from './game-plans.service';

/** A Postgres unique-violation (SQLSTATE 23505) as the driver raises it. */
function uniqueViolation(): Error {
  return Object.assign(
    new Error('duplicate key value violates unique constraint'),
    {
      code: '23505',
    },
  );
}

/**
 * Drizzle's builders are chainable and thenable, so each test hands back a
 * stub whose terminal call resolves to the rows that statement should return.
 */
const chain = (result: unknown) => {
  const thenable = {
    then: (resolve: (value: unknown) => unknown) => resolve(result),
    from: () => thenable,
    where: () => thenable,
    orderBy: () => thenable,
    limit: () => thenable,
    values: () => thenable,
    set: () => thenable,
    returning: () => Promise.resolve(result),
  };
  return thenable;
};

/** Eleven slot ids for the default 4-3-3, matching `custom-11`'s scheme. */
const slotIds = [
  'custom-11-gk',
  ...Array.from({ length: 10 }, (_, index) => `custom-11-${index + 1}`),
];

const customPositions = (overrides: Record<number, object> = {}) =>
  slotIds.map((id, index) => ({
    id,
    ...(index === 0
      ? { label: 'GK', role: 'GK' as const, x: 50, y: 94 }
      : index <= 4
        ? { label: 'DEF', role: 'DEF' as const, x: 20 + index * 10, y: 70 }
        : index <= 7
          ? { label: 'MID', role: 'MID' as const, x: 20 + index * 8, y: 45 }
          : { label: 'FWD', role: 'FWD' as const, x: 20 + index * 7, y: 20 }),
    ...overrides[index],
  }));

describe('GamePlansService', () => {
  let service: GamePlansService;
  let select: jest.Mock;
  let insert: jest.Mock;
  let update: jest.Mock;
  let remove: jest.Mock;

  const athleteRows = (ids: string[], injured: string[] = []) =>
    ids.map((id) => ({
      id,
      status: injured.includes(id) ? 'injured' : 'available',
    }));

  beforeEach(async () => {
    select = jest.fn().mockReturnValue(chain([]));
    insert = jest.fn().mockReturnValue(chain([{ id: 'plan-1' }]));
    update = jest.fn().mockReturnValue(chain([{ id: 'plan-1' }]));
    remove = jest.fn().mockReturnValue(chain([{ id: 'plan-1' }]));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamePlansService,
        {
          provide: DatabaseService,
          useValue: {
            database: { select, insert, update, delete: remove },
          },
        },
      ],
    }).compile();

    service = module.get<GamePlansService>(GamePlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reads', () => {
    it('lists the plans saved for a team', async () => {
      select.mockReturnValue(chain([{ id: 'plan-1' }, { id: 'plan-2' }]));

      await expect(service.findAll('team-1')).resolves.toEqual([
        { id: 'plan-1' },
        { id: 'plan-2' },
      ]);
    });

    it('returns a single plan', async () => {
      select.mockReturnValue(chain([{ id: 'plan-1' }]));

      await expect(service.findOne('team-1', 'plan-1')).resolves.toEqual({
        id: 'plan-1',
      });
    });

    it('reports a missing plan as not found', async () => {
      select.mockReturnValue(chain([]));

      await expect(service.findOne('team-1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('saves a plan with no referenced athletes', async () => {
      await expect(
        service.create('team-1', { name: 'Empty' }),
      ).resolves.toEqual({ id: 'plan-1' });
      // Nothing to verify, so no athlete lookup is issued.
      expect(select).not.toHaveBeenCalled();
    });

    it('verifies every referenced athlete belongs to the team', async () => {
      select.mockReturnValue(chain(athleteRows(['a1', 'a2'])));

      await expect(
        service.create('team-1', {
          name: 'Starting XI',
          assignments: { 'slot-1': 'a1' },
          substituteIds: ['a2'],
        }),
      ).resolves.toEqual({ id: 'plan-1' });
    });

    it('rejects an athlete that does not belong to the team', async () => {
      select.mockReturnValue(chain(athleteRows(['a1'])));

      await expect(
        service.create('team-1', {
          name: 'Borrowed',
          assignments: { 'slot-1': 'a1', 'slot-2': 'outsider' },
        }),
      ).rejects.toThrow('Every referenced athlete must belong to this team.');
    });

    it('rejects an injured athlete in the starting lineup', async () => {
      select.mockReturnValue(chain(athleteRows(['a1'], ['a1'])));

      await expect(
        service.create('team-1', {
          name: 'Risky',
          assignments: { 'slot-1': 'a1' },
        }),
      ).rejects.toThrow(
        'Injured athletes cannot be placed in the starting lineup.',
      );
    });

    it('allows an injured athlete on the bench', async () => {
      select.mockReturnValue(chain(athleteRows(['a1'], ['a1'])));

      await expect(
        service.create('team-1', {
          name: 'Bench recovery',
          substituteIds: ['a1'],
        }),
      ).resolves.toEqual({ id: 'plan-1' });
    });

    it('checks set-piece takers for team membership', async () => {
      select.mockReturnValue(chain(athleteRows(['a1'])));

      await expect(
        service.create('team-1', {
          name: 'Set pieces',
          captainId: 'a1',
          freeKickTakerId: 'a1',
          longFreeKickTakerId: 'a1',
          penaltyTakerId: 'a1',
          cornerTakerId: 'a1',
          rightCornerTakerId: 'a1',
        }),
      ).resolves.toEqual({ id: 'plan-1' });
    });

    it('rejects an unsupported formation', async () => {
      await expect(
        service.create('team-1', {
          name: 'Nonsense',
          formationId: '9-9-9',
        } as never),
      ).rejects.toThrow('Formation is not supported.');
    });

    it('rejects more starters than the selected format allows', async () => {
      const assignments = Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [
          `slot-${index}`,
          `athlete-${index}`,
        ]),
      );

      await expect(
        service.create('team-1', {
          name: 'Overloaded five',
          formationId: '5v5-1-2-1',
          assignments,
        } as never),
      ).rejects.toThrow('This formation allows at most 5 starting athletes.');
    });

    it('rejects a duplicated starter', async () => {
      await expect(
        service.create('team-1', {
          name: 'Twins',
          assignments: { 'slot-1': 'a1', 'slot-2': 'a1' },
        }),
      ).rejects.toThrow('Starting athletes must be unique.');
    });

    it('rejects an athlete who both starts and sits on the bench', async () => {
      await expect(
        service.create('team-1', {
          name: 'Everywhere',
          assignments: { 'slot-1': 'a1' },
          substituteIds: ['a1'],
        }),
      ).rejects.toThrow(
        'An athlete cannot be both a starter and a substitute.',
      );
    });

    it('rejects custom positions on a standard formation', async () => {
      await expect(
        service.create('team-1', {
          name: 'Mismatched',
          formationId: '4-3-3',
          customPositions: customPositions(),
        } as never),
      ).rejects.toThrow(
        'Custom position coordinates can only be saved with a custom formation.',
      );
    });

    it('translates a unique-name violation into a conflict', async () => {
      insert.mockReturnValue({
        values: () => ({
          returning: () => Promise.reject(uniqueViolation()),
        }),
      });

      await expect(
        service.create('team-1', { name: 'Duplicate' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows an unrelated insert failure', async () => {
      const failure = new Error('connection reset');
      insert.mockReturnValue({
        values: () => ({ returning: () => Promise.reject(failure) }),
      });

      await expect(service.create('team-1', { name: 'Unlucky' })).rejects.toBe(
        failure,
      );
    });
  });

  describe('custom formations', () => {
    const createCustom = (positions: unknown, extra: object = {}) =>
      service.create('team-1', {
        name: 'Custom eleven',
        formationId: 'custom-11',
        customPositions: positions,
        ...extra,
      } as never);

    it('accepts a well-formed custom formation', async () => {
      await expect(createCustom(customPositions())).resolves.toEqual({
        id: 'plan-1',
      });
    });

    it('requires coordinates for custom formations', async () => {
      await expect(
        service.create('team-1', {
          name: 'Custom seven',
          formationId: 'custom-7',
          assignments: {},
          customPositions: null,
        } as never),
      ).rejects.toThrow('require exactly 7 position slots');
    });

    it('requires exactly one slot per player', async () => {
      await expect(
        createCustom(customPositions().slice(0, 10)),
      ).rejects.toThrow('require exactly 11 position slots');
    });

    it('rejects duplicated slot ids', async () => {
      const positions = customPositions();
      positions[2] = { ...positions[2], id: positions[1].id };

      await expect(createCustom(positions)).rejects.toThrow(
        'Custom formation position IDs must be unique.',
      );
    });

    it('rejects slot ids that do not match the format', async () => {
      const positions = customPositions();
      positions[3] = { ...positions[3], id: 'custom-7-3' };

      await expect(createCustom(positions)).rejects.toThrow(
        'Custom formation position IDs do not match the selected format.',
      );
    });

    it('requires exactly one goalkeeper slot', async () => {
      const positions = customPositions({
        1: { label: 'GK', role: 'GK', x: 50, y: 94 },
      });

      await expect(createCustom(positions)).rejects.toThrow(
        'A custom formation must contain exactly one goalkeeper slot.',
      );
    });

    it('rejects a formation with no goalkeeper at all', async () => {
      const positions = customPositions({
        0: { label: 'DEF', role: 'DEF', x: 50, y: 70 },
      });

      await expect(createCustom(positions)).rejects.toThrow(
        'A custom formation must contain exactly one goalkeeper slot.',
      );
    });

    it('pins the goalkeeper to its fixed coordinates', async () => {
      const positions = customPositions({
        0: { label: 'GK', role: 'GK', x: 40, y: 94 },
      });

      await expect(createCustom(positions)).rejects.toThrow(
        'The goalkeeper position is fixed in custom formations.',
      );
    });

    it.each([
      [{ x: 2, y: 70 }],
      [{ x: 98, y: 70 }],
      [{ x: 50, y: 2 }],
      [{ x: 50, y: 95 }],
    ])('keeps outfield slots inside the pitch area: %p', async (coords) => {
      const positions = customPositions({
        1: { label: 'DEF', role: 'DEF', ...coords },
      });

      await expect(createCustom(positions)).rejects.toThrow(
        'Custom outfield positions must stay within the editable pitch area.',
      );
    });

    it('requires the role to match where the slot sits on the pitch', async () => {
      const positions = customPositions({
        1: { label: 'FWD', role: 'FWD', x: 30, y: 70 },
      });

      await expect(createCustom(positions)).rejects.toThrow(
        'Custom formation roles must match their position on the pitch.',
      );
    });

    it('requires the goalkeeper slot to be labelled GK', async () => {
      const positions = customPositions({
        0: { label: 'Keeper', role: 'GK', x: 50, y: 94 },
      });

      await expect(createCustom(positions)).rejects.toThrow(
        'Custom formation roles must match their position on the pitch.',
      );
    });

    it('requires assignments to use the formation’s own slots', async () => {
      await expect(
        createCustom(customPositions(), {
          assignments: { 'some-other-slot': 'a1' },
        }),
      ).rejects.toThrow(
        'Starting-lineup assignments must use slots from the custom formation.',
      );
    });
  });

  describe('update', () => {
    it('merges the change over the stored plan and saves it', async () => {
      select
        .mockReturnValueOnce(
          chain([
            {
              id: 'plan-1',
              formationId: '4-3-3',
              assignments: {},
              customPositions: null,
              substituteIds: [],
              captainId: null,
              freeKickTakerId: null,
              longFreeKickTakerId: null,
              penaltyTakerId: null,
              cornerTakerId: null,
              rightCornerTakerId: null,
              playerInstructions: {},
            },
          ]),
        )
        .mockReturnValue(chain([]));

      await expect(
        service.update('team-1', 'plan-1', { name: 'Renamed' }),
      ).resolves.toEqual({ id: 'plan-1' });
    });

    it('reports an unknown plan as not found before validating', async () => {
      select.mockReturnValue(chain([]));

      await expect(
        service.update('team-1', 'nope', { name: 'Renamed' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('translates a unique-name violation into a conflict', async () => {
      select.mockReturnValueOnce(
        chain([
          {
            id: 'plan-1',
            formationId: '4-3-3',
            assignments: {},
            customPositions: null,
            substituteIds: [],
            captainId: null,
            freeKickTakerId: null,
            longFreeKickTakerId: null,
            penaltyTakerId: null,
            cornerTakerId: null,
            rightCornerTakerId: null,
            playerInstructions: {},
          },
        ]),
      );
      update.mockReturnValue({
        set: () => ({
          where: () => ({
            returning: () => Promise.reject(uniqueViolation()),
          }),
        }),
      });

      await expect(
        service.update('team-1', 'plan-1', { name: 'Taken' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rethrows an unrelated update failure', async () => {
      const failure = new Error('connection reset');
      select.mockReturnValueOnce(
        chain([
          {
            id: 'plan-1',
            formationId: '4-3-3',
            assignments: {},
            customPositions: null,
            substituteIds: [],
            captainId: null,
            freeKickTakerId: null,
            longFreeKickTakerId: null,
            penaltyTakerId: null,
            cornerTakerId: null,
            rightCornerTakerId: null,
            playerInstructions: {},
          },
        ]),
      );
      update.mockReturnValue({
        set: () => ({
          where: () => ({ returning: () => Promise.reject(failure) }),
        }),
      });

      await expect(
        service.update('team-1', 'plan-1', { name: 'Unlucky' }),
      ).rejects.toBe(failure);
    });

    it('reports a plan deleted mid-update as not found', async () => {
      select.mockReturnValueOnce(
        chain([
          {
            id: 'plan-1',
            formationId: '4-3-3',
            assignments: {},
            customPositions: null,
            substituteIds: [],
            captainId: null,
            freeKickTakerId: null,
            longFreeKickTakerId: null,
            penaltyTakerId: null,
            cornerTakerId: null,
            rightCornerTakerId: null,
            playerInstructions: {},
          },
        ]),
      );
      update.mockReturnValue(chain([]));

      await expect(
        service.update('team-1', 'plan-1', { name: 'Vanished' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('returns the deleted plan', async () => {
      await expect(service.remove('team-1', 'plan-1')).resolves.toEqual({
        id: 'plan-1',
      });
    });

    it('reports a missing plan as not found', async () => {
      remove.mockReturnValue(chain([]));

      await expect(service.remove('team-1', 'nope')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
