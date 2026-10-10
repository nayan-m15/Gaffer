import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as schema from './schema';
import { createDatabaseClient } from './drizzle';
import type * as Cleanup from '../../test/utils/test-db';

jest.mock('./drizzle', () => ({
  createDatabaseClient: jest.fn(),
  isDatabaseConnectionError: () => false,
}));

describe('integration test cleanup with real foreign keys', () => {
  let pg: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let cleanup: typeof Cleanup;

  beforeAll(async () => {
    // Load bundled assets directly so this also runs in Jest's Windows VM.
    const assets = resolve(require.resolve('@electric-sql/pglite'), '..');
    pg = new PGlite({
      pgliteWasmModule: await WebAssembly.compile(
        new Uint8Array(readFileSync(resolve(assets, 'pglite.wasm'))),
      ),
      initdbWasmModule: await WebAssembly.compile(
        new Uint8Array(readFileSync(resolve(assets, 'initdb.wasm'))),
      ),
      fsBundle: new Blob([
        new Uint8Array(readFileSync(resolve(assets, 'pglite.data'))),
      ]),
    });
    const folder = resolve(__dirname, '../../drizzle');
    const journal = JSON.parse(
      readFileSync(resolve(folder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      await pg.exec(readFileSync(resolve(folder, `${tag}.sql`), 'utf8'));
    }
    db = drizzle(pg, { schema });
    jest.mocked(createDatabaseClient).mockReturnValue(db as never);
    cleanup = jest.requireActual<typeof Cleanup>('../../test/utils/test-db');
  }, 60000);

  afterAll(async () => {
    await pg?.close();
  });

  async function coach() {
    const identity = cleanup.uniqueTestIdentity('cleanup-regression');
    const [user] = await db
      .insert(schema.user)
      .values({ id: identity.email, email: identity.email, name: 'Test coach' })
      .returning();
    const [team] = await db
      .insert(schema.teams)
      .values({ name: identity.teamName })
      .returning();
    return { identity, user, team };
  }

  it.each(['requester first', 'opponent first', 'concurrent'])(
    'cleans both friendly match sheets (%s)',
    async (order) => {
      const home = await coach();
      const away = await coach();
      const [fixture] = await db
        .insert(schema.friendlyFixtures)
        .values({
          requesterTeamId: home.team.id,
          opponentTeamId: away.team.id,
          createdByUserId: home.user.id,
          respondedByUserId: away.user.id,
          status: 'accepted',
        })
        .returning();
      for (const [side, opponent] of [
        [home, away],
        [away, home],
      ]) {
        const [event] = await db
          .insert(schema.events)
          .values({
            teamId: side.team.id,
            title: 'Friendly match',
            type: 'match',
            scheduledAt: new Date(),
            location: 'Ground',
            friendlyFixtureId: fixture.id,
          })
          .returning();
        const [plan] = await db
          .insert(schema.gamePlans)
          .values({
            teamId: side.team.id,
            name: 'Saved plan',
          })
          .returning();
        await db.insert(schema.matches).values({
          eventId: event.id,
          opponentName: opponent.team.name,
          opponentTeamId: opponent.team.id,
          gamePlanId: plan.id,
        });
      }
      await cleanup.cleanupUsers(
        order === 'opponent first'
          ? [away.identity, home.identity]
          : [home.identity, away.identity],
        { concurrency: order === 'concurrent' ? 2 : 1 },
      );
      expect(await db.select().from(schema.friendlyFixtures)).toEqual([]);
      expect(await db.select().from(schema.events)).toEqual([]);
      expect(await db.select().from(schema.matches)).toEqual([]);
      expect(await db.select().from(schema.gamePlans)).toEqual([]);
      expect(await db.select().from(schema.user)).toEqual([]);
    },
  );

  it.each(['owner first', 'opponent first', 'concurrent'])(
    'cleans two started competition sheets (%s) and preserves unrelated matches',
    async (order) => {
      const home = await coach();
      const away = await coach();
      const unrelated = await coach();
      const [competition] = await db
        .insert(schema.competitions)
        .values({
          teamId: home.team.id,
          adminUserId: home.user.id,
          name: home.identity.email,
          type: 'league',
        })
        .returning();
      const slots = await db
        .insert(schema.competitionTeams)
        .values(
          [home, away].map(({ team }) => ({
            competitionId: competition.id,
            teamId: team.id,
            displayName: team.name,
          })),
        )
        .returning();
      const [session] = await db
        .insert(schema.matchSessions)
        .values({})
        .returning();
      await db.insert(schema.matchSessionParticipants).values(
        [home, away].map(({ team }, index) => ({
          sessionId: session.id,
          teamId: team.id,
          competitionTeamId: slots[index].id,
          side: index === 0 ? ('home' as const) : ('away' as const),
        })),
      );
      const [fixture] = await db
        .insert(schema.competitionFixtures)
        .values({
          competitionId: competition.id,
          homeCompetitionTeamId: slots[0].id,
          awayCompetitionTeamId: slots[1].id,
          stage: 'league',
          round: 1,
          position: 1,
          scheduledAt: new Date(),
          sharedSessionId: session.id,
        })
        .returning();
      const fixtureEvents = await db
        .select()
        .from(schema.events)
        .where(eq(schema.events.competitionFixtureId, fixture.id));
      expect(fixtureEvents).toHaveLength(2);
      const sheets = await db
        .insert(schema.matches)
        .values(
          fixtureEvents.map((event) => ({
            eventId: event.id,
            competitionId: competition.id,
            sharedMatchId: session.id,
            opponentName: 'Opponent',
            opponentTeamId:
              event.teamId === home.team.id ? away.team.id : home.team.id,
            opponentCompetitionTeamId:
              event.teamId === home.team.id ? slots[1].id : slots[0].id,
          })),
        )
        .returning();
      await db.insert(schema.matchEvents).values({
        matchId: sheets[0].id,
        sessionId: session.id,
        side: 'home',
        team: 'own',
        eventType: 'goal',
        minute: 1,
        loggedByUserId: home.user.id,
      });
      await db
        .update(schema.matchSessions)
        .set({
          finalisedAt: new Date(),
          finalisedByUserId: home.user.id,
        })
        .where(eq(schema.matchSessions.id, session.id));
      const [otherEvent] = await db
        .insert(schema.events)
        .values({
          teamId: unrelated.team.id,
          title: 'Unrelated match',
          type: 'match',
          scheduledAt: new Date(),
          location: 'Ground',
        })
        .returning();
      const [otherMatch] = await db
        .insert(schema.matches)
        .values({
          eventId: otherEvent.id,
          opponentName: 'Other opponent',
        })
        .returning();

      const identities =
        order === 'opponent first'
          ? [away.identity, home.identity]
          : [home.identity, away.identity];
      await cleanup.cleanupUsers(identities, {
        concurrency: order === 'concurrent' ? 2 : 1,
      });
      // Retry cleanup too: a partial teardown or a second call is harmless.
      await cleanup.cleanupUsers(identities);
      expect(await db.select().from(schema.matches)).toEqual([otherMatch]);
      expect(await db.select().from(schema.events)).toEqual([otherEvent]);
      expect(await db.select().from(schema.matchSessions)).toEqual([]);
      expect(await db.select().from(schema.competitions)).toEqual([]);
      expect(await db.select().from(schema.user)).toEqual([unrelated.user]);
      await cleanup.cleanupUser(unrelated.identity);
    },
  );
});
