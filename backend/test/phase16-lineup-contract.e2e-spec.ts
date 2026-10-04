import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import * as s from '../src/database/schema';
import { registerCoach } from './utils/auth-helpers';
import { cleanupUser, uniqueTestIdentity, TestIdentity } from './utils/test-db';

type Coach = Awaited<ReturnType<typeof registerCoach>> & { athletes: string[] };
type Event = { id: string; friendlyFixtureId: string };

describe('Phase 1.6 lineup contract HTTP evidence', () => {
  let app: INestApplication<App>;
  let db: DatabaseService['database'];
  const identities: TestIdentity[] = [];
  const competitionIds: string[] = [];
  const previousFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    db = app.get(DatabaseService).database;
  });
  afterAll(async () => {
    // Remove this probe's sheets before team deletion triggers fixture-event sync.
    for (const id of competitionIds)
      await db.delete(s.matches).where(eq(s.matches.competitionId, id));
    for (const identity of identities) await cleanupUser(identity);
    await app?.close();
    if (previousFlag === undefined)
      delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    else process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousFlag;
  }, 120000);
  async function coach(prefix: string): Promise<Coach> {
    const identity = uniqueTestIdentity(prefix);
    identities.push(identity);
    const c = await registerCoach(app.getHttpServer(), identity);
    const roster = await db
      .insert(s.athletes)
      .values(
        Array.from({ length: 12 }, (_, i) => ({
          teamId: c.team.id,
          firstName: `${prefix}${i + 1}`,
          lastName: 'Synthetic',
          squadNumber: i + 1,
        })),
      )
      .returning({ id: s.athletes.id });
    return { ...c, athletes: roster.map((a) => a.id) };
  }
  const scheduledAt = () => new Date(Date.now() - 86400000).toISOString();
  function lineup(c: Coach) {
    return {
      startingAthleteIds: c.athletes.slice(0, 11),
      benchAthleteIds: c.athletes.slice(11),
      formationId: '4-3-3',
    };
  }
  function start(c: Coach, eventId: string) {
    return c.agent
      .post(`/events/${eventId}/start-match`)
      .send({ ...lineup(c), opponentName: 'Synthetic opponent', isHome: true })
      .expect(201);
  }
  function narrow(body: unknown, formation: string | null) {
    expect(body).toMatchObject({ available: true, formation });
    expect(Object.keys(body as object).sort()).toEqual([
      'available',
      'bench',
      'formation',
      'starters',
    ]);
    const value = body as { starters: object[]; bench: object[] };
    expect(value.starters).toHaveLength(11);
    expect(value.bench).toHaveLength(1);
    for (const player of [...value.starters, ...value.bench])
      expect(Object.keys(player).sort()).toEqual(['name', 'shirtNumber']);
  }

  it('captures flag-off snapshot deletion and enabled post-start fallback without private fields', async () => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    const a = await coach('phase16-a');
    const b = await coach('phase16-b');
    const event = (
      await a.agent
        .post('/events')
        .send({
          title: b.team.name,
          type: 'match',
          scheduledAt: scheduledAt(),
          location: 'Synthetic ground',
          friendlyOpponentTeamId: b.team.id,
        })
        .expect(201)
    ).body as Event;
    const accepted = (
      await b.agent
        .post(`/friendly-fixtures/${event.friendlyFixtureId}/accept`)
        .expect(201)
    ).body as { event: Event };
    await b.agent
      .put(`/events/${accepted.event.id}/lineup`)
      .send(lineup(b))
      .expect(200);
    const legacy = await a.agent
      .get(`/events/${event.id}/opponent-lineup`)
      .expect(200);
    expect(legacy.body).toMatchObject({
      available: true,
      teamId: b.team.id,
      teamName: b.team.name,
      formationId: '4-3-3',
      confirmedAt: expect.any(String) as unknown,
    });
    expect(
      (legacy.body as { players: { id: string }[] }).players
        .map((p) => p.id)
        .sort(),
    ).toEqual(b.athletes.slice().sort());
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    const snapshot = await a.agent
      .get(`/events/${event.id}/opponent-lineup`)
      .expect(200);
    narrow(snapshot.body, '4-3-3');
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    const sheetB = (await start(b, accepted.event.id)).body as { id: string };
    const retired = await b.agent
      .get(`/events/${accepted.event.id}/lineup`)
      .expect(200);
    expect(retired.text).toBe('');
    const legacySquad = await a.agent
      .get(`/events/${event.id}/opponent-lineup`)
      .expect(200);
    expect(legacySquad.body).toMatchObject({
      available: true,
      teamId: b.team.id,
      players: expect.any(Array) as unknown,
    });
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    const fallback = await a.agent
      .get(`/events/${event.id}/opponent-lineup`)
      .expect(200);
    narrow(fallback.body, null);
    expect((fallback.body as { starters: unknown[] }).starters).toEqual(
      (snapshot.body as { starters: unknown[] }).starters,
    );
    const sheetA = (await start(a, event.id)).body as { id: string };
    const match = await a.agent.get(`/matches/${sheetA.id}`).expect(200);
    expect(
      (match.body as { friendlyOpponentLineup: unknown })
        .friendlyOpponentLineup,
    ).toEqual(fallback.body);
    // Complete only the fresh legacy sheet under its original flag-off mode.
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    await b.agent.post(`/matches/${sheetB.id}/finish`).expect(201);
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    const completed = await a.agent
      .get(`/events/${event.id}/opponent-lineup`)
      .expect(200);
    expect(completed.body).toEqual(fallback.body);
  }, 120000);

  it('uses the same snapshot allowlist on generated competition event and match reads', async () => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    const a = await coach('phase16-c');
    const b = await coach('phase16-d');
    const competition = (
      await a.agent
        .post('/competitions')
        .send({
          name: 'Phase16 ' + randomUUID(),
          type: 'league',
          format: 'league',
          configuredTeamCount: 2,
          startDate: '2027-01-01',
          allowedPlayingDays: [6],
        })
        .expect(201)
    ).body as { id: string };
    competitionIds.push(competition.id);
    const slot = (
      await a.agent
        .post(`/competitions/${competition.id}/teams`)
        .send({ displayName: b.team.name })
        .expect(201)
    ).body as { id: string };
    await db
      .update(s.competitionTeams)
      .set({ teamId: b.team.id })
      .where(eq(s.competitionTeams.id, slot.id));
    const fixtures = (
      await a.agent
        .post(`/competitions/${competition.id}/fixtures/generate`)
        .send({})
        .expect(201)
    ).body as { id: string }[];
    expect(fixtures).toHaveLength(1);
    await db
      .update(s.competitionFixtures)
      .set({
        scheduledAt: new Date(scheduledAt()),
      })
      .where(eq(s.competitionFixtures.id, fixtures[0].id));
    // The schedule-change trigger clears confirmation, so confirm separately.
    await db
      .update(s.competitionFixtures)
      .set({
        scheduleConfirmedAt: new Date(),
        homeScheduleResponse: 'external_confirmed',
        awayScheduleResponse: 'external_confirmed',
      })
      .where(eq(s.competitionFixtures.id, fixtures[0].id));
    await db
      .update(s.events)
      .set({ scheduledAt: new Date(scheduledAt()) })
      .where(eq(s.events.competitionFixtureId, fixtures[0].id));
    const events = await db
      .select()
      .from(s.events)
      .where(eq(s.events.competitionFixtureId, fixtures[0].id));
    const eventA = events.find((e) => e.teamId === a.team.id)!;
    const eventB = events.find((e) => e.teamId === b.team.id)!;
    await b.agent
      .put(`/events/${eventB.id}/lineup`)
      .send(lineup(b))
      .expect(200);
    const snapshot = await a.agent
      .get(`/events/${eventA.id}/opponent-lineup`)
      .expect(200);
    narrow(snapshot.body, '4-3-3');
    await start(b, eventB.id);
    const retained = await b.agent
      .get(`/events/${eventB.id}/lineup`)
      .expect(200);
    expect(retained.body).toMatchObject({ formationId: '4-3-3' });
    const sheetA = (await start(a, eventA.id)).body as { id: string };
    const match = await a.agent.get(`/matches/${sheetA.id}`).expect(200);
    expect(
      (match.body as { friendlyOpponentLineup: unknown })
        .friendlyOpponentLineup,
    ).toEqual(snapshot.body);
  }, 120000);
});
