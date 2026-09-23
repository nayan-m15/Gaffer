import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import {
  athletes,
  injuries,
  injuryTimelineEntries,
  matchEvents,
  matches,
} from '../database/schema';
import { InjuriesService } from './injuries.service';

const TEAM_ID = 'team-1';
const USER_ID = 'user-1';
const ATHLETE_ID = 'athlete-1';
const INJURY_ID = 'injury-1';
const MATCH_ID = 'match-1';
const MATCH_EVENT_ID = 'match-event-1';

type Table = object;

interface InsertCall {
  table: Table;
  values: unknown;
}

interface UpdateCall {
  table: Table;
  set: Record<string, unknown>;
}

/**
 * Drizzle query-builder double that dispatches on the table a select reads
 * from, rather than on call order.
 *
 * Neon HTTP gives the service no interactive transactions, so its methods
 * issue several independent statements; keying the doubles by table keeps
 * each test readable instead of encoding a fragile call sequence.
 */
function makeDatabase(options: {
  /** Rows each `select().from(table)` resolves to, consumed in order. */
  selects?: Array<[Table, unknown[]]>;
  /** Rows `insert(table).values().returning()` resolves to. */
  inserted?: Array<[Table, unknown[]]>;
  /** Rows `update(table).set().where().returning()` resolves to. */
  updated?: Array<[Table, unknown[]]>;
  /** Tables whose insert should throw, with the driver error to throw. */
  insertFails?: Map<Table, Error>;
}) {
  const selectQueues = new Map<Table, unknown[][]>();
  for (const [table, rows] of options.selects ?? []) {
    const queue = selectQueues.get(table) ?? [];
    queue.push(rows);
    selectQueues.set(table, queue);
  }

  const insertCalls: InsertCall[] = [];
  const updateCalls: UpdateCall[] = [];
  const deleteCalls: Table[] = [];

  function nextSelect(table: Table): unknown[] {
    const queue = selectQueues.get(table);
    if (!queue || queue.length === 0) {
      return [];
    }

    // The last queued result is reused, so a repeated identical read (the
    // service re-reading a record after writing it) needs no extra entry.
    return queue.length === 1 ? queue[0] : (queue.shift() as unknown[]);
  }

  const database = {
    select: () => {
      let table: Table | null = null;
      const chain: Record<string, unknown> = {
        from: (t: Table) => {
          table = t;
          return chain;
        },
        innerJoin: () => chain,
        leftJoin: () => chain,
        where: () => chain,
        groupBy: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve(table ? nextSelect(table) : []).then(resolve),
      };

      return chain;
    },

    insert: (table: Table) => ({
      values: (values: unknown) => {
        const failure = options.insertFails?.get(table);
        insertCalls.push({ table, values });

        const rows =
          options.inserted?.find(([candidate]) => candidate === table)?.[1] ??
          [];
        const result: Record<string, unknown> = {
          returning: () =>
            failure ? Promise.reject(failure) : Promise.resolve(rows),
          then: (
            resolve: (value: unknown) => unknown,
            reject?: (reason: unknown) => unknown,
          ) =>
            failure
              ? Promise.reject(failure).then(resolve, reject)
              : Promise.resolve(rows).then(resolve),
        };

        return result;
      },
    }),

    update: (table: Table) => ({
      set: (set: Record<string, unknown>) => {
        updateCalls.push({ table, set });
        const rows =
          options.updated?.find(([candidate]) => candidate === table)?.[1] ??
          [];

        return {
          where: () => ({
            returning: () => Promise.resolve(rows),
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(rows).then(resolve),
          }),
        };
      },
    }),

    delete: (table: Table) => {
      deleteCalls.push(table);

      return {
        where: () => Promise.resolve([]),
      };
    },
  };

  return { database, insertCalls, updateCalls, deleteCalls };
}

function injuryRow(overrides: Record<string, unknown> = {}) {
  return {
    id: INJURY_ID,
    teamId: TEAM_ID,
    athleteId: ATHLETE_ID,
    bodyRegion: 'hamstring_right',
    injuryType: 'strain',
    severity: 'moderate',
    status: 'rehab',
    context: 'match',
    occurredOn: '2026-09-12',
    matchId: null,
    matchEventId: null,
    minute: null,
    estimatedReturnMinDays: 21,
    estimatedReturnMaxDays: 42,
    estimatedReturnFrom: '2026-10-03',
    estimatedReturnTo: '2026-10-24',
    actualReturnOn: null,
    diagnosedBy: 'Club Physio',
    description: null,
    notes: null,
    rehabPhases: [],
    closedAt: null,
    createdByUserId: USER_ID,
    ...overrides,
  };
}

function validCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    athleteId: ATHLETE_ID,
    bodyRegion: 'hamstring_right' as const,
    injuryType: 'strain' as const,
    severity: 'moderate' as const,
    occurredOn: '2026-09-12',
    ...overrides,
  };
}

describe('InjuriesService', () => {
  let service: InjuriesService;
  const mockDatabaseService: { database: unknown } = { database: {} };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InjuriesService,
        { provide: DatabaseService, useValue: mockDatabaseService },
      ],
    }).compile();

    service = module.get(InjuriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('persists the guidance window resolved from the protocol table', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(TEAM_ID, USER_ID, validCreateInput());

      const injuryInsert = db.insertCalls.find(
        (call) => call.table === injuries,
      );
      expect(injuryInsert?.values).toMatchObject({
        teamId: TEAM_ID,
        athleteId: ATHLETE_ID,
        // A moderate hamstring strain is 21-42 days in the protocol table.
        estimatedReturnMinDays: 21,
        estimatedReturnMaxDays: 42,
        estimatedReturnFrom: '2026-10-03',
        estimatedReturnTo: '2026-10-24',
        createdByUserId: USER_ID,
      });
    });

    it('snapshots the rehab phase plan onto the record', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(TEAM_ID, USER_ID, validCreateInput());

      const values = db.insertCalls.find((call) => call.table === injuries)
        ?.values as { rehabPhases: unknown[] };
      expect(Array.isArray(values.rehabPhases)).toBe(true);
      expect(values.rehabPhases.length).toBeGreaterThan(0);
    });

    it("lets a coach's estimate override the guidance table", async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(
        TEAM_ID,
        USER_ID,
        validCreateInput({
          estimatedReturnMinDays: 10,
          estimatedReturnMaxDays: 20,
        }),
      );

      expect(
        db.insertCalls.find((call) => call.table === injuries)?.values,
      ).toMatchObject({
        estimatedReturnMinDays: 10,
        estimatedReturnMaxDays: 20,
        estimatedReturnFrom: '2026-09-22',
        estimatedReturnTo: '2026-10-02',
      });
    });

    it('rebuilds the phase plan against an overridden window', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(
        TEAM_ID,
        USER_ID,
        validCreateInput({
          estimatedReturnMinDays: 10,
          estimatedReturnMaxDays: 20,
        }),
      );

      const values = db.insertCalls.find((call) => call.table === injuries)
        ?.values as { rehabPhases: { toDay: number }[] };
      // The plan must end where the overridden window ends, not at the
      // protocol table's 42 days.
      expect(values.rehabPhases.at(-1)?.toDay).toBe(20);
    });

    it('seeds the timeline with what happened and what is expected', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow({ context: 'match', minute: 34 })]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(TEAM_ID, USER_ID, validCreateInput());

      const timelineInsert = db.insertCalls.find(
        (call) => call.table === injuryTimelineEntries,
      );
      expect(timelineInsert?.values).toEqual([
        expect.objectContaining({
          kind: 'sustained',
          title: 'Injury sustained',
          detail: "Occurred during a match (34')",
        }),
        expect.objectContaining({
          kind: 'estimated_return',
          title: 'Estimated return',
        }),
      ]);
    });

    it('marks the athlete injured', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(TEAM_ID, USER_ID, validCreateInput());

      expect(
        db.updateCalls.find((call) => call.table === athletes)?.set,
      ).toMatchObject({ status: 'injured' });
    });

    it('leaves a suspended athlete suspended', async () => {
      // A suspension outlives an overlapping injury; overwriting it would
      // quietly make a banned player selectable.
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'suspended' }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(TEAM_ID, USER_ID, validCreateInput());

      expect(
        db.updateCalls.find((call) => call.table === athletes),
      ).toBeUndefined();
    });

    it('rolls the record back when the timeline cannot be written', async () => {
      const db = makeDatabase({
        selects: [[athletes, [{ id: ATHLETE_ID, status: 'available' }]]],
        inserted: [[injuries, [injuryRow()]]],
        insertFails: new Map([[injuryTimelineEntries, new Error('offline')]]),
      });
      mockDatabaseService.database = db.database;

      await expect(
        service.create(TEAM_ID, USER_ID, validCreateInput()),
      ).rejects.toThrow('offline');
      // Neon HTTP has no interactive transactions, so the compensating
      // delete is the only thing standing between a failure and a record
      // with an empty history.
      expect(db.deleteCalls).toContain(injuries);
    });

    it('rejects a duplicate record for the same match event', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [matches, [{ id: MATCH_ID }]],
          [matchEvents, [{ id: MATCH_EVENT_ID }]],
        ],
        // A real driver reports this as an Error carrying the SQLSTATE
        // code, which is what the service's unique-violation check reads.
        insertFails: new Map([
          [
            injuries,
            Object.assign(new Error('duplicate key value'), { code: '23505' }),
          ],
        ]),
      });
      mockDatabaseService.database = db.database;

      await expect(
        service.create(
          TEAM_ID,
          USER_ID,
          validCreateInput({
            matchId: MATCH_ID,
            matchEventId: MATCH_EVENT_ID,
          }),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an athlete from another team', async () => {
      const db = makeDatabase({ selects: [[athletes, []]] });
      mockDatabaseService.database = db.database;

      await expect(
        service.create(TEAM_ID, USER_ID, validCreateInput()),
      ).rejects.toThrow(NotFoundException);
      expect(db.insertCalls).toHaveLength(0);
    });

    it('rejects a match belonging to another team', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [matches, []],
        ],
      });
      mockDatabaseService.database = db.database;

      await expect(
        service.create(
          TEAM_ID,
          USER_ID,
          validCreateInput({ matchId: MATCH_ID }),
        ),
      ).rejects.toThrow(NotFoundException);
      expect(db.insertCalls).toHaveLength(0);
    });

    it('rejects a match event that is not on the given match', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [matches, [{ id: MATCH_ID }]],
          [matchEvents, []],
        ],
      });
      mockDatabaseService.database = db.database;

      await expect(
        service.create(
          TEAM_ID,
          USER_ID,
          validCreateInput({
            matchId: MATCH_ID,
            matchEventId: MATCH_EVENT_ID,
          }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a match event with no match', async () => {
      const db = makeDatabase({
        selects: [[athletes, [{ id: ATHLETE_ID, status: 'available' }]]],
      });
      mockDatabaseService.database = db.database;

      await expect(
        service.create(
          TEAM_ID,
          USER_ID,
          validCreateInput({ matchEventId: MATCH_EVENT_ID }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('infers the match context from the provenance', async () => {
      const db = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'available' }]],
          [matches, [{ id: MATCH_ID }]],
          [injuries, [injuryRow()]],
        ],
        inserted: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.create(
        TEAM_ID,
        USER_ID,
        validCreateInput({ matchId: MATCH_ID }),
      );

      expect(
        db.insertCalls.find((call) => call.table === injuries)?.values,
      ).toMatchObject({ context: 'match' });
    });
  });

  describe('update', () => {
    it('re-projects the estimate when the diagnosis changes', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow({ severity: 'severe' })]]],
      });
      mockDatabaseService.database = db.database;

      await service.update(TEAM_ID, USER_ID, INJURY_ID, {
        severity: 'severe',
      });

      // A severe hamstring strain is 84-168 days, not the 21-42 the record
      // was created with.
      expect(
        db.updateCalls.find((call) => call.table === injuries)?.set,
      ).toMatchObject({
        estimatedReturnMinDays: 84,
        estimatedReturnMaxDays: 168,
      });
    });

    it('keeps the existing estimate when only the notes change', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.update(TEAM_ID, USER_ID, INJURY_ID, {
        notes: 'Responding well to loading.',
      });

      const set = db.updateCalls.find((call) => call.table === injuries)?.set;
      expect(set).toMatchObject({
        estimatedReturnMinDays: 21,
        estimatedReturnMaxDays: 42,
      });
      // Ticked phases must survive an edit that did not touch the diagnosis.
      expect(set && 'rehabPhases' in set).toBe(false);
    });

    it('re-snapshots the phase plan when the diagnosis changes', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow({ injuryType: 'tear' })]]],
      });
      mockDatabaseService.database = db.database;

      await service.update(TEAM_ID, USER_ID, INJURY_ID, {
        injuryType: 'tear',
      });

      const set = db.updateCalls.find((call) => call.table === injuries)?.set;
      expect(set && 'rehabPhases' in set).toBe(true);
    });

    it('records a status change on the timeline', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow({ status: 'reported' })]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow({ status: 'rehab' })]]],
      });
      mockDatabaseService.database = db.database;

      await service.update(TEAM_ID, USER_ID, INJURY_ID, { status: 'rehab' });

      expect(
        db.insertCalls.find((call) => call.table === injuryTimelineEntries)
          ?.values,
      ).toMatchObject({
        kind: 'rehab_started',
        title: 'Rehabilitation started',
      });
    });

    it('records an estimate change on the timeline', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [
          [
            injuries,
            [
              injuryRow({
                estimatedReturnFrom: '2026-09-22',
                estimatedReturnTo: '2026-10-02',
              }),
            ],
          ],
        ],
      });
      mockDatabaseService.database = db.database;

      await service.update(TEAM_ID, USER_ID, INJURY_ID, {
        estimatedReturnMinDays: 10,
        estimatedReturnMaxDays: 20,
      });

      expect(
        db.insertCalls.find((call) => call.table === injuryTimelineEntries)
          ?.values,
      ).toMatchObject({ kind: 'estimated_return' });
    });

    it('rejects an injury from another team', async () => {
      const db = makeDatabase({ selects: [[injuries, []]] });
      mockDatabaseService.database = db.database;

      await expect(
        service.update(TEAM_ID, USER_ID, INJURY_ID, { severity: 'minor' }),
      ).rejects.toThrow(NotFoundException);
      expect(db.updateCalls).toHaveLength(0);
    });
  });

  describe('close', () => {
    it('records the actual return and returns the athlete to available', async () => {
      const db = makeDatabase({
        selects: [
          // The record being closed, then the open-injury re-check (which
          // now finds nothing outstanding), then the re-read for the
          // response.
          [injuries, [injuryRow()]],
          [injuries, []],
          [injuries, [injuryRow({ status: 'returned' })]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.close(TEAM_ID, USER_ID, INJURY_ID, {
        actualReturnOn: '2026-10-20',
      });

      expect(
        db.updateCalls.find((call) => call.table === injuries)?.set,
      ).toMatchObject({ status: 'returned', actualReturnOn: '2026-10-20' });
      expect(
        db.updateCalls.find((call) => call.table === athletes)?.set,
      ).toMatchObject({ status: 'available' });
    });

    it('keeps the athlete injured while another injury is still open', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          // A second, unrelated injury is still outstanding.
          [injuries, [injuryRow({ id: 'injury-2', bodyRegion: 'calf_left' })]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.close(TEAM_ID, USER_ID, INJURY_ID, {
        actualReturnOn: '2026-10-20',
      });

      expect(
        db.updateCalls.find((call) => call.table === athletes),
      ).toBeUndefined();
    });

    it('notes when the athlete beat the projection', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.close(TEAM_ID, USER_ID, INJURY_ID, {
        actualReturnOn: '2026-10-20',
      });

      expect(
        db.insertCalls.find((call) => call.table === injuryTimelineEntries)
          ?.values,
      ).toMatchObject({
        kind: 'returned',
        detail: '4 days earlier than projected',
      });
    });

    it('notes when the return ran late', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
        updated: [[injuries, [injuryRow()]]],
      });
      mockDatabaseService.database = db.database;

      await service.close(TEAM_ID, USER_ID, INJURY_ID, {
        actualReturnOn: '2026-10-25',
      });

      expect(
        db.insertCalls.find((call) => call.table === injuryTimelineEntries)
          ?.values,
      ).toMatchObject({ detail: '1 day later than projected' });
    });

    it('rejects a return before the date of injury', async () => {
      const db = makeDatabase({ selects: [[injuries, [injuryRow()]]] });
      mockDatabaseService.database = db.database;

      await expect(
        service.close(TEAM_ID, USER_ID, INJURY_ID, {
          actualReturnOn: '2026-09-01',
        }),
      ).rejects.toThrow(ConflictException);
      expect(db.updateCalls).toHaveLength(0);
    });
  });

  describe('remove', () => {
    it('deletes the record and re-syncs the athlete', async () => {
      const db = makeDatabase({
        selects: [
          [injuries, [injuryRow()]],
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
        ],
      });
      mockDatabaseService.database = db.database;

      const result = await service.remove(TEAM_ID, INJURY_ID);

      expect(result).toEqual({ id: INJURY_ID });
      expect(db.deleteCalls).toContain(injuries);
    });

    it('rejects an injury from another team', async () => {
      const db = makeDatabase({ selects: [[injuries, []]] });
      mockDatabaseService.database = db.database;

      await expect(service.remove(TEAM_ID, INJURY_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(db.deleteCalls).toHaveLength(0);
    });
  });

  describe('findOne', () => {
    it('raises not found for an injury outside the team', async () => {
      mockDatabaseService.database = makeDatabase({
        selects: [[injuries, []]],
      }).database;

      await expect(service.findOne(TEAM_ID, INJURY_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('protocolPreview', () => {
    it('resolves guidance without touching the database', () => {
      mockDatabaseService.database = {};

      const preview = service.protocolPreview({
        bodyRegion: 'calf_left',
        injuryType: 'strain',
        severity: 'minor',
        occurredOn: '2026-09-12',
      });

      expect(preview).toMatchObject({
        minDays: 7,
        maxDays: 14,
        estimatedReturnFrom: '2026-09-19',
        estimatedReturnTo: '2026-09-26',
      });
    });
  });

  describe('recoveryFor', () => {
    it('rejects an athlete outside the team', async () => {
      mockDatabaseService.database = makeDatabase({
        selects: [[athletes, []]],
      }).database;

      await expect(service.recoveryFor(TEAM_ID, ATHLETE_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns a reading for every displayed group', async () => {
      mockDatabaseService.database = makeDatabase({
        selects: [
          [athletes, [{ id: ATHLETE_ID, status: 'injured' }]],
          [injuries, []],
        ],
      }).database;

      const readings = await service.recoveryFor(TEAM_ID, ATHLETE_ID);

      expect(readings.length).toBeGreaterThan(0);
      expect(readings.every((reading) => reading.percent === 100)).toBe(true);
    });
  });
});
