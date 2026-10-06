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
    '%s: either coach can delete a post-match public event from the other sheet',
    async (kind) => {
      const f = await fixture(kind);
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      await matches.finish(f.home.id, a.id);
      await matches.finish(f.away.id, b.id);
      for (const [owner, ownerSheet, peer, peerSheet] of [
        [f.home, a, f.away, b],
        [f.away, b, f.home, a],
      ] as const) {
        await matches.logEvent(owner.id, ownerSheet.id, {
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: 'goal',
          minute: 91,
          athleteId: owner.athletes[0].id,
        });
        const before = await matches.getSessionReportForSheet(
          peer.id,
          peerSheet.id,
        );
        const goal = before.timeline.find((row) => row.eventType === 'goal')!;
        expect(goal).toBeDefined();
        const operationId = randomUUID();
        const deleted = await matches.deleteEvent(
          peer.id,
          peerSheet.id,
          goal.id,
          operationId,
        );
        expect(deleted.lifecycleStatus).toBe('voided');
        expect(JSON.stringify(deleted)).not.toContain(owner.athletes[0].id);
        await matches.deleteEvent(peer.id, peerSheet.id, goal.id, operationId);
        for (const [coach, sheet] of [
          [owner, ownerSheet],
          [peer, peerSheet],
        ] as const) {
          const after = await matches.getSessionReportForSheet(
            coach.id,
            sheet.id,
          );
          expect(after.timeline.some((row) => row.id === goal.id)).toBe(false);
          expect(after.score).toEqual({ home: 0, away: 0 });
        }
        const operations = await db
          .select()
          .from(schema.matchEventOperations)
          .where(eq(schema.matchEventOperations.id, operationId));
        expect(operations).toHaveLength(1);
        expect(operations[0]).toMatchObject({
          matchId: peerSheet.id,
          actorUserId: peer.id,
        });
        const outsider = await fixture();
        const outsiderSheet = await outsider.start(
          outsider.home,
          outsider.homeEvent,
        );
        await expect(
          matches.deleteEvent(outsider.home.id, outsiderSheet.id, goal.id),
        ).rejects.toThrow('Match event not found');
      }
      const injury = await matches.logEvent(f.home.id, a.id, {
        clientRequestId: randomUUID(),
        team: 'own',
        eventType: 'injury',
        minute: 92,
        athleteId: f.home.athletes[1].id,
      });
      await expect(
        matches.deleteEvent(f.away.id, b.id, injury.id),
      ).rejects.toThrow('Match event not found');
    },
  );

  it('both reports share formation geometry while retaining private tactical settings on the owner sheet', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    await matches.logEvent(f.home.id, a.id, {
      clientRequestId: randomUUID(),
      team: 'own',
      eventType: 'tactical_change',
      minute: 20,
      period: 'first_half',
      matchElapsedMs: 1200000,
      tacticalChange: {
        formationId: '4-4-2',
        defensiveWidth: 8,
        captainId: f.home.athletes[0].id,
      },
    });
    const home = await matches.getSessionReportForSheet(f.home.id, a.id);
    const away = await matches.getSessionReportForSheet(f.away.id, b.id);
    expect(home.timeline).toEqual(away.timeline);
    expect(home.timeline[0].tacticalChange).toEqual({ formationId: '4-4-2' });
    expect(JSON.stringify(away.timeline)).not.toContain(f.home.athletes[0].id);
    expect(JSON.stringify(away.timeline)).not.toMatch(
      /defensiveWidth|captainId|structuredPayload/,
    );
    const privateRows = await matches.listEvents(f.home.id, a.id);
    expect(privateRows[0].tacticalChange).toMatchObject({
      defensiveWidth: 8,
      captainId: f.home.athletes[0].id,
    });
  });

  it('both reports retain public opponent and substitution labels without roster identities', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    await matches.logEvent(f.home.id, a.id, {
      clientRequestId: randomUUID(),
      team: 'opponent',
      eventType: 'substitution',
      opponentLabel: '#9 Public Player',
      detail: '#12 Public Substitute',
      minute: 10,
      period: 'first_half',
      matchElapsedMs: 600000,
    });
    const homeReport = await matches.getSessionReportForSheet(f.home.id, a.id);
    const awayReport = await matches.getSessionReportForSheet(f.away.id, b.id);
    expect(homeReport.timeline).toEqual(awayReport.timeline);
    expect(homeReport.timeline[0]).toMatchObject({
      player: { name: '#9 Public Player', shirtNumber: null },
      incomingPlayerLabel: '#12 Public Substitute',
      side: 'away',
    });
    expect(homeReport.timeline[0]).not.toHaveProperty('detail');
    expect(homeReport.timeline[0]).not.toHaveProperty('opponentPlayerId');
  });

  it.each(['friendly', 'competition'] as const)(
    '%s: fixture side survives all client choices and flag-off starts cannot split a session',
    async (kind) => {
      for (const [homeChoice, awayChoice] of [
        [true, true],
        [false, false],
        [false, true],
        [true, false],
      ]) {
        const f = await fixture(kind);
        expect(
          (await events.findOne(f.home.id, f.homeEvent)).fixtureIsHome,
        ).toBe(true);
        expect(
          (await events.findOne(f.away.id, f.awayEvent)).fixtureIsHome,
        ).toBe(false);
        for (const [coach, eventId] of [
          [f.home, f.homeEvent],
          [f.away, f.awayEvent],
        ] as const) {
          await events.confirmLineup(coach.id, eventId, {
            startingAthleteIds: coach.athletes.map((a) => a.id),
            formationId: '4-3-3',
            pitchAssignments: { '433-gk': coach.athletes[0].id },
          });
        }
        const start = (
          coach: typeof f.home,
          eventId: string,
          isHome: boolean,
        ) =>
          events.startMatch(coach.id, eventId, {
            opponentName: 'Other team',
            isHome,
            startingAthleteIds: coach.athletes.map((a) => a.id),
            opponentSquadVisibility: 'none',
          });
        const a = await start(f.home, f.homeEvent, homeChoice);
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
        await expect(
          start(f.away, f.awayEvent, awayChoice),
        ).rejects.toMatchObject({
          response: { code: 'SHARED_MATCH_SESSION_REQUIRED' },
        });
        expect(await events.getLineup(f.away.id, f.awayEvent)).not.toBeNull();
        process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
        const b = await start(f.away, f.awayEvent, awayChoice);
        expect(a.isHome).toBe(true);
        expect(b.isHome).toBe(false);
        expect(a.sharedMatchId).toBe(b.sharedMatchId);
        for (const [coach, sheet] of [
          [f.home, a],
          [f.away, b],
        ] as const) {
          const lineup = (await matches.findOne(coach.id, sheet.id))
            .friendlyOpponentLineup;
          expect(lineup).toMatchObject({
            available: true,
            source: 'confirmed',
            formation: '4-3-3',
          });
          expect('starters' in lineup && lineup.starters).toHaveLength(11);
          expect('starters' in lineup && lineup.starters[0].slotId).toBe(
            '433-gk',
          );
        }
        await matches.logEvent(f.home.id, a.id, {
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: 'goal',
          minute: 1,
        });
        await matches.logEvent(f.away.id, b.id, {
          clientRequestId: randomUUID(),
          team: 'own',
          eventType: 'goal',
          minute: 2,
        });
        const home = await matches.getSessionReportForSheet(f.home.id, a.id);
        const away = await matches.getSessionReportForSheet(f.away.id, b.id);
        expect(home.score).toEqual({ home: 1, away: 1 });
        expect(away).toEqual(home);
      }
    },
  );

  it('keeps a linked fixture lineup when both coaches use legacy logging', async () => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    const f = await fixture();
    await events.confirmLineup(f.home.id, f.homeEvent, {
      startingAthleteIds: f.home.athletes.map((a) => a.id),
      formationId: '4-3-3',
      pitchAssignments: { '433-gk': f.home.athletes[0].id },
    });
    const sheet = await f.start(f.home, f.homeEvent);
    expect(sheet.sharedMatchId).toBeNull();
    expect(await events.getLineup(f.home.id, f.homeEvent)).not.toBeNull();
    const lineup = await events.getFriendlyOpponentLineup(
      f.away.id,
      f.awayEvent,
    );
    expect(lineup).toMatchObject({ available: true });
    expect('players' in lineup && lineup.players).toHaveLength(11);
  });

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

  it('reconciles old per-sheet revisions using the most recent shared operation', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    // Before 0054, the home sheet could have a larger revision but an older clock.
    await db
      .update(schema.matches)
      .set({
        clockPeriod: 'first_half',
        clockElapsedMs: 60000,
        clockStartedAt: new Date(),
        clockRevision: 9,
      })
      .where(eq(schema.matches.id, a.id));
    await db
      .update(schema.matches)
      .set({
        clockPeriod: 'half_time',
        clockElapsedMs: 2700000,
        clockStartedAt: null,
        clockRevision: 1,
      })
      .where(eq(schema.matches.id, b.id));
    await db.insert(schema.matchClockOperations).values({
      id: randomUUID(),
      matchId: b.id,
      actorUserId: f.away.id,
      period: 'half_time',
      elapsedMs: 2700000,
      running: false,
      baseRevision: 0,
      appliedRevision: 1,
      outcome: 'applied',
      payloadHash: 'legacy',
      clientCreatedAt: new Date(),
    });
    await matches.updateClock(f.home.id, a.id, {
      operationId: randomUUID(),
      baseRevision: 1,
      period: 'half_time',
      running: false,
      elapsedMs: 2700000,
    });
    expect(
      (await matches.getSessionReportForSheet(f.home.id, a.id)).clock,
    ).toMatchObject({
      period: 'half_time',
      elapsedMs: 2700000,
      running: false,
      revision: 9,
    });
    await matches.updateClock(f.away.id, b.id, {
      operationId: randomUUID(),
      baseRevision: 9,
      period: 'second_half',
      running: true,
      elapsedMs: 2700000,
    });
    const home = await matches.getSessionReportForSheet(f.home.id, a.id);
    expect(home.clock).toMatchObject({
      period: 'second_half',
      revision: 10,
      running: true,
    });
    expect(
      (await matches.getSessionReportForSheet(f.away.id, b.id)).clock,
    ).toEqual(home.clock);
  });

  it.each(['friendly', 'competition'] as const)(
    '%s: alternating coaches persist one clock through halftime, resume and full time',
    async (kind) => {
      const f = await fixture(kind);
      const a = await f.start(f.home, f.homeEvent);
      const b = await f.start(f.away, f.awayEvent);
      let revision = 0;
      for (const [actor, sheet, period, running, elapsedMs] of [
        [f.home, a, 'first_half', true, 0],
        [f.away, b, 'first_half', false, 60000],
        [f.home, a, 'first_half', true, 60000],
        [f.home, a, 'half_time', false, 2700000],
        [f.away, b, 'second_half', true, 2700000],
        [f.home, a, 'second_half', false, 2800000],
        [f.away, b, 'second_half', true, 2800000],
        [f.home, a, 'full_time', false, 5400000],
      ] as const) {
        const input = {
          operationId: randomUUID(),
          clientCreatedAt: new Date().toISOString(),
          baseRevision: revision,
          period,
          running,
          elapsedMs,
        };
        await matches.updateClock(actor.id, sheet.id, input);
        revision += 1;
        const home = await matches.getSessionReportForSheet(f.home.id, a.id);
        const away = await matches.getSessionReportForSheet(f.away.id, b.id);
        expect(home.clock).toEqual(away.clock);
        expect(home.clock).toMatchObject({
          period,
          running,
          elapsedMs,
          revision,
        });
        for (const id of [a.id, b.id]) {
          const [stored] = await db
            .select()
            .from(schema.matches)
            .where(eq(schema.matches.id, id));
          expect(stored).toMatchObject({
            clockPeriod: period,
            clockElapsedMs: elapsedMs,
            clockRevision: revision,
          });
          if (running) expect(stored.clockStartedAt).toBeInstanceOf(Date);
          else expect(stored.clockStartedAt).toBeNull();
        }
        // An exact retry must neither reset the time origin nor advance the revision.
        await matches.updateClock(actor.id, sheet.id, input);
        expect(
          (await matches.getSessionReportForSheet(f.home.id, a.id)).clock,
        ).toEqual(home.clock);
      }
      await matches.finish(f.away.id, b.id);
      expect(
        (await matches.getSessionReportForSheet(f.home.id, a.id)).clock,
      ).toMatchObject({
        period: 'full_time',
        running: false,
        elapsedMs: 5400000,
      });
    },
  );

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
    const single = block.split(/query:\s*\|\s*\n/)[1];
    const query =
      single ??
      block
        .split(/\n\s*-\s*\|\s*\n/)
        .slice(1)
        .map(
          (sql) =>
            `SELECT to_jsonb(stream_row) AS row FROM (${sql}) AS stream_row`,
        )
        .join('\nUNION ALL\n');
    return query
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

  it('backfills review visibility without losing confirmations and revokes it after canonical edits', async () => {
    const f = await fixture();
    const a = await f.start(f.home, f.homeEvent);
    const b = await f.start(f.away, f.awayEvent);
    for (const [actor, sheet, team] of [
      [f.home, a, 'own'],
      [f.away, b, 'opponent'],
    ] as const) {
      await matches.logEvent(actor.id, sheet.id, {
        clientRequestId: randomUUID(),
        team,
        eventType: 'goal',
        minute: 1,
        period: 'first_half',
        matchElapsedMs: 60000,
      });
    }
    const [review] = await matches.listEventReviews(f.away.id, b.id);
    await matches.resolveEventReview(f.away.id, b.id, review.id, {
      resolution: 'same_event',
    });
    const [{ canonicalEventId }] = await db
      .select()
      .from(schema.matchEventReviews)
      .where(eq(schema.matchEventReviews.id, review.id));
    // The merge can choose either candidate as its primary UUID. Create a
    // dependent decision for this review's canonical row to test both gates
    // without depending on random candidate ordering.
    await db.insert(schema.matchEventOperations).values({
      id: randomUUID(),
      matchId: b.id,
      sessionId: a.sharedMatchId,
      actorUserId: f.away.id,
      operationType: 'merge',
      canonicalEventId,
      decision: {},
    });
    const visibility = () =>
      pg.query<{ kind: string; visible: boolean }>(`
      SELECT 'review' AS kind, public_canonical_event AS visible
      FROM match_event_reviews WHERE canonical_event_id = '${canonicalEventId}'
      UNION ALL
      SELECT 'operation', public_canonical_event FROM match_event_operations
      WHERE canonical_event_id = '${canonicalEventId}'`);
    expect((await visibility()).rows).toEqual(
      expect.arrayContaining([
        { kind: 'review', visible: true },
        { kind: 'operation', visible: true },
      ]),
    );

    // Simulate pre-migration rows, then execute the migration's exact backfill.
    await pg.exec(`
      ALTER TABLE match_event_reviews DISABLE TRIGGER match_reviews_derive_public_canonical_event;
      ALTER TABLE match_event_operations DISABLE TRIGGER match_operations_derive_public_canonical_event;
      UPDATE match_event_reviews SET public_canonical_event = false WHERE id = '${review.id}';
      UPDATE match_event_operations SET public_canonical_event = false WHERE canonical_event_id = '${canonicalEventId}';
      ALTER TABLE match_event_reviews ENABLE TRIGGER match_reviews_derive_public_canonical_event;
      ALTER TABLE match_event_operations ENABLE TRIGGER match_operations_derive_public_canonical_event;
      UPDATE match_sessions SET home_confirmed_at = now(), home_confirmed_by_user_id = '${f.home.id}' WHERE id = '${a.sharedMatchId}';
    `);
    const migration = readFileSync(
      resolve(__dirname, '../../drizzle/0055_shared_review_visibility.sql'),
      'utf8',
    );
    await pg.exec(
      `BEGIN; ${migration.slice(migration.indexOf('-- Backfill'))} COMMIT;`,
    );
    expect((await visibility()).rows.every((row) => row.visible)).toBe(true);
    expect(
      (
        await db
          .select()
          .from(schema.matchSessions)
          .where(eq(schema.matchSessions.id, a.sharedMatchId!))
      )[0].homeConfirmedAt,
    ).not.toBeNull();

    await pg.exec(
      `UPDATE match_events SET event_type = 'injury' WHERE id = '${canonicalEventId}'`,
    );
    expect((await visibility()).rows.every((row) => !row.visible)).toBe(true);
    // Forging the stored flag cannot make a private canonical event public.
    await pg.exec(`
      UPDATE match_event_reviews SET public_canonical_event = true WHERE id = '${review.id}';
      UPDATE match_event_operations SET public_canonical_event = true WHERE canonical_event_id = '${canonicalEventId}';
    `);
    expect((await visibility()).rows.every((row) => !row.visible)).toBe(true);
    for (const actor of [f.home, f.away])
      for (const name of [
        'shared_session_match_reviews',
        'shared_session_match_operations',
      ]) {
        const result = await pg.query<{ canonical_event_id: string }>(
          streamQuery(name, actor, actor.team.id),
        );
        expect(
          result.rows.some(
            (row) => row.canonical_event_id === canonicalEventId,
          ),
        ).toBe(false);
      }
    await pg.exec(
      `UPDATE match_events SET event_type = 'goal' WHERE id = '${canonicalEventId}'`,
    );
    expect((await visibility()).rows.every((row) => row.visible)).toBe(true);
    await pg.exec(
      `UPDATE match_event_reviews SET session_id = NULL WHERE id = '${review.id}'`,
    );
    expect(
      (await visibility()).rows.find((row) => row.kind === 'review')?.visible,
    ).toBe(false);
    await pg.exec(
      `UPDATE match_event_reviews SET session_id = '${a.sharedMatchId}' WHERE id = '${review.id}'`,
    );
    expect((await visibility()).rows.every((row) => row.visible)).toBe(true);
    await pg.exec(`DELETE FROM match_events WHERE id = '${canonicalEventId}'`);
    expect((await visibility()).rows).toHaveLength(0);
    expect(
      (
        await db
          .select()
          .from(schema.matchEventOperations)
          .where(eq(schema.matchEventOperations.matchId, b.id))
      ).every(
        (row) => row.canonicalEventId !== null || !row.publicCanonicalEvent,
      ),
    ).toBe(true);
  });

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
