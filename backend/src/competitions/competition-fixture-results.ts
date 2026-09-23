import { BadRequestException, ConflictException } from '@nestjs/common';
import { and, asc, eq, gte, sql } from 'drizzle-orm';
import { calculateCompetitionStandings } from '../common/competition-standings';
import { DatabaseService } from '../database/database.service';
import {
  competitionFixtures,
  competitionMatches,
  competitions,
  competitionTeams,
  events,
  matchEvents,
  matches,
  standings,
} from '../database/schema';
import { planFixtures } from './competition-fixtures';

export interface FixtureResultInput {
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
  homeScore: number;
  awayScore: number;
}

type ResultSource =
  | { kind: 'manual'; id: string }
  | { kind: 'live'; id: string };

type FixtureRow = typeof competitionFixtures.$inferSelect;

function hasActivity(fixture: FixtureRow) {
  return (
    fixture.status !== 'scheduled' ||
    fixture.homeScore !== null ||
    fixture.awayScore !== null ||
    fixture.winnerCompetitionTeamId !== null ||
    fixture.linkedMatchId !== null ||
    fixture.legacyResultId !== null
  );
}

function sourceMatches(fixture: FixtureRow, source: ResultSource) {
  return source.kind === 'manual'
    ? fixture.legacyResultId === source.id
    : fixture.linkedMatchId === source.id;
}

function sourcePatch(source: ResultSource) {
  return source.kind === 'manual'
    ? { legacyResultId: source.id }
    : { linkedMatchId: source.id };
}

async function listFixtureRows(
  databaseService: DatabaseService,
  competitionId: string,
) {
  return databaseService.database
    .select()
    .from(competitionFixtures)
    .where(eq(competitionFixtures.competitionId, competitionId))
    .orderBy(
      asc(competitionFixtures.stage),
      asc(competitionFixtures.round),
      asc(competitionFixtures.position),
    );
}

function resolveFixture(
  fixtures: FixtureRow[],
  source: ResultSource,
  input: FixtureResultInput,
) {
  const linked = fixtures.find((fixture) => sourceMatches(fixture, source));
  if (linked) return linked;

  return fixtures.find(
    (fixture) =>
      fixture.status === 'scheduled' &&
      fixture.homeCompetitionTeamId === input.homeCompetitionTeamId &&
      fixture.awayCompetitionTeamId === input.awayCompetitionTeamId,
  );
}

async function assertCanChangeFixtureResult(
  databaseService: DatabaseService,
  competitionId: string,
  fixture: FixtureRow,
  nextWinner: string | null,
) {
  const [competition] = await databaseService.database
    .select({ format: competitions.format })
    .from(competitions)
    .where(eq(competitions.id, competitionId))
    .limit(1);

  if (fixture.stage === 'league' && competition?.format === 'league_knockout') {
    const knockout = await databaseService.database
      .select({ id: competitionFixtures.id })
      .from(competitionFixtures)
      .where(
        and(
          eq(competitionFixtures.competitionId, competitionId),
          eq(competitionFixtures.stage, 'knockout'),
        ),
      )
      .limit(1);
    if (knockout.length) {
      throw new ConflictException(
        'League-phase results cannot change after the knockout stage has been created.',
      );
    }
  }

  if (
    fixture.stage === 'knockout' &&
    fixture.winnerCompetitionTeamId &&
    nextWinner !== fixture.winnerCompetitionTeamId &&
    fixture.nextFixtureId
  ) {
    const [next] = await databaseService.database
      .select()
      .from(competitionFixtures)
      .where(eq(competitionFixtures.id, fixture.nextFixtureId))
      .limit(1);
    if (next && hasActivity(next)) {
      throw new ConflictException(
        'This result cannot change because the next knockout match has already started or been completed.',
      );
    }
  }
}

/**
 * Generated competitions use their fixture list as the match source of truth.
 * Legacy competitions without generated fixtures keep accepting free-form
 * manual/live results exactly as before.
 */
export async function validateFixtureResult(
  databaseService: DatabaseService,
  competitionId: string,
  source: ResultSource,
  input: FixtureResultInput,
) {
  const fixtures = await listFixtureRows(databaseService, competitionId);
  if (!fixtures.length) return null;

  const fixture = resolveFixture(fixtures, source, input);
  if (!fixture) {
    throw new BadRequestException(
      'This result does not match an available generated fixture.',
    );
  }

  if (
    fixture.homeCompetitionTeamId !== input.homeCompetitionTeamId ||
    fixture.awayCompetitionTeamId !== input.awayCompetitionTeamId
  ) {
    throw new BadRequestException(
      'Teams cannot be changed after a result is linked to a generated fixture.',
    );
  }

  if (hasActivity(fixture) && !sourceMatches(fixture, source)) {
    throw new ConflictException('This fixture already has a recorded result.');
  }

  const winner =
    input.homeScore === input.awayScore
      ? null
      : input.homeScore > input.awayScore
        ? input.homeCompetitionTeamId
        : input.awayCompetitionTeamId;

  if (fixture.stage === 'knockout' && !winner) {
    throw new BadRequestException(
      'Knockout fixtures require a winner. Record a non-draw score.',
    );
  }

  await assertCanChangeFixtureResult(
    databaseService,
    competitionId,
    fixture,
    winner,
  );
  return fixture;
}

function seedOrder(size: number) {
  let seeds = [1, 2];
  for (let current = 4; current <= size; current *= 2) {
    seeds = seeds.flatMap((seed) => [seed, current + 1 - seed]);
  }
  return seeds;
}

async function ensureHybridKnockoutStage(
  databaseService: DatabaseService,
  competitionId: string,
) {
  const [competition] = await databaseService.database
    .select()
    .from(competitions)
    .where(eq(competitions.id, competitionId))
    .limit(1);
  if (
    !competition ||
    competition.format !== 'league_knockout' ||
    !competition.qualifierCount
  ) {
    return;
  }

  const fixtures = await listFixtureRows(databaseService, competitionId);
  if (
    fixtures.some((fixture) => fixture.stage === 'knockout') ||
    fixtures.some(
      (fixture) => fixture.stage === 'league' && fixture.status !== 'completed',
    )
  ) {
    return;
  }

  const participants = await databaseService.database
    .select({
      id: competitionTeams.id,
      teamId: competitionTeams.teamId,
      displayName: competitionTeams.displayName,
    })
    .from(competitionTeams)
    .where(eq(competitionTeams.competitionId, competitionId));

  const [baseline, manualRows, liveRows] = await Promise.all([
    databaseService.database
      .select({
        id: standings.id,
        teamName: standings.teamName,
        played: standings.played,
        won: standings.won,
        drawn: standings.drawn,
        lost: standings.lost,
        goalsFor: standings.goalsFor,
        goalsAgainst: standings.goalsAgainst,
        points: standings.points,
      })
      .from(standings)
      .where(eq(standings.competitionId, competitionId)),
    databaseService.database
      .select({
        homeCompetitionTeamId: competitionMatches.homeCompetitionTeamId,
        awayCompetitionTeamId: competitionMatches.awayCompetitionTeamId,
        homeScore: competitionMatches.homeScore,
        awayScore: competitionMatches.awayScore,
      })
      .from(competitionMatches)
      .where(eq(competitionMatches.competitionId, competitionId)),
    databaseService.database
      .select({
        ownCompetitionTeamId: competitionTeams.id,
        opponentCompetitionTeamId: matches.opponentCompetitionTeamId,
        isHome: matches.isHome,
        teamScore: sql<number>`count(*) filter (where ${matchEvents.team} = 'own' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`,
        opponentScore: sql<number>`count(*) filter (where ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`,
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .innerJoin(
        competitionTeams,
        and(
          eq(competitionTeams.competitionId, matches.competitionId),
          eq(competitionTeams.teamId, events.teamId),
        ),
      )
      .leftJoin(matchEvents, eq(matchEvents.matchId, matches.id))
      .where(
        and(
          eq(matches.competitionId, competitionId),
          eq(events.status, 'completed'),
          gte(matches.createdAt, competition.resultTrackingStartedAt),
          sql`${matches.opponentCompetitionTeamId} is not null`,
        ),
      )
      .groupBy(matches.id, competitionTeams.id),
  ]);

  const liveResults = liveRows
    .filter(
      (row): row is typeof row & { opponentCompetitionTeamId: string } =>
        row.opponentCompetitionTeamId !== null,
    )
    .map((row) => ({
      homeCompetitionTeamId: row.isHome
        ? row.ownCompetitionTeamId
        : row.opponentCompetitionTeamId,
      awayCompetitionTeamId: row.isHome
        ? row.opponentCompetitionTeamId
        : row.ownCompetitionTeamId,
      homeScore: row.isHome ? row.teamScore : row.opponentScore,
      awayScore: row.isHome ? row.opponentScore : row.teamScore,
    }));

  const table = calculateCompetitionStandings(
    competitionId,
    participants,
    [...manualRows, ...liveResults],
    null,
    baseline,
    competition,
  );
  const participantByName = new Map(
    participants.map((participant) => [
      participant.displayName.trim().toLocaleLowerCase(),
      participant.id,
    ]),
  );
  const qualified = table
    .slice(0, competition.qualifierCount)
    .map((row) => participantByName.get(row.teamName.trim().toLocaleLowerCase()))
    .filter((id): id is string => Boolean(id));

  if (qualified.length !== competition.qualifierCount) {
    throw new ConflictException('Could not resolve all knockout qualifiers.');
  }

  const seeded = seedOrder(competition.qualifierCount).map(
    (seed) => qualified[seed - 1],
  );
  const latestLeague = fixtures
    .filter((fixture) => fixture.stage === 'league')
    .reduce(
      (latest, fixture) =>
        fixture.scheduledAt > latest ? fixture.scheduledAt : latest,
      new Date(0),
    );
  const knockoutStart = new Date(latestLeague);
  knockoutStart.setUTCDate(knockoutStart.getUTCDate() + 1);
  const plan = planFixtures(
    {
      ...competition,
      format: 'knockout',
      configuredTeamCount: competition.qualifierCount,
      qualifierCount: null,
      startDate: knockoutStart.toISOString().slice(0, 10),
    },
    seeded,
  );

  if (!plan.length) return;
  await databaseService.database
    .insert(competitionFixtures)
    .values(
      plan.map((fixture) => ({
        ...fixture,
        scheduledAt: new Date(fixture.scheduledAt),
        competitionId,
      })),
    )
    .onConflictDoNothing();
}

export async function syncFixtureResult(
  databaseService: DatabaseService,
  competitionId: string,
  source: ResultSource,
  input: FixtureResultInput,
) {
  const fixture = await validateFixtureResult(
    databaseService,
    competitionId,
    source,
    input,
  );
  if (!fixture) return;

  const winner =
    input.homeScore === input.awayScore
      ? null
      : input.homeScore > input.awayScore
        ? input.homeCompetitionTeamId
        : input.awayCompetitionTeamId;

  await databaseService.database
    .update(competitionFixtures)
    .set({
      status: 'completed',
      homeScore: input.homeScore,
      awayScore: input.awayScore,
      winnerCompetitionTeamId: fixture.stage === 'knockout' ? winner : null,
      ...sourcePatch(source),
      updatedAt: new Date(),
    })
    .where(eq(competitionFixtures.id, fixture.id));

  if (fixture.stage === 'knockout' && fixture.nextFixtureId && winner) {
    await databaseService.database
      .update(competitionFixtures)
      .set({
        ...(fixture.nextFixtureSlot === 'home'
          ? { homeCompetitionTeamId: winner }
          : { awayCompetitionTeamId: winner }),
        updatedAt: new Date(),
      })
      .where(eq(competitionFixtures.id, fixture.nextFixtureId));
  }

  if (fixture.stage === 'league') {
    await ensureHybridKnockoutStage(databaseService, competitionId);
  }
}

export async function resetManualFixtureResult(
  databaseService: DatabaseService,
  competitionId: string,
  resultId: string,
) {
  const fixtures = await listFixtureRows(databaseService, competitionId);
  const fixture = fixtures.find((row) => row.legacyResultId === resultId);
  if (!fixture) return;

  await assertCanChangeFixtureResult(
    databaseService,
    competitionId,
    fixture,
    null,
  );

  if (fixture.stage === 'knockout' && fixture.nextFixtureId) {
    await databaseService.database
      .update(competitionFixtures)
      .set({
        ...(fixture.nextFixtureSlot === 'home'
          ? { homeCompetitionTeamId: null }
          : { awayCompetitionTeamId: null }),
        updatedAt: new Date(),
      })
      .where(eq(competitionFixtures.id, fixture.nextFixtureId));
  }

  await databaseService.database
    .update(competitionFixtures)
    .set({
      status: 'scheduled',
      homeScore: null,
      awayScore: null,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      winnerCompetitionTeamId: null,
      legacyResultId: null,
      updatedAt: new Date(),
    })
    .where(eq(competitionFixtures.id, fixture.id));
}
