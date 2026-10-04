import { BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { and, asc, eq, gte, or, sql } from 'drizzle-orm';
import { calculateCompetitionStandings } from '../common/competition-standings';
import { DatabaseService } from '../database/database.service';
import {
  ensureCompetitionFixtureSession,
  twoSidedLiveLoggingEnabled,
} from '../matches/match-sessions';
import {
  competitionFixtures,
  competitionMatches,
  competitions,
  competitionTeams,
  events,
  matchEvents,
  matchProjectionState,
  matchSessionParticipants,
  matchSessions,
  matches,
  standings,
} from '../database/schema';
import { planFixtures } from './competition-fixtures';
import { fixtureResultSourceMatches } from '../matches/session-finalisation';
import { sessionHasTimedOutConfirmation } from '../matches/session-finalisation';

export interface FixtureResultInput {
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
  homeScore: number;
  awayScore: number;
}

/** Finalise one-confirmation sessions lazily when a report or standings view is read. */
export async function finaliseTimedOutSession(
  databaseService: DatabaseService,
  sessionId: string,
  now = new Date(),
): Promise<boolean> {
  if (!twoSidedLiveLoggingEnabled()) return false;
  const [session] = await databaseService.database
    .select()
    .from(matchSessions)
    .where(eq(matchSessions.id, sessionId))
    .limit(1);
  if (!session || !sessionHasTimedOutConfirmation(session, now)) return false;
  const [row] = await databaseService.database
    .select({ match: matches, event: events, projection: matchProjectionState })
    .from(matches)
    .innerJoin(events, eq(events.id, matches.eventId))
    .innerJoin(
      matchProjectionState,
      eq(matchProjectionState.matchId, matches.id),
    )
    .where(eq(matches.sharedMatchId, sessionId))
    .limit(1);
  const actorId =
    session.homeConfirmedByUserId ?? session.awayConfirmedByUserId;
  if (
    !row ||
    row.event.status !== 'completed' ||
    row.projection.unresolvedReviewCount > 0 ||
    !actorId
  )
    return false;
  const finalised = await databaseService.database.execute<{
    accepted: boolean;
  }>(sql`
    select finalise_match_projection(${row.match.id}::uuid, ${row.projection.revision}::integer, ${actorId}::text) as accepted`);
  if (!finalised.rows[0]?.accepted) return false;
  await databaseService.database
    .update(matchSessions)
    .set({ finalisedAt: now, finalisedByUserId: actorId, updatedAt: now })
    .where(
      and(
        eq(matchSessions.id, sessionId),
        sql`${matchSessions.finalisedAt} is null`,
      ),
    );

  const [fixture] = await databaseService.database
    .select()
    .from(competitionFixtures)
    .where(eq(competitionFixtures.sharedSessionId, sessionId))
    .limit(1);
  if (
    fixture?.competitionId &&
    fixture.homeCompetitionTeamId &&
    fixture.awayCompetitionTeamId
  ) {
    const [participant] = await databaseService.database
      .select({ side: matchSessionParticipants.side })
      .from(matchSessionParticipants)
      .where(
        and(
          eq(matchSessionParticipants.sessionId, sessionId),
          eq(matchSessionParticipants.teamId, row.event.teamId),
        ),
      )
      .limit(1);
    if (!participant) return false;
    const ownTeamIsHome = participant.side === 'home';
    const homeScore = ownTeamIsHome
      ? row.projection.confirmedTeamScore
      : row.projection.confirmedOpponentScore;
    const awayScore = ownTeamIsHome
      ? row.projection.confirmedOpponentScore
      : row.projection.confirmedTeamScore;
    await syncFixtureResult(
      databaseService,
      fixture.competitionId,
      { kind: 'live', id: row.match.id, sessionId },
      {
        homeCompetitionTeamId: fixture.homeCompetitionTeamId,
        awayCompetitionTeamId: fixture.awayCompetitionTeamId,
        homeScore,
        awayScore,
      },
    );
  }
  return true;
}

export async function finaliseTimedOutCompetitionSessions(
  databaseService: DatabaseService,
  competitionId: string,
  now = new Date(),
) {
  if (!twoSidedLiveLoggingEnabled()) return;
  const rows = await databaseService.database
    .select({ sessionId: competitionFixtures.sharedSessionId })
    .from(competitionFixtures)
    .where(
      and(
        eq(competitionFixtures.competitionId, competitionId),
        sql`${competitionFixtures.sharedSessionId} is not null`,
      ),
    );
  for (const row of rows) {
    if (row.sessionId)
      await finaliseTimedOutSession(databaseService, row.sessionId, now);
  }
}

type ResultSource =
  | { kind: 'manual'; id: string }
  | { kind: 'live'; id: string; sessionId?: string };

type FixtureRow = typeof competitionFixtures.$inferSelect;
const logger = new Logger('CompetitionFixtureResults');

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
    : fixtureResultSourceMatches(fixture, source);
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
        fixtureId: competitionFixtures.id,
        homeCompetitionTeamId: competitionFixtures.homeCompetitionTeamId,
        awayCompetitionTeamId: competitionFixtures.awayCompetitionTeamId,
        homeScore: competitionFixtures.homeScore,
        awayScore: competitionFixtures.awayScore,
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .leftJoin(
        competitionFixtures,
        or(
          eq(competitionFixtures.linkedMatchId, matches.id),
          and(
            sql`${matches.sharedMatchId} is not null`,
            eq(competitionFixtures.sharedSessionId, matches.sharedMatchId),
          ),
        ),
      )
      .where(
        and(
          eq(matches.competitionId, competitionId),
          eq(events.status, 'completed'),
          gte(matches.createdAt, competition.resultTrackingStartedAt),
          sql`${competitionFixtures.id} is not null`,
          eq(competitionFixtures.status, 'completed'),
        ),
      )
      .groupBy(
        matches.id,
        competitionFixtures.id,
        competitionFixtures.homeCompetitionTeamId,
        competitionFixtures.awayCompetitionTeamId,
        competitionFixtures.homeScore,
        competitionFixtures.awayScore,
      ),
  ]);

  const liveByFixture = new Map<string, (typeof liveRows)[number]>();
  for (const row of liveRows) {
    if (row.fixtureId && !liveByFixture.has(row.fixtureId)) {
      liveByFixture.set(row.fixtureId, row);
    }
  }
  const liveResults = [...liveByFixture.values()].flatMap((row) =>
    row.fixtureId && row.homeCompetitionTeamId && row.awayCompetitionTeamId && row.homeScore !== null && row.awayScore !== null
      ? [{
          homeCompetitionTeamId: row.homeCompetitionTeamId,
          awayCompetitionTeamId: row.awayCompetitionTeamId,
          homeScore: row.homeScore,
          awayScore: row.awayScore,
        }]
      : [],
  );

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
    .map((row) =>
      participantByName.get(row.teamName.trim().toLocaleLowerCase()),
    )
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
  const inserted = await databaseService.database
    .insert(competitionFixtures)
    .values(
      plan.map((fixture) => ({
        ...fixture,
        scheduledAt: new Date(fixture.scheduledAt),
        competitionId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: competitionFixtures.id });
  if (twoSidedLiveLoggingEnabled()) {
    for (const fixture of inserted) {
      await ensureCompetitionFixtureSession(databaseService, fixture.id);
    }
  }
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
  if (
    source.kind === 'live' &&
    source.sessionId &&
    fixture.status === 'completed' &&
    (fixture.homeScore !== input.homeScore ||
      fixture.awayScore !== input.awayScore)
  ) {
    logger.error(
      `Fixture/session result disagreement: fixture=${fixture.id} session=${source.sessionId} fixtureScore=${fixture.homeScore}-${fixture.awayScore} sessionScore=${input.homeScore}-${input.awayScore}`,
    );
  }

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
