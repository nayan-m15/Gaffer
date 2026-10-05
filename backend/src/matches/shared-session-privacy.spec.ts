import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { TeamsService } from '../teams/teams.service';
import { EventsService } from '../events/events.service';
import { FriendlyFixturesService } from '../friendly-fixtures/friendly-fixtures.service';
import { CompetitionsService } from '../competitions/competitions.service';
import { MatchesService } from './matches.service';

// Real SQL/functions and service paths; no external database or user records.
describe('Phase 2 shared privacy and clock', () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let database: DatabaseService;
  let events: EventsService;
  let matches: MatchesService;
  let competitions: CompetitionsService;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    pg = new PGlite();
    const folder = resolve(__dirname, '../../drizzle');
    const journal = JSON.parse(
      readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    for (const entry of journal.entries) {
      await pg.exec(readFileSync(resolve(folder, `${entry.tag}.sql`), 'utf8'));
    }
    db = drizzle(pg, { schema });
    database = { database: db } as unknown as DatabaseService;
    const teams = new TeamsService(database);
    const friendly = new FriendlyFixturesService(database, teams);
    events = new EventsService(database, teams, {} as never, friendly);
    matches = new MatchesService(
      database,
      teams,
      { generateForMatch: jest.fn().mockResolvedValue(undefined) } as never,
      friendly,
    );
    competitions = new CompetitionsService(database, teams);
  }, 60000);
  beforeEach(() => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    process.env.OFFLINE_SYNC_ENABLED = 'true';
    delete process.env.OFFLINE_SYNC_MATCH_IDS;
  });
  afterAll(async () => {
    process.env = originalEnv;
    await pg?.close();
  });

  async function coach() {
    const id = randomUUID();
    await db
      .insert(schema.user)
      .values({ id, name: id, email: `${id}@example.test` });
    const [team] = await db
      .insert(schema.teams)
      .values({ name: id })
      .returning();
    await db
      .insert(schema.teamMembers)
      .values({ userId: id, teamId: team.id, role: 'coach' });
    const athletes = await db
      .insert(schema.athletes)
      .values(
        Array.from({ length: 11 }, (_, i) => ({
          teamId: team.id,
          firstName: `Player${i}`,
          lastName: 'Test',
        })),
      )
      .returning();
    return { id, team, athletes };
  }
  async function fixture(kind: 'friendly' | 'competition' = 'friendly') {
    const home = await coach();
    const away = await coach();
    const scheduledAt = new Date(Date.now() - 86400000);
    let fixtureId: string;
    let homeEvent: string;
    let awayEvent: string;
    let competitionId: string | undefined;
    if (kind === 'friendly') {
      const event = await events.create(home.id, {
        title: 'Fresh friendly',
        type: 'match',
        scheduledAt: scheduledAt.toISOString(),
        location: 'Test ground',
        friendlyOpponentTeamId: away.team.id,
      });
      const accepted = await new FriendlyFixturesService(
        database,
        new TeamsService(database),
      ).accept(away.id, event.friendlyFixtureId!);
      fixtureId = event.friendlyFixtureId!;
      homeEvent = event.id;
      awayEvent = accepted.event.id;
    } else {
      const competition = await competitions.create(home.id, {
        name: randomUUID(),
        type: 'league',
        format: 'league',
        configuredTeamCount: 2,
        startDate: '2027-01-01',
        allowedPlayingDays: [6],
      });
      competitionId = competition.id;
      const slot = await competitions.addParticipant(home.id, competition.id, {
        displayName: away.team.name,
      });
      await db
        .update(schema.competitionTeams)
        .set({ teamId: away.team.id })
        .where(eq(schema.competitionTeams.id, slot.id));
      const [generated] = await competitions.generateFixtures(
        home.id,
        competition.id,
      );
      fixtureId = generated.id;
      await db
        .update(schema.competitionFixtures)
        .set({ scheduledAt })
        .where(eq(schema.competitionFixtures.id, fixtureId));
      await db
        .update(schema.competitionFixtures)
        .set({
          scheduleConfirmedAt: new Date(),
          homeScheduleResponse: 'external_confirmed',
          awayScheduleResponse: 'external_confirmed',
        })
        .where(eq(schema.competitionFixtures.id, fixtureId));
      await db
        .update(schema.events)
        .set({ scheduledAt })
        .where(eq(schema.events.competitionFixtureId, fixtureId));
      const rows = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.competitionFixtureId, fixtureId));
      homeEvent = rows.find((row) => row.teamId === home.team.id)!.id;
      awayEvent = rows.find((row) => row.teamId === away.team.id)!.id;
    }
    const start = (side: typeof home, eventId: string) =>
      events.startMatch(side.id, eventId, {
        opponentName: 'Other team',
        isHome: side === away,
        startingAthleteIds: side.athletes.map((a) => a.id),
        opponentSquadVisibility: 'none',
      });
    return {
      home,
      away,
      fixtureId,
      homeEvent,
      awayEvent,
      competitionId,
      start,
    };
  }

  it.each(['friendly', 'competition'] as const)(
    '%s: peer events and nested review observations stay private',
    async (kind) => {
      const f = await fixture(kind);
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      const log = (
        actor: typeof f.home,
        sheet: typeof a,
        type: 'goal' | 'injury',
        elapsed: number,
      ) =>
        matches.logEvent(actor.id, sheet.id, {
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: type,
          athleteId: actor.athletes[0].id,
          minute: 1,
          period: 'first_half',
          matchElapsedMs: elapsed,
          detail: 'private tactics and medical detail',
        });
      await log(f.home, a, 'goal', 60000);
      await matches.logEvent(f.away.id, b.id, {
        clientRequestId: randomUUID(),
        team: 'opponent',
        eventType: 'goal',
        minute: 1,
        period: 'first_half',
        matchElapsedMs: 61000,
        detail: 'private opposition detail',
      });
      await log(f.home, a, 'injury', 90000);
      const peerEvents = await matches.listEvents(f.away.id, a.id);
      expect(peerEvents).toHaveLength(1);
      expect(peerEvents[0]).toMatchObject({
        athleteId: null,
        opponentPlayerId: null,
        detail: null,
        athlete: null,
        opponentPlayer: null,
      });
      expect(JSON.stringify(peerEvents)).not.toContain(f.home.athletes[0].id);
      expect(
        (await matches.listEvents(f.home.id, a.id)).some(
          (row) => row.eventType === 'injury',
        ),
      ).toBe(true);
      const report = await matches.getSessionReportForSheet(f.away.id, b.id);
      expect(report.timeline.every((row) => row.eventType !== 'injury')).toBe(
        true,
      );
      const reviews = await matches.listEventReviews(f.away.id, a.id);
      expect(reviews).toHaveLength(1);
      const peerObservation = reviews[0].observations.find(
        (row) => row.matchId === a.id,
      )!;
      expect(peerObservation).toMatchObject({
        athleteId: null,
        opponentPlayerId: null,
        detail: null,
        payload: null,
        payloadHash: null,
      });
      const ownObservation = reviews[0].observations.find(
        (row) => row.matchId === b.id,
      )!;
      expect(ownObservation.payload).toMatchObject({
        detail: 'private opposition detail',
      });
      const other = await coach();
      await expect(matches.listEvents(other.id, a.id)).rejects.toMatchObject({
        status: 404,
      });
      await db
        .delete(schema.teamMembers)
        .where(eq(schema.teamMembers.userId, f.away.id));
      await expect(matches.listEvents(f.away.id, a.id)).rejects.toMatchObject({
        status: 403,
      });
    },
  );

  it('friendly invitations neither expose nor copy private calendar notes', async () => {
    const home = await coach();
    const away = await coach();
    const event = await events.create(home.id, {
      title: 'Private notes test',
      type: 'match',
      location: 'Test ground',
      scheduledAt: new Date(Date.now() - 86400000).toISOString(),
      friendlyOpponentTeamId: away.team.id,
      notes: 'secret tactics and injury notes',
    });
    const friendly = new FriendlyFixturesService(
      database,
      new TeamsService(database),
    );
    const invitations = await friendly.listIncoming(away.id);
    expect(invitations[0].notes).toBeNull();
    const accepted = await friendly.accept(away.id, event.friendlyFixtureId!);
    expect(accepted.event.notes).toBeNull();
    expect(
      (
        await db
          .select()
          .from(schema.events)
          .where(eq(schema.events.id, event.id))
      )[0].notes,
    ).toBe('secret tactics and injury notes');
  });

  it.each(['friendly', 'competition'] as const)(
    '%s: both linked sheets support clock transitions and exact retries',
    async (kind) => {
      const f = await fixture(kind);
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      for (const [actor, sheet] of [
        [f.home, a],
        [f.away, b],
      ] as const) {
        for (const [period, running, elapsedMs] of [
          ['first_half', true, 0],
          ['first_half', false, 60000],
          ['first_half', true, 60000],
          ['half_time', false, 2700000],
          ['second_half', true, 2700000],
          ['full_time', false, 5400000],
        ] as const) {
          const input = {
            operationId: randomUUID(),
            clientCreatedAt: new Date().toISOString(),
            baseRevision: 0,
            period,
            running,
            elapsedMs,
          };
          await matches.updateClock(actor.id, sheet.id, input);
          await matches.updateClock(actor.id, sheet.id, input);
          const [operation] = await db
            .select()
            .from(schema.matchClockOperations)
            .where(eq(schema.matchClockOperations.id, input.operationId));
          expect(operation.sessionId).toBe(a.sharedMatchId);
          expect(operation.appliedRevision).toBeGreaterThan(0);
        }
      }
    },
  );

  it('returns 409 for conflicting clock operation ID reuse without creating another operation', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const input = {
      operationId: randomUUID(),
      clientCreatedAt: new Date().toISOString(),
      baseRevision: 0,
      period: 'first_half' as const,
      running: true,
      elapsedMs: 0,
    };
    await matches.updateClock(f.home.id, a.id, input);
    await expect(
      matches.updateClock(f.home.id, a.id, { ...input, running: false }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'MATCH_CLOCK_OPERATION_ID_REUSED' },
    });
    expect(
      await db
        .select()
        .from(schema.matchClockOperations)
        .where(eq(schema.matchClockOperations.id, input.operationId)),
    ).toHaveLength(1);
  });

  function streamQuery(
    name: string,
    actor: typeof schema.user.$inferSelect,
    teamId: string,
    enabled = true,
  ) {
    const config = readFileSync(
      resolve(__dirname, '../../../powersync/sync-config.yaml'),
      'utf8',
    );
    const block = config.split(`  ${name}:`)[1].split(/\n {2}[a-z_]+:/)[0];
    return block
      .split(/query:\s*\|\s*\n/)[1]
      .replace(/^\s*#.*$/gm, '')
      .replace(/auth\.parameter\('([^']+)'\)/g, (_match, claim: string) => {
        const claims: Record<string, string> = {
          team_id: teamId,
          user_id: actor.id,
          two_sided_live_logging: enabled ? 'true' : 'false',
        };
        return `'${claims[claim].replaceAll("'", "''")}'`;
      });
  }

  it('executes every actual stream SQL with participant, third-team, flag-off and revoked claims', async () => {
    const f = await fixture('competition');
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    await matches.logEvent(f.home.id, a.id, {
      clientRequestId: randomUUID(),
      team: 'own',
      eventType: 'goal',
      athleteId: f.home.athletes[0].id,
      minute: 1,
      period: 'first_half',
      matchElapsedMs: 60000,
      detail: 'private',
    });
    await matches.logEvent(f.away.id, b.id, {
      clientRequestId: randomUUID(),
      team: 'opponent',
      eventType: 'goal',
      minute: 1,
      period: 'first_half',
      matchElapsedMs: 61000,
    });
    await matches.logEvent(f.home.id, a.id, {
      clientRequestId: randomUUID(),
      team: 'own',
      eventType: 'injury',
      athleteId: f.home.athletes[0].id,
      minute: 2,
    });
    await matches.updateClock(f.home.id, a.id, {
      period: 'first_half',
      running: true,
      elapsedMs: 0,
    });
    const reviews = await matches.listEventReviews(f.away.id, b.id);
    await matches.resolveEventReview(f.away.id, b.id, reviews[0].id, {
      resolution: 'same_event',
    });
    const config = readFileSync(
      resolve(__dirname, '../../../powersync/sync-config.yaml'),
      'utf8',
    );
    const names = [...config.matchAll(/^ {2}([a-z_]+):/gm)]
      .map((row) => row[1])
      .filter((name) => name !== 'edition');
    const outsider = await coach();
    for (const name of names) {
      const selected = await pg.query(
        streamQuery(name, { id: f.away.id } as never, f.away.team.id),
      );
      if (name.startsWith('shared_')) {
        const reverse = await pg.query(
          streamQuery(name, { id: f.home.id } as never, f.home.team.id),
        );
        expect({
          name,
          present: selected.rows.length + reverse.rows.length > 0,
        }).toEqual({ name, present: true });
        expect(
          (
            await pg.query(
              streamQuery(name, { id: outsider.id } as never, outsider.team.id),
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await pg.query(
              streamQuery(
                name,
                { id: f.away.id } as never,
                f.away.team.id,
                false,
              ),
            )
          ).rows,
        ).toHaveLength(0);
        expect(JSON.stringify(selected.rows)).not.toContain(
          f.home.athletes[0].id,
        );
        expect(JSON.stringify(selected.rows)).not.toContain('injury');
      }
    }
    await db
      .delete(schema.teamMembers)
      .where(eq(schema.teamMembers.userId, f.away.id));
    for (const name of names)
      expect(
        (
          await pg.query(
            streamQuery(name, { id: f.away.id } as never, f.away.team.id),
          )
        ).rows,
      ).toHaveLength(0);
  });
});
