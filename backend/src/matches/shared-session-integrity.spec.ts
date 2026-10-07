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

// These tests call controller methods with explicit users; HTTP authentication
// is covered by the e2e suites. Keep Better Auth's ESM out of this CJS suite.
jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));

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
  async function fixture(
    kind: 'friendly' | 'competition' = 'friendly',
    fixturesPerOpponent: 1 | 2 = 1,
  ) {
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
        fixturesPerOpponent,
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
  async function confirm(userId: string, matchId: string, revision: number) {
    const [sheet] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId));
    const report = sheet.sharedMatchId
      ? await matches.getSessionReport(userId, sheet.sharedMatchId)
      : null;
    return matches.finaliseProjection(
      userId,
      matchId,
      revision,
      report?.reportRevision,
    );
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
        // Model history written before this fixture was enrolled in shared logging.
        await db
          .update(schema.friendlyFixtures)
          .set({ sharedSessionId: null })
          .where(eq(schema.friendlyFixtures.id, f.fixtureId));
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
        await matches.logEvent(f.home.id, a.id, goal());
        await db
          .update(schema.friendlyFixtures)
          .set({ sharedSessionId: a.sharedMatchId })
          .where(eq(schema.friendlyFixtures.id, f.fixtureId));
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
      confirm(f.home.id, a.id, 0),
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
  it.each(['home', 'away'] as const)(
    'publishes one canonical 2-1 fixture result with %s confirming first',
    async (firstSide) => {
      const f = await fixture('competition');
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      await matches.logEvent(f.home.id, a.id, {
        ...goal(),
        team: 'own',
        athleteId: f.home.athletes[0].id,
      });
      await matches.logEvent(f.home.id, a.id, {
        ...goal(),
        minute: 20,
        team: 'own',
        athleteId: f.home.athletes[1].id,
      });
      await matches.logEvent(f.away.id, b.id, {
        ...goal(),
        minute: 40,
        team: 'own',
        athleteId: f.away.athletes[0].id,
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
      const order =
        firstSide === 'home'
          ? ([
              [f.home, a],
              [f.away, b],
            ] as const)
          : ([
              [f.away, b],
              [f.home, a],
            ] as const);
      await confirm(
        order[0][0].id,
        order[0][1].id,
        await revision(order[0][1].id),
      );
      const pending = await matches.getSessionReport(
        f.home.id,
        a.sharedMatchId!,
      );
      expect(pending.score).toEqual({ home: 2, away: 1 });
      expect(pending.finalStatus).toBe('awaiting_confirmation');
      expect(pending.confirmations[firstSide]).not.toBeNull();
      expect(
        pending.confirmations[firstSide === 'home' ? 'away' : 'home'],
      ).toBeNull();
      expect(
        (await competitions.findOne(f.home.id, f.competitionId!)).results,
      ).toHaveLength(0);
      expect(
        (
          await db
            .select()
            .from(schema.competitionFixtures)
            .where(eq(schema.competitionFixtures.id, f.fixtureId))
        )[0].status,
      ).toBe('scheduled');
      await confirm(
        order[1][0].id,
        order[1][1].id,
        await revision(order[1][1].id),
      );
      for (const side of [f.home, f.away, f.home]) {
        const report = await matches.getSessionReport(
          side.id,
          a.sharedMatchId!,
        );
        expect(report.score).toEqual({ home: 2, away: 1 });
        expect(report.finalStatus).toBe('finalised');
        const detail = await competitions.findOne(side.id, f.competitionId!);
        expect(detail.results).toHaveLength(1);
        expect(detail.results[0]).toMatchObject({
          id: `fixture:${f.fixtureId}`,
          homeScore: 2,
          awayScore: 1,
        });
        expect(detail.standings.map((row) => row.played)).toEqual([1, 1]);
        expect(
          detail.standings.find((row) => row.teamName === f.home.team.name),
        ).toMatchObject({ goalsFor: 2, goalsAgainst: 1, points: 3 });
        expect(
          detail.standings.find((row) => row.teamName === f.away.team.name),
        ).toMatchObject({ goalsFor: 1, goalsAgainst: 2, points: 0 });
      }
    },
  );
  it.each(['home', 'away'] as const)(
    'clears %s-first confirmation when the canonical score changes',
    async (firstSide) => {
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
      const first =
        firstSide === 'home' ? ([f.home, a] as const) : ([f.away, b] as const);
      const second =
        firstSide === 'home' ? ([f.away, b] as const) : ([f.home, a] as const);
      await confirm(first[0].id, first[1].id, await revision(first[1].id));
      await matches.logEvent(f.away.id, b.id, {
        ...goal(),
        minute: 40,
        team: 'own',
        athleteId: f.away.athletes[0].id,
      });
      const changed = await matches.getSessionReport(
        f.home.id,
        a.sharedMatchId!,
      );
      expect(changed.score).toEqual({ home: 1, away: 1 });
      expect(changed.confirmations).toEqual({ home: null, away: null });
      await confirm(second[0].id, second[1].id, await revision(second[1].id));
      expect(
        (await competitions.findOne(f.home.id, f.competitionId!)).results,
      ).toHaveLength(0);
      await confirm(first[0].id, first[1].id, await revision(first[1].id));
      const detail = await competitions.findOne(f.home.id, f.competitionId!);
      expect(detail.results).toHaveLength(1);
      expect(detail.results[0]).toMatchObject({ homeScore: 1, awayScore: 1 });
    },
  );
  it.each(['home', 'away'] as const)(
    'keeps the report provisional after the %s confirmation times out',
    async (firstSide) => {
      const f = await fixture('competition');
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      await matches.logEvent(f.home.id, a.id, {
        ...goal(),
        team: 'own',
        athleteId: f.home.athletes[0].id,
      });
      await matches.logEvent(f.home.id, a.id, {
        ...goal(),
        minute: 20,
        team: 'own',
        athleteId: f.home.athletes[1].id,
      });
      await matches.logEvent(f.away.id, b.id, {
        ...goal(),
        minute: 40,
        team: 'own',
        athleteId: f.away.athletes[0].id,
      });
      await matches.finish(f.home.id, a.id);
      await matches.finish(f.away.id, b.id);
      const side = firstSide === 'home' ? f.home : f.away;
      const sheet = firstSide === 'home' ? a : b;
      const [projection] = await db
        .select()
        .from(schema.matchProjectionState)
        .where(eq(schema.matchProjectionState.matchId, sheet.id));
      await confirm(side.id, sheet.id, projection.revision);
      await db
        .update(schema.matchSessions)
        .set(
          firstSide === 'home'
            ? { homeConfirmedAt: new Date(Date.now() - 86400001) }
            : { awayConfirmedAt: new Date(Date.now() - 86400001) },
        )
        .where(eq(schema.matchSessions.id, a.sharedMatchId!));
      for (const viewer of [f.home, f.away]) {
        const report = await matches.getSessionReport(
          viewer.id,
          a.sharedMatchId!,
        );
        expect(report.score).toEqual({ home: 2, away: 1 });
        expect(report.finalStatus).toBe('awaiting_confirmation');
        const detail = await competitions.findOne(viewer.id, f.competitionId!);
        expect(detail.results).toHaveLength(0);
        expect(detail.standings.map((row) => row.played)).toEqual([0, 0]);
      }
    },
  );
  async function requestAmendment(
    userId: string,
    matchId: string,
    dto: Omit<
      import('./matches.schemas').RequestMatchAmendmentDto,
      'expectedSessionRevision'
    > & { replacement?: Record<string, unknown>; canonicalEventId?: string },
  ) {
    // Only valid participants can read the report, just as in the UI.
    const [sheet] = await db
      .select()
      .from(schema.matches)
      .where(eq(schema.matches.id, matchId));
    const [session] = await db
      .select()
      .from(schema.matchSessions)
      .where(eq(schema.matchSessions.id, sheet.sharedMatchId!));
    return matches.requestAmendment(userId, matchId, {
      ...dto,
      expectedSessionRevision: session.reportRevision,
    } as import('./matches.schemas').RequestMatchAmendmentDto);
  }
  async function confirmedFixture(
    kind: 'friendly' | 'competition' = 'friendly',
  ) {
    const f = await fixture(kind);
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    const logged = await matches.logEvent(f.home.id, a.id, {
      ...goal(),
      team: 'own',
      athleteId: f.home.athletes[0].id,
    });
    await matches.finish(f.home.id, a.id);
    await matches.finish(f.away.id, b.id);
    for (const [actor, sheet] of [
      [f.home, a],
      [f.away, b],
    ] as const) {
      const view = await matches.findOne(actor.id, sheet.id);
      await confirm(actor.id, sheet.id, view.projection.revision);
    }
    return { f, a, b, logged };
  }

  it.each(['home', 'away'] as const)(
    'cross-team duplicates wait for both decisions with %s voting first',
    async (firstSide) => {
      const f = await fixture();
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      await matches.logEvent(f.home.id, a.id, {
        ...goal(),
        team: 'own',
        athleteId: f.home.athletes[0].id,
      });
      await matches.logEvent(f.away.id, b.id, goal());
      const [review] = await matches.listEventReviews(f.home.id, a.id);
      expect(review.crossTeam).toBe(true);
      expect(
        review.observations.map((row) => row.sourceTeamName).sort(),
      ).toEqual([f.home.team.name, f.away.team.name].sort());
      const first =
        firstSide === 'home' ? ([f.home, a] as const) : ([f.away, b] as const);
      const second =
        firstSide === 'home' ? ([f.away, b] as const) : ([f.home, a] as const);
      const operationId = randomUUID();
      await matches.resolveEventReview(
        first[0].id,
        first[1].id,
        review.id,
        { resolution: 'same_event' },
        operationId,
      );
      let report = await matches.getSessionReport(f.home.id, a.sharedMatchId!);
      expect(report.score).toEqual({ home: 2, away: 0 });
      expect(report.reviews[0].status).toBe('open');
      const revision = report.reportRevision;
      await matches.resolveEventReview(
        first[0].id,
        first[1].id,
        review.id,
        { resolution: 'same_event' },
        operationId,
      );
      expect(
        (await matches.getSessionReport(f.home.id, a.sharedMatchId!))
          .reportRevision,
      ).toBe(revision);
      await matches.resolveEventReview(second[0].id, second[1].id, review.id, {
        resolution: 'separate_events',
      });
      report = await matches.getSessionReport(f.home.id, a.sharedMatchId!);
      expect(report.reviews[0].status).toBe('open');
      await matches.finish(f.home.id, a.id);
      await expect(
        confirm(
          f.home.id,
          a.id,
          (await matches.findOne(f.home.id, a.id)).projection.revision,
        ),
      ).rejects.toMatchObject({ status: 409 });
      await matches.resolveEventReview(second[0].id, second[1].id, review.id, {
        resolution: 'same_event',
      });
      report = await matches.getSessionReport(f.home.id, a.sharedMatchId!);
      expect(report.reviews[0].status).toBe('resolved');
      expect(report.score).toEqual({ home: 1, away: 0 });
      await matches.resolveEventReview(first[0].id, first[1].id, review.id, {
        resolution: 'separate_events',
      });
      expect(
        (await matches.getSessionReport(f.home.id, a.sharedMatchId!)).score
          .home,
      ).toBe(1);
      await matches.resolveEventReview(second[0].id, second[1].id, review.id, {
        resolution: 'separate_events',
      });
      expect(
        (await matches.getSessionReport(f.home.id, a.sharedMatchId!)).score
          .home,
      ).toBe(2);
    },
  );

  it('refuses a stale shared revision even if the private sheet revision is current', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    await matches.finish(f.home.id, a.id);
    await matches.finish(f.away.id, b.id);
    const old = await matches.getSessionReport(f.home.id, a.sharedMatchId!);
    await matches.logEvent(f.away.id, b.id, {
      ...goal(),
      team: 'own',
      athleteId: f.away.athletes[0].id,
    });
    const current = await matches.findOne(f.home.id, a.id);
    await expect(
      matches.finaliseProjection(
        f.home.id,
        a.id,
        current.projection.revision,
        old.reportRevision,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!))
        .confirmations.home,
    ).toBeNull();
  });

  it.each(['friendly', 'competition'] as const)(
    '%s: locks the official report and publishes an agreed deletion atomically',
    async (kind) => {
      const { f, a, b, logged } = await confirmedFixture(kind);
      await expect(
        matches.reopenProjection(f.home.id, a.id, 'Try to reopen'),
      ).rejects.toMatchObject({ status: 400 });
      await expect(
        db
          .update(schema.matchEvents)
          .set({ minute: 2 })
          .where(eq(schema.matchEvents.id, logged.id)),
      ).rejects.toThrow();
      const proposal = await requestAmendment(f.home.id, a.id, {
        id: randomUUID(),
        action: 'void',
        canonicalEventId: logged.id,
        reason: 'This goal was disallowed',
      });
      expect(
        (await matches.getSessionReport(f.away.id, a.sharedMatchId!)).score
          .home,
      ).toBe(1);
      const [review] = await matches.listAmendments(f.away.id, b.id);
      expect(review.proposedScore).toEqual({ home: 0, away: 0 });
      expect(JSON.stringify(review)).not.toContain(f.home.athletes[0].id);
      const result = await matches.respondAmendment(
        f.away.id,
        b.id,
        proposal.id,
        'approve',
      );
      expect(result.status).toBe('accepted');
      for (const actor of [f.home, f.away]) {
        const report = await matches.getSessionReport(
          actor.id,
          a.sharedMatchId!,
        );
        expect(report.finalStatus).toBe('finalised');
        expect(report.score).toEqual({ home: 0, away: 0 });
        expect(report.timeline).toHaveLength(0);
        if (f.competitionId) {
          const detail = await competitions.findOne(actor.id, f.competitionId);
          expect(detail.results).toHaveLength(1);
          expect(detail.results[0]).toMatchObject({
            homeScore: 0,
            awayScore: 0,
          });
        }
      }
      expect(
        (
          await matches.respondAmendment(
            f.away.id,
            b.id,
            proposal.id,
            'approve',
          )
        ).status,
      ).toBe('accepted');
    },
  );

  it('preserves late offline evidence as a proposal and retries without duplicates', async () => {
    const { f, a, b } = await confirmedFixture();
    const input = { ...goal(), minute: 30, matchElapsedMs: 1800000 };
    const request = {
      items: [{ kind: 'observation' as const, matchId: b.id, payload: input }],
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await sync.upload({ id: f.away.id } as never, request);
      expect(result.receipts[0]).toMatchObject({
        outcome: 'accepted',
        canonicalEventId: null,
      });
    }
    const report = await matches.getSessionReport(f.home.id, a.sharedMatchId!);
    expect(report.score.home).toBe(1);
    expect(report.finalStatus).toBe('finalised');
    expect(
      await db
        .select()
        .from(schema.matchEventObservations)
        .where(eq(schema.matchEventObservations.id, input.clientRequestId)),
    ).toHaveLength(1);
    const proposals = await matches.listAmendments(f.home.id, a.id);
    expect(proposals).toHaveLength(1);
    await matches.respondAmendment(f.home.id, a.id, proposals[0].id, 'approve');
    expect(
      (await matches.getSessionReport(f.away.id, a.sharedMatchId!)).score.home,
    ).toBe(1);
    await matches.respondAmendment(f.away.id, b.id, proposals[0].id, 'approve');
    expect(
      (await matches.getSessionReport(f.away.id, a.sharedMatchId!)).score.home,
    ).toBe(2);
  });

  it('rejects amendments from outsiders and assistants, and preserves the result on requested changes', async () => {
    const { f, a, b, logged } = await confirmedFixture();
    const outsider = await coach();
    const proposal = {
      id: randomUUID(),
      action: 'correct' as const,
      canonicalEventId: logged.id,
      replacement: { minute: 8 },
      reason: 'Correct the goal time',
    };
    await expect(
      requestAmendment(outsider.id, a.id, proposal),
    ).rejects.toMatchObject({ status: 404 });
    await requestAmendment(f.home.id, a.id, proposal);
    await expect(
      matches.respondAmendment(outsider.id, b.id, proposal.id, 'approve'),
    ).rejects.toMatchObject({ status: 404 });
    await matches.respondAmendment(
      f.away.id,
      b.id,
      proposal.id,
      'request_changes',
      'The goal was in minute nine',
    );
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!)).timeline[0]
        .minute,
    ).toBe(1);
    const revision = await requestAmendment(f.home.id, a.id, {
      ...proposal,
      id: randomUUID(),
      replacement: { minute: 9 },
    });
    expect(
      (await matches.respondAmendment(f.away.id, b.id, revision.id, 'approve'))
        .status,
    ).toBe('accepted');
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!)).timeline[0]
        .minute,
    ).toBe(9);
    await db
      .update(schema.teamMembers)
      .set({ role: 'assistant' })
      .where(eq(schema.teamMembers.userId, f.home.id));
    await expect(
      requestAmendment(f.home.id, a.id, { ...proposal, id: randomUUID() }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('stales competing amendments after an accepted change and keeps old approvals from authorizing it', async () => {
    const { f, a, b, logged } = await confirmedFixture();
    const proposal = {
      id: randomUUID(),
      action: 'correct' as const,
      canonicalEventId: logged.id,
      replacement: { minute: 8 },
      reason: 'Correct the event time',
    };
    await requestAmendment(f.home.id, a.id, proposal);
    const other = { ...proposal, id: randomUUID(), replacement: { minute: 9 } };
    await requestAmendment(f.away.id, b.id, other);
    await matches.respondAmendment(f.away.id, b.id, proposal.id, 'approve');
    expect(
      (await matches.respondAmendment(f.home.id, a.id, other.id, 'approve'))
        .status,
    ).toBe('stale');
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!)).timeline[0]
        .minute,
    ).toBe(8);
  });

  it('turns queued corrections and deletions into amendments after confirmation', async () => {
    const { f, a, logged } = await confirmedFixture();
    await matches.updateEvent(f.home.id, a.id, logged.id, { minute: 9 });
    await matches.deleteEvent(f.home.id, a.id, logged.id);
    const report = await matches.getSessionReport(f.home.id, a.sharedMatchId!);
    expect(report.timeline[0].minute).toBe(1);
    expect(report.score.home).toBe(1);
    expect(await matches.listAmendments(f.home.id, a.id)).toHaveLength(2);
  });

  it('withdraws only the requesting team confirmation', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    await matches.finish(f.home.id, a.id);
    await matches.finish(f.away.id, b.id);
    await confirm(
      f.home.id,
      a.id,
      (await matches.findOne(f.home.id, a.id)).projection.revision,
    );
    await matches.reopenProjection(
      f.away.id,
      b.id,
      'Withdraw own confirmation',
    );
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!))
        .confirmations.home,
    ).not.toBeNull();
    await matches.reopenProjection(
      f.home.id,
      a.id,
      'Withdraw own confirmation',
    );
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!))
        .confirmations.home,
    ).toBeNull();
  });

  it('counts reverse round-robin legs as two distinct fixture results', async () => {
    const f = await fixture('competition', 2);
    const fixtures = await db
      .select()
      .from(schema.competitionFixtures)
      .where(eq(schema.competitionFixtures.competitionId, f.competitionId!));
    expect(fixtures).toHaveLength(2);
    expect(fixtures[0].homeCompetitionTeamId).toBe(
      fixtures[1].awayCompetitionTeamId,
    );
    const sessionIds = new Set<string>();
    for (const fixtureRow of fixtures) {
      await db
        .update(schema.competitionFixtures)
        .set({ scheduledAt: new Date(Date.now() - 86400000) })
        .where(eq(schema.competitionFixtures.id, fixtureRow.id));
      await db
        .update(schema.competitionFixtures)
        .set({
          scheduleConfirmedAt: new Date(),
          homeScheduleResponse: 'external_confirmed',
          awayScheduleResponse: 'external_confirmed',
        })
        .where(eq(schema.competitionFixtures.id, fixtureRow.id));
      const rows = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.competitionFixtureId, fixtureRow.id));
      const a = await f.start(
        f.home,
        rows.find((row) => row.teamId === f.home.team.id)!.id,
      );
      const b = await f.start(
        f.away,
        rows.find((row) => row.teamId === f.away.team.id)!.id,
      );
      expect(a.sharedMatchId).toBe(b.sharedMatchId);
      sessionIds.add(a.sharedMatchId!);
      await matches.logEvent(f.home.id, a.id, {
        ...goal(),
        team: 'own',
        athleteId: f.home.athletes[0].id,
      });
      await matches.finish(f.home.id, a.id);
      await matches.finish(f.away.id, b.id);
      for (const [side, sheet] of [
        [f.away, b],
        [f.home, a],
      ] as const) {
        const [projection] = await db
          .select()
          .from(schema.matchProjectionState)
          .where(eq(schema.matchProjectionState.matchId, sheet.id));
        await confirm(side.id, sheet.id, projection.revision);
      }
    }
    expect(sessionIds.size).toBe(2);
    const detail = await competitions.findOne(f.home.id, f.competitionId!);
    expect(detail.results).toHaveLength(2);
    expect(new Set(detail.results.map((row) => row.id)).size).toBe(2);
    expect(detail.standings.map((row) => row.played)).toEqual([2, 2]);
    expect(
      detail.standings.find((row) => row.teamName === f.home.team.name),
    ).toMatchObject({ goalsFor: 2, goalsAgainst: 0, points: 6 });
  });
  it('review changes clear pending confirmations while private injuries and retries retain them', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    await f.start(f.away, f.awayEvent);
    const input = {
      ...goal(),
      team: 'own' as const,
      athleteId: f.home.athletes[0].id,
    };
    const canonical = await matches.logEvent(f.home.id, a.id, input);
    await matches.finish(f.home.id, a.id);
    const [projection] = await db
      .select()
      .from(schema.matchProjectionState)
      .where(eq(schema.matchProjectionState.matchId, a.id));
    await confirm(f.home.id, a.id, projection.revision);
    await matches.logEvent(f.home.id, a.id, input);
    await matches.logEvent(f.home.id, a.id, {
      ...goal(),
      team: 'own',
      eventType: 'injury',
      athleteId: f.home.athletes[0].id,
    });
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!))
        .confirmations.home,
    ).not.toBeNull();
    await db.insert(schema.matchEventReviews).values({
      matchId: a.id,
      sessionId: a.sharedMatchId!,
      canonicalEventId: canonical.id,
      reason: 'possible_duplicate',
    });
    expect(
      (await matches.getSessionReport(f.home.id, a.sharedMatchId!))
        .confirmations,
    ).toEqual({ home: null, away: null });
    const participants = await db
      .select()
      .from(schema.matchSessionParticipants)
      .where(eq(schema.matchSessionParticipants.sessionId, a.sharedMatchId!));
    expect(
      participants.every((row) => row.confirmationState === 'pending'),
    ).toBe(true);
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
  it('publication requires both confirmations and no disputed reviews', async () => {
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
    await db
      .update(schema.matchSessions)
      .set({ finalisedAt: null })
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
    await db
      .update(schema.matchSessions)
      .set({ finalisedAt: new Date() })
      .where(eq(schema.matchSessions.id, a.sharedMatchId!));
    await conflict(
      syncFixtureResult(database, f.competitionId!, source, input),
      'SHARED_MATCH_RESULT_NOT_FINALISED',
    );
    await db
      .update(schema.matchSessions)
      .set({ finalisedAt: null })
      .where(eq(schema.matchSessions.id, a.sharedMatchId!));
    await db
      .delete(schema.matchEventReviews)
      .where(eq(schema.matchEventReviews.id, review.id));
    await conflict(
      syncFixtureResult(database, f.competitionId!, source, input),
      'SHARED_MATCH_RESULT_NOT_FINALISED',
    );
    await db
      .update(schema.matchSessions)
      .set({
        homeConfirmedAt: new Date(),
        awayConfirmedAt: new Date(),
        finalisedAt: new Date(),
      })
      .where(eq(schema.matchSessions.id, a.sharedMatchId!));
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
      if (kind === 'flag-off')
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
      const f = await fixture();
      if (kind === 'manual')
        await db
          .update(schema.events)
          .set({ friendlyFixtureId: null })
          .where(eq(schema.events.id, f.homeEvent));
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
