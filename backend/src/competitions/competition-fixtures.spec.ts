import { PGlite, type Transaction } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import * as schema from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { CompetitionsService } from './competitions.service';
import { planFixtures, settingKeys } from './competition-fixtures';
import {
  createCompetitionSchema,
  updateCompetitionSchema,
} from './competitions.schemas';
import { calculateCompetitionStandings } from '../common/competition-standings';

function testDatabase(pg: PGlite) {
  const query = (
    text: string,
    params: unknown[],
    options: { arrayMode?: boolean },
  ) => {
    const run = (db: PGlite | Transaction) =>
      db.query(text, params, {
        rowMode: options.arrayMode ? 'array' : 'object',
        parsers: { 1184: (value: string) => value },
      });
    return {
      run,
      then: (
        yes: (value: unknown) => unknown,
        no: (error: unknown) => unknown,
      ) => run(pg).then(yes, no),
    };
  };
  const client = {
    query,
    transaction: (queries: ReturnType<typeof query>[]) =>
      pg.transaction(async (tx) => {
        const results: unknown[] = [];
        for (const statement of queries) results.push(await statement.run(tx));
        return results;
      }),
  };
  return drizzle(client as unknown as NeonQueryFunction<false, false>, {
    schema,
  });
}

describe('Competition fixtures (PostgreSQL)', () => {
  let pg: PGlite;
  let db: ReturnType<typeof testDatabase>;
  let service: CompetitionsService;
  let competitionId: string;
  let teamId: string;

  beforeAll(async () => {
    pg = new PGlite();
    const journal = JSON.parse(
      readFileSync(
        resolve(__dirname, '../../drizzle/meta/_journal.json'),
        'utf8',
      ),
    ) as { entries: { tag: string }[] };
    for (const entry of journal.entries) {
      await pg.exec(
        readFileSync(
          resolve(__dirname, `../../drizzle/${entry.tag}.sql`),
          'utf8',
        ),
      );
    }
    db = testDatabase(pg);
    const databaseService = { database: db } as DatabaseService;
    service = new CompetitionsService(databaseService, {
      requireCoachTeam: () =>
        Promise.resolve({
          id: teamId,
          name: 'Owner',
          role: 'coach',
        }),
      findTeamForUser: () =>
        Promise.resolve({
          id: teamId,
          name: 'Owner',
          role: 'coach',
        }),
    } as unknown as TeamsService);
  }, 60000);
  afterAll(async () => {
    await pg?.close();
  });
  beforeEach(async () => {
    await pg.exec('TRUNCATE "user", teams, competitions CASCADE');
    await db
      .insert(schema.user)
      .values({ id: 'admin', name: 'Admin', email: 'admin@test.local' });
    const [team] = await db
      .insert(schema.teams)
      .values({ name: 'Owner' })
      .returning();
    teamId = team.id;
    const created = await service.create('admin', {
      name: 'Test League',
      type: 'league',
      configuredTeamCount: 4,
      startDate: '2026-09-20',
      allowedPlayingDays: [2, 6],
      defaultKickoffTime: '18:30',
    });
    competitionId = created.id;
  });
  async function fill(size = 4) {
    for (let i = 1; i < size; i++)
      await service.addParticipant('admin', competitionId, {
        displayName: `External ${i}`,
      });
  }
  async function row() {
    return (
      await db
        .select()
        .from(schema.competitions)
        .where(eq(schema.competitions.id, competitionId))
    )[0];
  }
  async function participants() {
    return db
      .select()
      .from(schema.competitionTeams)
      .where(eq(schema.competitionTeams.competitionId, competitionId));
  }

  it('blocks incomplete and excess participant counts with actionable messages', async () => {
    await expect(
      service.generateFixtures('admin', competitionId),
    ).rejects.toThrow('Add 3 more teams');
    await fill();
    await service.addParticipant('admin', competitionId, {
      displayName: 'Extra',
    });
    await expect(
      service.generateFixtures('admin', competitionId),
    ).rejects.toThrow('Remove 1 teams');
    expect(await service.listFixtures('admin', competitionId)).toHaveLength(0);
  });

  it('stores six shared pairings, schedules allowed days and supports external participants', async () => {
    await fill();
    const fixtures = await service.generateFixtures('admin', competitionId);
    expect(fixtures).toHaveLength(6);
    expect(
      new Set(
        fixtures.map((f) =>
          [f.homeCompetitionTeamId, f.awayCompetitionTeamId].sort().join(':'),
        ),
      ).size,
    ).toBe(6);
    for (const round of [1, 2, 3]) {
      const games = fixtures.filter((f) => f.round === round);
      expect(games).toHaveLength(2);
      expect(
        new Set(
          games.flatMap((f) => [
            f.homeCompetitionTeamId,
            f.awayCompetitionTeamId,
          ]),
        ).size,
      ).toBe(4);
    }
    expect(fixtures.map((f) => f.scheduledAt.toISOString())).toEqual([
      '2026-09-22T18:30:00.000Z',
      '2026-09-22T18:30:00.000Z',
      '2026-09-26T18:30:00.000Z',
      '2026-09-26T18:30:00.000Z',
      '2026-09-29T18:30:00.000Z',
      '2026-09-29T18:30:00.000Z',
    ]);
    const external = (await participants()).filter((p) => p.teamId === null);
    expect(external).toHaveLength(3);
    for (const p of external)
      expect(
        fixtures.filter((f) =>
          [f.homeCompetitionTeamId, f.awayCompetitionTeamId].includes(p.id),
        ),
      ).toHaveLength(3);
    expect(
      (await service.findOne('admin', competitionId)).configuredTeamCount,
    ).toBe(4);
  });

  it('generates reversed second legs and handles odd league sizes', async () => {
    await service.update('admin', competitionId, {
      configuredTeamCount: 5,
      fixturesPerOpponent: 2,
    });
    await fill(5);
    const fixtures = await service.generateFixtures('admin', competitionId);
    expect(fixtures).toHaveLength(20);
    for (const f of fixtures.filter((f) => f.round <= 5)) {
      expect(fixtures).toContainEqual(
        expect.objectContaining({
          round: f.round + 5,
          homeCompetitionTeamId: f.awayCompetitionTeamId,
          awayCompetitionTeamId: f.homeCompetitionTeamId,
        }),
      );
    }
    for (let round = 1; round <= 10; round++) {
      const ids = fixtures
        .filter((f) => f.round === round)
        .flatMap((f) => [f.homeCompetitionTeamId, f.awayCompetitionTeamId]);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('rejects non-admin generation and regeneration', async () => {
    await fill();
    await expect(
      service.generateFixtures('outsider', competitionId),
    ).rejects.toThrow(NotFoundException);
    await service.generateFixtures('admin', competitionId);
    await expect(
      service.generateFixtures('outsider', competitionId, true),
    ).rejects.toThrow(NotFoundException);
  });

  it('prevents duplicates and only regenerates untouched fixtures', async () => {
    await fill();
    const first = await service.generateFixtures('admin', competitionId);
    await expect(
      service.generateFixtures('admin', competitionId),
    ).rejects.toThrow(ConflictException);
    const second = await service.generateFixtures('admin', competitionId, true);
    expect(second).toHaveLength(6);
    expect(second[0].id).not.toBe(first[0].id);
    await db
      .update(schema.competitionFixtures)
      .set({ status: 'in_progress' })
      .where(eq(schema.competitionFixtures.id, second[0].id));
    await expect(
      service.generateFixtures('admin', competitionId, true),
    ).rejects.toThrow('unsafe');
    expect(
      (await service.listFixtures('admin', competitionId)).map((f) => f.id),
    ).toEqual(second.map((f) => f.id));
  });

  it.each([4, 8, 16, 32])(
    'creates an actual %i-team knockout bracket',
    async (size) => {
      await service.update('admin', competitionId, {
        type: 'cup',
        format: 'knockout',
        configuredTeamCount: size,
      });
      await fill(size);
      const fixtures = await service.generateFixtures('admin', competitionId);
      expect(fixtures).toHaveLength(size - 1);
      expect(fixtures.filter((f) => f.round === 1)).toHaveLength(size / 2);
      for (const fixture of fixtures) {
        if (fixture.nextFixtureId) {
          expect(
            fixtures.find((f) => f.id === fixture.nextFixtureId)?.round,
          ).toBe(fixture.round + 1);
        }
        if (fixture.round > 1) {
          expect(fixture.homeCompetitionTeamId).toBeNull();
          const feeders = fixtures.filter(
            (f) => f.nextFixtureId === fixture.id,
          );
          expect(feeders.map((f) => f.nextFixtureSlot).sort()).toEqual([
            'away',
            'home',
          ]);
        }
      }
      expect(fixtures.filter((f) => f.nextFixtureId === null)).toHaveLength(1);
      expect(
        await service.generateFixtures('admin', competitionId, true),
      ).toHaveLength(size - 1);
    },
  );

  it('generates only league fixtures for league + knockout', async () => {
    await service.update('admin', competitionId, {
      type: 'cup',
      format: 'league_knockout',
      qualifierCount: 4,
    });
    await fill();
    const fixtures = await service.generateFixtures('admin', competitionId);
    expect(fixtures).toHaveLength(6);
    expect(
      fixtures.every((f) => f.stage === 'league' && f.nextFixtureId === null),
    ).toBe(true);
  });

  it('completes generated knockout fixtures and advances winners automatically', async () => {
    await service.update('admin', competitionId, {
      type: 'cup',
      format: 'knockout',
    });
    await fill();
    const fixtures = await service.generateFixtures('admin', competitionId);
    const opening = fixtures.find((fixture) => fixture.round === 1)!;

    await service.createManualResult('admin', competitionId, {
      homeCompetitionTeamId: opening.homeCompetitionTeamId!,
      awayCompetitionTeamId: opening.awayCompetitionTeamId!,
      homeScore: 2,
      awayScore: 1,
      playedAt: opening.scheduledAt.toISOString(),
    });

    const updated = await service.listFixtures('admin', competitionId);
    const completed = updated.find((fixture) => fixture.id === opening.id)!;
    const next = updated.find((fixture) => fixture.id === opening.nextFixtureId)!;
    expect(completed.status).toBe('completed');
    expect(completed.winnerCompetitionTeamId).toBe(
      opening.homeCompetitionTeamId,
    );
    expect(
      opening.nextFixtureSlot === 'home'
        ? next.homeCompetitionTeamId
        : next.awayCompetitionTeamId,
    ).toBe(opening.homeCompetitionTeamId);
  });

  it('keeps knockout progression consistent when manual results are edited or deleted', async () => {
    await service.update('admin', competitionId, {
      type: 'cup',
      format: 'knockout',
    });
    await fill();
    const fixtures = await service.generateFixtures('admin', competitionId);
    const semis = fixtures
      .filter((fixture) => fixture.round === 1)
      .sort((a, b) => a.position - b.position);
    const final = fixtures.find((fixture) => fixture.round === 2)!;

    const first = await service.createManualResult('admin', competitionId, {
      homeCompetitionTeamId: semis[0].homeCompetitionTeamId!,
      awayCompetitionTeamId: semis[0].awayCompetitionTeamId!,
      homeScore: 2,
      awayScore: 0,
      playedAt: semis[0].scheduledAt.toISOString(),
    });
    let progressed = (await service.listFixtures('admin', competitionId)).find(
      (fixture) => fixture.id === final.id,
    )!;
    expect(
      semis[0].nextFixtureSlot === 'home'
        ? progressed.homeCompetitionTeamId
        : progressed.awayCompetitionTeamId,
    ).toBe(semis[0].homeCompetitionTeamId);

    await service.updateManualResult('admin', competitionId, first.id, {
      homeCompetitionTeamId: semis[0].homeCompetitionTeamId!,
      awayCompetitionTeamId: semis[0].awayCompetitionTeamId!,
      homeScore: 0,
      awayScore: 1,
      playedAt: semis[0].scheduledAt.toISOString(),
    });
    progressed = (await service.listFixtures('admin', competitionId)).find(
      (fixture) => fixture.id === final.id,
    )!;
    expect(
      semis[0].nextFixtureSlot === 'home'
        ? progressed.homeCompetitionTeamId
        : progressed.awayCompetitionTeamId,
    ).toBe(semis[0].awayCompetitionTeamId);

    await service.removeManualResult('admin', competitionId, first.id);
    const resetFixtures = await service.listFixtures('admin', competitionId);
    const resetSemi = resetFixtures.find((fixture) => fixture.id === semis[0].id)!;
    progressed = resetFixtures.find((fixture) => fixture.id === final.id)!;
    expect(resetSemi.status).toBe('scheduled');
    expect(
      semis[0].nextFixtureSlot === 'home'
        ? progressed.homeCompetitionTeamId
        : progressed.awayCompetitionTeamId,
    ).toBeNull();

    const replayed = await service.createManualResult('admin', competitionId, {
      homeCompetitionTeamId: semis[0].homeCompetitionTeamId!,
      awayCompetitionTeamId: semis[0].awayCompetitionTeamId!,
      homeScore: 1,
      awayScore: 0,
      playedAt: semis[0].scheduledAt.toISOString(),
    });
    await service.createManualResult('admin', competitionId, {
      homeCompetitionTeamId: semis[1].homeCompetitionTeamId!,
      awayCompetitionTeamId: semis[1].awayCompetitionTeamId!,
      homeScore: 1,
      awayScore: 0,
      playedAt: semis[1].scheduledAt.toISOString(),
    });
    const readyFinal = (await service.listFixtures('admin', competitionId)).find(
      (fixture) => fixture.id === final.id,
    )!;
    await service.createManualResult('admin', competitionId, {
      homeCompetitionTeamId: readyFinal.homeCompetitionTeamId!,
      awayCompetitionTeamId: readyFinal.awayCompetitionTeamId!,
      homeScore: 1,
      awayScore: 0,
      playedAt: readyFinal.scheduledAt.toISOString(),
    });

    await expect(
      service.updateManualResult('admin', competitionId, replayed.id, {
        homeCompetitionTeamId: semis[0].homeCompetitionTeamId!,
        awayCompetitionTeamId: semis[0].awayCompetitionTeamId!,
        homeScore: 0,
        awayScore: 1,
        playedAt: semis[0].scheduledAt.toISOString(),
      }),
    ).rejects.toThrow('next knockout match');
  });

  it('creates and seeds the hybrid knockout stage when the league phase finishes', async () => {
    await service.update('admin', competitionId, {
      type: 'cup',
      format: 'league_knockout',
      configuredTeamCount: 5,
      qualifierCount: 4,
    });
    await fill(5);
    const leagueFixtures = await service.generateFixtures('admin', competitionId);
    const slots = await participants();
    const bottom = slots.find((slot) => slot.displayName === 'External 4')!;

    for (const fixture of leagueFixtures) {
      const bottomHome = fixture.homeCompetitionTeamId === bottom.id;
      const bottomAway = fixture.awayCompetitionTeamId === bottom.id;
      await service.createManualResult('admin', competitionId, {
        homeCompetitionTeamId: fixture.homeCompetitionTeamId!,
        awayCompetitionTeamId: fixture.awayCompetitionTeamId!,
        homeScore: bottomHome ? 0 : bottomAway ? 2 : 0,
        awayScore: bottomAway ? 0 : bottomHome ? 2 : 0,
        playedAt: fixture.scheduledAt.toISOString(),
      });
    }

    const allFixtures = await service.listFixtures('admin', competitionId);
    const knockout = allFixtures.filter((fixture) => fixture.stage === 'knockout');
    expect(knockout).toHaveLength(3);
    const openingIds = knockout
      .filter((fixture) => fixture.round === 1)
      .flatMap((fixture) => [
        fixture.homeCompetitionTeamId,
        fixture.awayCompetitionTeamId,
      ]);
    expect(openingIds).toHaveLength(4);
    expect(openingIds).not.toContain(bottom.id);

    const tableBeforeKnockout = (await service.findOne('admin', competitionId))
      .standings.map((row) => ({
        teamName: row.teamName,
        played: row.played,
        points: row.points,
      }));
    const semi = knockout.find((fixture) => fixture.round === 1)!;
    await service.createManualResult('admin', competitionId, {
      homeCompetitionTeamId: semi.homeCompetitionTeamId!,
      awayCompetitionTeamId: semi.awayCompetitionTeamId!,
      homeScore: 1,
      awayScore: 0,
      playedAt: semi.scheduledAt.toISOString(),
    });
    expect(
      (await service.findOne('admin', competitionId)).standings.map((row) => ({
        teamName: row.teamName,
        played: row.played,
        points: row.points,
      })),
    ).toEqual(tableBeforeKnockout);
  });

  it('enforces participant ownership and self-play constraints in PostgreSQL', async () => {
    await fill();
    const slots = await participants();
    const other = await service.create('admin', {
      name: 'Other',
      type: 'league',
    });
    const foreign = other.participants[0].id;
    const fixture = {
      competitionId,
      stage: 'league' as const,
      round: 1,
      position: 1,
      scheduledAt: new Date(),
      homeCompetitionTeamId: slots[0].id,
    };
    await expect(
      db
        .insert(schema.competitionFixtures)
        .values({ ...fixture, awayCompetitionTeamId: slots[0].id }),
    ).rejects.toThrow();
    await expect(
      db
        .insert(schema.competitionFixtures)
        .values({ ...fixture, awayCompetitionTeamId: foreign }),
    ).rejects.toThrow();
    await db
      .insert(schema.competitionFixtures)
      .values({ ...fixture, awayCompetitionTeamId: slots[1].id });
    await expect(
      db.insert(schema.competitionFixtures).values({
        ...fixture,
        position: 2,
        awayCompetitionTeamId: slots[2].id,
      }),
    ).rejects.toThrow();
  });

  it('locks structural settings and roster but permits rename and invitation linking', async () => {
    await fill();
    await service.generateFixtures('admin', competitionId);
    await expect(
      service.update('admin', competitionId, { pointsWin: 5 }),
    ).rejects.toThrow('Structural settings');
    await expect(
      service.update('admin', competitionId, { name: 'Renamed' }),
    ).resolves.toMatchObject({ name: 'Renamed' });
    await expect(
      service.addParticipant('admin', competitionId, { displayName: 'Extra' }),
    ).rejects.toThrow(ConflictException);
    const external = (await participants()).find((p) => p.teamId === null)!;
    await expect(
      service.removeParticipant('admin', competitionId, external.id),
    ).rejects.toThrow(ConflictException);
    const [linked] = await db
      .insert(schema.teams)
      .values({ name: 'Linked' })
      .returning();
    await expect(
      db
        .update(schema.competitionTeams)
        .set({ teamId: linked.id })
        .where(eq(schema.competitionTeams.id, external.id)),
    ).resolves.toBeDefined();
    await expect(
      service.remove('admin', competitionId),
    ).resolves.toBeUndefined();
  });

  it('preserves legacy results and protects their scoring configuration', async () => {
    await fill();
    const slots = await participants();
    await service.update('admin', competitionId, {
      pointsWin: 5,
      pointsDraw: 2,
      pointsLoss: 1,
    });
    await db.insert(schema.competitionMatches).values({
      competitionId,
      homeCompetitionTeamId: slots[0].id,
      awayCompetitionTeamId: slots[1].id,
      homeScore: 2,
      awayScore: 0,
      playedAt: new Date(),
      createdByUserId: 'admin',
    });
    const detail = await service.findOne('admin', competitionId);
    expect(
      detail.standings.find((s) => s.teamName === slots[0].displayName)?.points,
    ).toBe(5);
    expect(
      detail.standings.find((s) => s.teamName === slots[1].displayName)?.points,
    ).toBe(1);
    await expect(
      service.generateFixtures('admin', competitionId),
    ).rejects.toThrow('unsafe');
    await expect(
      service.update('admin', competitionId, { fixturesPerOpponent: 2 }),
    ).rejects.toThrow('Structural settings');
  });

  it('keeps unconfigured legacy competitions readable and friendly behaviour intact', async () => {
    await db
      .update(schema.competitions)
      .set({ format: null, configuredTeamCount: null, startDate: null })
      .where(eq(schema.competitions.id, competitionId));
    expect(
      (await service.findOne('admin', competitionId)).configuredTeamCount,
    ).toBeNull();
    await expect(
      service.generateFixtures('admin', competitionId),
    ).rejects.toThrow('Configure the team count');
    await db
      .update(schema.competitions)
      .set({ type: 'friendly' })
      .where(eq(schema.competitions.id, competitionId));
    await expect(
      service.generateFixtures('admin', competitionId),
    ).rejects.toThrow('Friendly');
    await db
      .update(schema.competitions)
      .set({ pointsWin: 4 })
      .where(eq(schema.competitions.id, competitionId));
  });

  it('rejects stale generation inputs and rolls back a failed regeneration', async () => {
    await fill();
    const config = await row();
    const ids = (await participants()).map((p) => p.id);
    const expected = Object.fromEntries(
      ['type', ...settingKeys].map((key) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        config[key as keyof typeof config],
      ]),
    );
    const plan = planFixtures(config, ids);
    const generate = (settings: object, roster: string[], fixtures = plan) =>
      pg.query(
        'select generate_competition_fixtures($1, $2, $3, $4, $5, true)',
        [
          competitionId,
          'admin',
          JSON.stringify(settings),
          JSON.stringify(roster),
          JSON.stringify(fixtures),
        ],
      );
    await expect(
      generate({ ...expected, points_win: 99 }, ids),
    ).rejects.toThrow('Settings changed');
    await expect(
      generate(expected, [...ids.slice(1), randomUUID()]),
    ).rejects.toThrow('Participants changed');
    const original = await service.generateFixtures('admin', competitionId);
    await expect(
      generate(
        expected,
        ids,
        plan.map((f, i) =>
          i === 0
            ? { ...f, awayCompetitionTeamId: f.homeCompetitionTeamId }
            : f,
        ),
      ),
    ).rejects.toThrow();
    expect(
      (await service.listFixtures('admin', competitionId)).map((f) => f.id),
    ).toEqual(original.map((f) => f.id));
  });

  it('rejects invalid knockout progression and incomplete result scores', async () => {
    await service.update('admin', competitionId, {
      type: 'cup',
      format: 'knockout',
    });
    await fill();
    const fixtures = await service.generateFixtures('admin', competitionId);
    const opening = fixtures[0];
    const final = fixtures.find((f) => f.nextFixtureId === null)!;
    await expect(
      db
        .update(schema.competitionFixtures)
        .set({ nextFixtureId: opening.id, nextFixtureSlot: 'home' })
        .where(eq(schema.competitionFixtures.id, final.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(schema.competitionFixtures)
        .set({ nextFixtureSlot: null })
        .where(eq(schema.competitionFixtures.id, opening.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(schema.competitionFixtures)
        .set({ status: 'completed', homeScore: 1 })
        .where(eq(schema.competitionFixtures.id, opening.id)),
    ).rejects.toThrow();
  });

  it('validates settings and rejects unsupported knockout sizes', async () => {
    expect(
      createCompetitionSchema.safeParse({
        name: 'A',
        type: 'league',
        allowedPlayingDays: [],
      }).success,
    ).toBe(false);
    expect(
      updateCompetitionSchema.safeParse({ defaultKickoffTime: '25:00' })
        .success,
    ).toBe(false);
    expect(
      updateCompetitionSchema.safeParse({ startDate: '2026-02-30' }).success,
    ).toBe(false);
    await expect(
      service.update('admin', competitionId, {
        type: 'cup',
        format: 'knockout',
        configuredTeamCount: 6,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.update('admin', competitionId, {
        type: 'cup',
        format: 'league_knockout',
        qualifierCount: 8,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(() =>
      planFixtures(
        {
          ...({} as typeof schema.competitions.$inferSelect),
          type: 'league',
          configuredTeamCount: 2,
        },
        ['same', 'same'],
      ),
    ).toThrow('unique');
  });
});

describe('Fixed standings tiebreaks', () => {
  it('does not use wins to break a tie after points, goal difference and goals scored', () => {
    const participants = [
      { id: 'a', teamId: null, displayName: 'Alpha' },
      { id: 'b', teamId: null, displayName: 'Beta' },
    ];
    const baselines = participants.map((p, i) => ({
      id: p.id,
      teamName: p.displayName,
      played: 3,
      won: i,
      drawn: 3 - i * 3,
      lost: i * 2,
      goalsFor: 3,
      goalsAgainst: 3,
      points: 3,
    }));
    expect(
      calculateCompetitionStandings('c', participants, [], null, baselines).map(
        (r) => r.teamName,
      ),
    ).toEqual(['Alpha', 'Beta']);
  });
});
