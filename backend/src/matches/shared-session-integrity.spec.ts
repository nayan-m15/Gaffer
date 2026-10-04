import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from '../database/schema';
import { DatabaseService } from '../database/database.service';
import { TeamsService } from '../teams/teams.service';
import { EventsService } from '../events/events.service';
import { FriendlyFixturesService } from '../friendly-fixtures/friendly-fixtures.service';
import { CompetitionsService } from '../competitions/competitions.service';
import { syncFixtureResult } from '../competitions/competition-fixture-results';
import { MatchesService } from './matches.service';
import { SyncController } from '../sync/sync.controller';

// Real SQL/functions and service paths; no external database or user records.
describe('Phase 1 shared-session integrity', () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let database: DatabaseService;
  let events: EventsService;
  let matches: MatchesService;
  let competitions: CompetitionsService;
  let sync: SyncController;
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
    sync = new SyncController(teams, matches, database);
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
  async function conflict(action: Promise<unknown>, code: string) {
    await expect(action).rejects.toMatchObject({
      response: { code },
      status: 409,
    });
  }
  const goal = () => ({
    clientRequestId: randomUUID(),
    team: 'opponent' as const,
    eventType: 'goal' as const,
    minute: 1,
    period: 'first_half' as const,
    matchElapsedMs: 60000,
  });
  async function unlink(matchId: string) {
    await db
      .update(schema.matches)
      .set({ sharedMatchId: null })
      .where(eq(schema.matches.id, matchId));
  }
  async function sheet(matchId: string) {
    return (
      await db
        .select()
        .from(schema.matches)
        .where(eq(schema.matches.id, matchId))
    )[0];
  }

  it.each(['friendly', 'competition'] as const)(
    '%s: both coaches and retries retain one fixture session and authoritative sides',
    async (kind) => {
      const f = await fixture(kind);
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      expect(a.id).not.toBe(b.id);
      expect(a.sharedMatchId).toBeTruthy();
      expect(a.sharedMatchId).toBe(b.sharedMatchId);
      expect(a.isHome).toBe(true);
      expect(b.isHome).toBe(false);
      await db
        .update(schema.events)
        .set({ status: 'completed' })
        .where(eq(schema.events.id, f.homeEvent));
      expect((await f.start(f.home, f.homeEvent)).id).toBe(a.id);
      expect((await f.start(f.away, f.awayEvent)).sharedMatchId).toBe(
        a.sharedMatchId,
      );
    },
  );
  it('attaches a safe existing null-linked sheet without creating a new session', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    await unlink(a.id);
    await db
      .update(schema.matches)
      .set({ isHome: false })
      .where(eq(schema.matches.id, a.id));
    const retry = await f.start(f.home, f.homeEvent);
    expect(retry.sharedMatchId).toBe(a.sharedMatchId);
    expect(retry.isHome).toBe(true);
  });
  it.each(['observation', 'finalisation', 'clock'] as const)(
    'refuses to attach a null-linked sheet with legacy %s evidence',
    async (evidence) => {
      const f = await fixture();
      const a = await f.start(f.home, f.homeEvent);
      await unlink(a.id);
      if (evidence === 'observation') {
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
        await matches.logEvent(f.home.id, a.id, goal());
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
      }
      if (evidence === 'finalisation') {
        await db.insert(schema.matchProjectionState).values({
          matchId: a.id,
          inputDigest: 'test',
          finalisationState: 'finalised',
        });
      }
      if (evidence === 'clock') {
        await db.insert(schema.matchClockOperations).values({
          id: randomUUID(),
          matchId: a.id,
          actorUserId: f.home.id,
          period: 'first_half',
          elapsedMs: 0,
          running: false,
          baseRevision: 0,
          appliedRevision: 1,
          outcome: 'applied',
          payloadHash: 'test',
          clientCreatedAt: new Date(),
        });
      }
      await conflict(
        f.start(f.home, f.homeEvent),
        'SHARED_MATCH_RECONCILIATION_REQUIRED',
      );
      expect((await sheet(a.id)).sharedMatchId).toBeNull();
    },
  );
  it('never overwrites a conflicting non-null sheet session', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const [other] = await db
      .insert(schema.matchSessions)
      .values({})
      .returning();
    await db
      .update(schema.matches)
      .set({ sharedMatchId: other.id })
      .where(eq(schema.matches.id, a.id));
    await conflict(
      f.start(f.home, f.homeEvent),
      'SHARED_MATCH_SESSION_CONFLICT',
    );
    expect((await sheet(a.id)).sharedMatchId).toBe(other.id);
  });
  it('rejects online ingestion before creating any legacy observation', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    await unlink(a.id);
    const input = goal();
    await conflict(
      matches.logEvent(f.home.id, a.id, input),
      'SHARED_MATCH_SESSION_REQUIRED',
    );
    expect(
      await db
        .select()
        .from(schema.matchEventObservations)
        .where(eq(schema.matchEventObservations.id, input.clientRequestId)),
    ).toEqual([]);
  });
  it('rejects offline upload with a stable receipt code and no observation', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    await unlink(a.id);
    const input = goal();
    const result = await sync.upload({ id: f.home.id } as never, {
      items: [{ kind: 'observation', matchId: a.id, payload: input }],
    });
    expect(result.receipts).toEqual([
      expect.objectContaining({
        outcome: 'rejected',
        safeErrorCode: 'SHARED_MATCH_SESSION_REQUIRED',
      }),
    ]);
    expect(
      await db
        .select()
        .from(schema.matchEventObservations)
        .where(eq(schema.matchEventObservations.id, input.clientRequestId)),
    ).toEqual([]);
  });
  it('blocks null-sheet finalisation and direct legacy publication into a shared fixture, including flag off', async () => {
    const f = await fixture('competition');
    const a = await f.start(f.home, f.homeEvent);
    await unlink(a.id);
    await db
      .update(schema.events)
      .set({ status: 'completed' })
      .where(eq(schema.events.id, f.homeEvent));
    await conflict(
      matches.finaliseProjection(f.home.id, a.id, 0),
      'SHARED_MATCH_SESSION_REQUIRED',
    );
    const [row] = await db
      .select()
      .from(schema.competitionFixtures)
      .where(eq(schema.competitionFixtures.id, f.fixtureId));
    const input = {
      homeCompetitionTeamId: row.homeCompetitionTeamId!,
      awayCompetitionTeamId: row.awayCompetitionTeamId!,
      homeScore: 0,
      awayScore: 3,
    };
    for (const flag of ['true', 'false']) {
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = flag;
      await conflict(
        syncFixtureResult(
          database,
          f.competitionId!,
          { kind: 'live', id: a.id },
          input,
        ),
        'SHARED_MATCH_SESSION_REQUIRED',
      );
    }
    const [after] = await db
      .select()
      .from(schema.competitionFixtures)
      .where(eq(schema.competitionFixtures.id, f.fixtureId));
    expect(after.status).toBe('scheduled');
    expect(after.linkedMatchId).toBeNull();
    expect(after.homeScore).toBeNull();
  });
  it('rejects matching-session publication before bilateral finalisation and rejects a mismatching session', async () => {
    const f = await fixture('competition');
    const a = await f.start(f.home, f.homeEvent);
    const [row] = await db
      .select()
      .from(schema.competitionFixtures)
      .where(eq(schema.competitionFixtures.id, f.fixtureId));
    const input = {
      homeCompetitionTeamId: row.homeCompetitionTeamId!,
      awayCompetitionTeamId: row.awayCompetitionTeamId!,
      homeScore: 1,
      awayScore: 0,
    };
    await conflict(
      syncFixtureResult(
        database,
        f.competitionId!,
        { kind: 'live', id: a.id, sessionId: a.sharedMatchId! },
        input,
      ),
      'SHARED_MATCH_RESULT_NOT_FINALISED',
    );
    await conflict(
      syncFixtureResult(
        database,
        f.competitionId!,
        { kind: 'live', id: a.id, sessionId: randomUUID() },
        input,
      ),
      'SHARED_MATCH_SESSION_CONFLICT',
    );
  });
  it('valid bilateral confirmation publishes exactly one correctly oriented fixture result', async () => {
    const f = await fixture('competition');
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    await matches.logEvent(f.home.id, a.id, {
      ...goal(),
      team: 'own',
      athleteId: f.home.athletes[0].id,
    });
    await matches.finish(f.home.id, a.id);
    await matches.finish(f.away.id, b.id);
    const revision = async (id: string) =>
      (
        await db
          .select()
          .from(schema.matchProjectionState)
          .where(eq(schema.matchProjectionState.matchId, id))
      )[0].revision;
    await matches.finaliseProjection(f.home.id, a.id, await revision(a.id));
    expect(
      (
        await db
          .select()
          .from(schema.competitionFixtures)
          .where(eq(schema.competitionFixtures.id, f.fixtureId))
      )[0].status,
    ).toBe('scheduled');
    await matches.finaliseProjection(f.away.id, b.id, await revision(b.id));
    const detail = await competitions.findOne(f.home.id, f.competitionId!);
    expect(detail.results).toHaveLength(1);
    expect(detail.results[0]).toMatchObject({ homeScore: 1, awayScore: 0 });
    expect(detail.standings.map((row) => row.played)).toEqual([1, 1]);
  });
  it('projection INSERT and unchanged-digest refresh UPDATE track sheet session, leaving legacy NULL', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    await db.execute(sql`select refresh_match_projection(${a.id}::uuid)`);
    const projection = async () =>
      (
        await db
          .select()
          .from(schema.matchProjectionState)
          .where(eq(schema.matchProjectionState.matchId, a.id))
      )[0];
    expect((await projection()).sessionId).toBe(a.sharedMatchId);
    await db
      .update(schema.matchProjectionState)
      .set({ sessionId: null })
      .where(eq(schema.matchProjectionState.matchId, a.id));
    await db.execute(sql`select refresh_match_projection(${a.id}::uuid)`);
    expect((await projection()).sessionId).toBe(a.sharedMatchId);
    const revision = (await projection()).revision;
    await db
      .update(schema.matchProjectionState)
      .set({ sessionId: null, inputDigest: 'changed-input' })
      .where(eq(schema.matchProjectionState.matchId, a.id));
    await db.execute(sql`select refresh_match_projection(${a.id}::uuid)`);
    expect((await projection()).sessionId).toBe(a.sharedMatchId);
    expect((await projection()).revision).toBe(revision + 1);
    await unlink(a.id);
    await db.execute(sql`select refresh_match_projection(${a.id}::uuid)`);
    expect((await projection()).sessionId).toBeNull();
  });
  it('diagnostic distinguishes the fixture session from an owning sheet missing or conflicting link', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    expect(
      await events.getEventLinkDiagnostic(f.home.id, f.homeEvent),
    ).toMatchObject({
      status: 'correctly_linked',
      teamId: f.home.team.id,
      owningMatchId: a.id,
      owningMatchSharedSessionId: a.sharedMatchId,
      fixtureSharedSessionId: a.sharedMatchId,
      sheetSessionMatchesFixture: true,
      participantSide: 'home',
    });
    await unlink(a.id);
    expect(
      await events.getEventLinkDiagnostic(f.home.id, f.homeEvent),
    ).toMatchObject({
      status: 'missing_sheet_link',
      owningMatchSharedSessionId: null,
      fixtureSharedSessionId: a.sharedMatchId,
      sheetSessionMatchesFixture: false,
    });
    const [other] = await db
      .insert(schema.matchSessions)
      .values({})
      .returning();
    await db
      .update(schema.matches)
      .set({ sharedMatchId: other.id })
      .where(eq(schema.matches.id, a.id));
    expect(
      await events.getEventLinkDiagnostic(f.home.id, f.homeEvent),
    ).toMatchObject({
      status: 'conflicting_sheet_link',
      sheetSessionMatchesFixture: false,
    });
  });
  it('additive migration does not backfill or relink existing rows, and its atomic attachment rechecks evidence', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    await matches.logEvent(f.home.id, a.id, goal());
    await unlink(a.id);
    const before = await sheet(a.id);
    const projection = (
      await db
        .select()
        .from(schema.matchProjectionState)
        .where(eq(schema.matchProjectionState.matchId, a.id))
    )[0];
    await pg.exec(
      readFileSync(
        resolve(__dirname, '../../drizzle/0052_shared_session_integrity.sql'),
        'utf8',
      ),
    );
    expect(await sheet(a.id)).toEqual(before);
    expect(
      (
        await db
          .select()
          .from(schema.matchProjectionState)
          .where(eq(schema.matchProjectionState.matchId, a.id))
      )[0],
    ).toEqual(projection);
    const result = await db.execute<{ result: string }>(
      sql`select attach_match_session_if_safe(${a.id}::uuid, ${a.sharedMatchId}::uuid, true) as result`,
    );
    expect(result.rows[0].result).toBe('SHARED_MATCH_RECONCILIATION_REQUIRED');
    expect((await sheet(a.id)).sharedMatchId).toBeNull();
  });
  it('publication checks review disputes and preserves the existing 24-hour confirmation rule', async () => {
    const f = await fixture('competition');
    const a = await f.start(f.home, f.homeEvent);
    await matches.logEvent(f.home.id, a.id, {
      ...goal(),
      team: 'own',
      athleteId: f.home.athletes[0].id,
    });
    await matches.finish(f.home.id, a.id);
    const [row] = await db
      .select()
      .from(schema.competitionFixtures)
      .where(eq(schema.competitionFixtures.id, f.fixtureId));
    const input = {
      homeCompetitionTeamId: row.homeCompetitionTeamId!,
      awayCompetitionTeamId: row.awayCompetitionTeamId!,
      homeScore: 1,
      awayScore: 0,
    };
    const source = {
      kind: 'live' as const,
      id: a.id,
      sessionId: a.sharedMatchId!,
    };
    await db
      .update(schema.matchSessions)
      .set({ homeConfirmedAt: new Date(), finalisedAt: new Date() })
      .where(eq(schema.matchSessions.id, a.sharedMatchId!));
    await conflict(
      syncFixtureResult(database, f.competitionId!, source, input),
      'SHARED_MATCH_RESULT_NOT_FINALISED',
    );
    await db
      .update(schema.matchSessions)
      .set({ homeConfirmedAt: new Date(Date.now() - 86400001) })
      .where(eq(schema.matchSessions.id, a.sharedMatchId!));
    const [canonical] = await db
      .select()
      .from(schema.matchEvents)
      .where(eq(schema.matchEvents.sessionId, a.sharedMatchId!));
    const [review] = await db
      .insert(schema.matchEventReviews)
      .values({
        matchId: a.id,
        sessionId: a.sharedMatchId!,
        canonicalEventId: canonical.id,
        reason: 'test',
        status: 'resolved',
        disputedAt: new Date(),
      })
      .returning();
    await conflict(
      syncFixtureResult(database, f.competitionId!, source, input),
      'SHARED_MATCH_RESULT_NOT_FINALISED',
    );
    await db
      .delete(schema.matchEventReviews)
      .where(eq(schema.matchEventReviews.id, review.id));
    await syncFixtureResult(database, f.competitionId!, source, input);
    expect(
      (
        await db
          .select()
          .from(schema.competitionFixtures)
          .where(eq(schema.competitionFixtures.id, f.fixtureId))
      )[0].status,
    ).toBe('completed');
  });
  it.each(['manual', 'flag-off'] as const)(
    'preserves %s legacy ingestion',
    async (kind) => {
      const f = await fixture();
      if (kind === 'manual')
        await db
          .update(schema.events)
          .set({ friendlyFixtureId: null })
          .where(eq(schema.events.id, f.homeEvent));
      if (kind === 'flag-off')
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
      const a = await f.start(f.home, f.homeEvent);
      const input = goal();
      await matches.logEvent(f.home.id, a.id, input);
      const [row] = await db
        .select()
        .from(schema.matchEventObservations)
        .where(eq(schema.matchEventObservations.id, input.clientRequestId));
      expect(row.sessionId).toBeNull();
    },
  );
});
