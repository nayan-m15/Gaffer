import {
  assertMatchSessionIdentity,
  resolveMatchSessionIdentity,
  sharedMatchConflict,
} from './match-session-integrity';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { stableStringify } from '@gaffer/match-domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { InsightsService } from '../insights/insights.service';
import {
  athleteMatchStats,
  athletes,
  competitions,
  competitionFixtures,
  competitionTeams,
  events,
  matchEvents,
  matchEventMemberships,
  matchEventObservations,
  matchEventOperations,
  matchEventReviews,
  matchClockOperations,
  matchProjectionState,
  matchSessionParticipants,
  matchSessions,
  teamMembers,
  matches,
  opponentMatchPlayers,
  seasons,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import {
  FriendlyFixturesService,
  unavailableFriendlyOpponentLineup,
} from '../friendly-fixtures/friendly-fixtures.service';
import {
  finaliseTimedOutSession,
  syncFixtureResult,
  validateFixtureResult,
} from '../competitions/competition-fixture-results';
import type {
  CreateMatchLogEventDto,
  ResolveMatchEventReviewDto,
  UpdateMatchLogEventDto,
  UpdateMatchClockDto,
} from './matches.schemas';
import { twoSidedLiveLoggingEnabled } from './match-sessions';
import { shouldFinaliseSession } from './session-finalisation';

function isGoalkeeperPosition(position: string | null | undefined) {
  const normalized = position?.trim().toLowerCase();
  return normalized === 'gk' || normalized === 'goalkeeper';
}

/**
 * Live match logging. Every query is scoped to the team returned by
 * `TeamsService.findTeamForUser`; matches on other teams are treated as
 * missing (404) rather than forbidden, so existence is not leaked.
 */
@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
    private readonly insightsService: InsightsService,
    private readonly friendlyFixturesService: FriendlyFixturesService,
  ) {}

  async getSessionReportForSheet(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match } = await this.requireMatch(team.id, matchId);
    if (!twoSidedLiveLoggingEnabled() || !match.sharedMatchId) {
      throw new NotFoundException('Match session not found.');
    }
    return this.getSessionReport(userId, match.sharedMatchId);
  }

  /** Canonical public report. Private squads, plans and notes are never selected. */
  async getSessionReport(userId: string, sessionId: string) {
    if (!twoSidedLiveLoggingEnabled()) {
      throw new NotFoundException('Match session not found.');
    }
    const team = await this.requireTeam(userId);
    const [participant] = await this.databaseService.database
      .select({ id: matchSessionParticipants.id })
      .from(matchSessionParticipants)
      .where(
        and(
          eq(matchSessionParticipants.sessionId, sessionId),
          eq(matchSessionParticipants.teamId, team.id),
        ),
      )
      .limit(1);
    if (!participant) throw new NotFoundException('Match session not found.');
    await finaliseTimedOutSession(this.databaseService, sessionId);
    const [session] = await this.databaseService.database
      .select()
      .from(matchSessions)
      .where(eq(matchSessions.id, sessionId))
      .limit(1);
    if (!session) throw new NotFoundException('Match session not found.');

    const participants = await this.databaseService.database
      .select({
        side: matchSessionParticipants.side,
        teamId: matchSessionParticipants.teamId,
        competitionTeamId: matchSessionParticipants.competitionTeamId,
      })
      .from(matchSessionParticipants)
      .where(eq(matchSessionParticipants.sessionId, sessionId))
      .orderBy(desc(matchSessionParticipants.side));
    const timelineRows = await this.databaseService.database
      .select({
        id: matchEvents.id,
        side: matchEvents.side,
        eventType: matchEvents.eventType,
        minute: matchEvents.minute,
        period: matchEvents.period,
        matchElapsedMs: matchEvents.matchElapsedMs,
        lifecycleStatus: matchEvents.lifecycleStatus,
        manuallyAdjusted: matchEvents.manuallyAdjusted,
        createdAt: matchEvents.createdAt,
        updatedAt: matchEvents.updatedAt,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        shirtNumber: athletes.squadNumber,
        opponentName: opponentMatchPlayers.name,
        opponentNumber: opponentMatchPlayers.shirtNumber,
      })
      .from(matchEvents)
      .leftJoin(athletes, eq(matchEvents.athleteId, athletes.id))
      .leftJoin(
        opponentMatchPlayers,
        eq(matchEvents.opponentPlayerId, opponentMatchPlayers.id),
      )
      .where(
        and(
          eq(matchEvents.sessionId, sessionId),
          sql`${matchEvents.eventType} <> 'injury'`,
          sql`${matchEvents.lifecycleStatus} <> 'voided'`,
        ),
      )
      .orderBy(
        desc(matchEvents.minute),
        desc(matchEvents.createdAt),
        asc(matchEvents.id),
      );
    const timeline = timelineRows.map(
      ({
        firstName,
        lastName,
        shirtNumber,
        opponentName,
        opponentNumber,
        ...row
      }) => ({
        ...row,
        player:
          firstName && lastName
            ? { name: `${firstName} ${lastName}`.trim(), shirtNumber }
            : opponentName || opponentNumber !== null
              ? { name: opponentName, shirtNumber: opponentNumber }
              : null,
      }),
    );
    const reviews = await this.databaseService.database
      .select({
        id: matchEventReviews.id,
        canonicalEventId: matchEventReviews.canonicalEventId,
        reason: matchEventReviews.reason,
        status: matchEventReviews.status,
        resolution: matchEventReviews.resolution,
        resolvedAt: matchEventReviews.resolvedAt,
        resolvedByUserId: matchEventReviews.resolvedByUserId,
        disputedAt: matchEventReviews.disputedAt,
        disputedByUserId: matchEventReviews.disputedByUserId,
      })
      .from(matchEventReviews)
      .where(
        and(
          eq(matchEventReviews.sessionId, sessionId),
          sql`${matchEventReviews.canonicalEventId} in (select id from match_events where event_type <> 'injury')`,
        ),
      )
      .orderBy(asc(matchEventReviews.createdAt), asc(matchEventReviews.id));
    const unresolved = reviews.some(
      (review) => review.status === 'open' || review.disputedAt !== null,
    );
    const sheets = await this.databaseService.database
      .select({
        period: matches.clockPeriod,
        elapsedMs: matches.clockElapsedMs,
        startedAt: matches.clockStartedAt,
        revision: matches.clockRevision,
        status: events.status,
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(eq(matches.sharedMatchId, sessionId))
      .orderBy(
        desc(matches.clockRevision),
        desc(matches.updatedAt),
        asc(matches.id),
      );
    const [clockOperation] = await this.databaseService.database
      .select({
        period: matches.clockPeriod,
        elapsedMs: matches.clockElapsedMs,
        startedAt: matches.clockStartedAt,
        revision: matches.clockRevision,
      })
      .from(matchClockOperations)
      .innerJoin(matches, eq(matchClockOperations.matchId, matches.id))
      .where(
        and(
          eq(matchClockOperations.sessionId, sessionId),
          sql`${matchClockOperations.outcome} like 'applied%'`,
        ),
      )
      .orderBy(
        desc(matchClockOperations.createdAt),
        asc(matchClockOperations.id),
      )
      .limit(1);
    const finished = sheets.some(
      (sheet) => sheet.period === 'full_time' || sheet.status === 'completed',
    );
    const anchor = clockOperation ?? sheets[0];
    const clock = {
      period: finished ? 'full_time' : (anchor?.period ?? 'not_started'),
      elapsedMs: finished
        ? Math.max(0, ...sheets.map((sheet) => sheet.elapsedMs))
        : (anchor?.elapsedMs ?? 0),
      startedAt: finished ? null : (anchor?.startedAt ?? null),
      running: !finished && Boolean(anchor?.startedAt),
      revision: anchor?.revision ?? 0,
    };
    const goals = timeline.filter((event) => event.eventType === 'goal');
    const [fixture] = await this.databaseService.database
      .select({
        homeScore: competitionFixtures.homeScore,
        awayScore: competitionFixtures.awayScore,
        status: competitionFixtures.status,
      })
      .from(competitionFixtures)
      .where(eq(competitionFixtures.sharedSessionId, sessionId))
      .limit(1);
    const published =
      session.finalisedAt &&
      !unresolved &&
      fixture?.status === 'completed' &&
      fixture.homeScore !== null &&
      fixture.awayScore !== null;
    return {
      sessionId,
      participants,
      score: {
        home: published
          ? fixture.homeScore
          : goals.filter((event) => event.side === 'home').length,
        away: published
          ? fixture.awayScore
          : goals.filter((event) => event.side === 'away').length,
      },
      clock,
      finalStatus: session.finalisedAt
        ? unresolved
          ? 'amendment_required'
          : 'finalised'
        : finished
          ? 'awaiting_confirmation'
          : 'open',
      finalisedAt: session.finalisedAt,
      confirmations: {
        home: session.homeConfirmedAt,
        away: session.awayConfirmedAt,
      },
      timeline,
      reviews,
    };
  }

  async findOne(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    if (match.sharedMatchId && twoSidedLiveLoggingEnabled()) {
      await finaliseTimedOutSession(this.databaseService, match.sharedMatchId);
    }

    let competitionName: string | null = null;
    let competitionSeason: string | null = null;
    if (match.competitionId) {
      const [competition] = await this.databaseService.database
        .select({
          name: competitions.name,
          legacySeason: competitions.season,
          seasonName: seasons.name,
        })
        .from(competitions)
        .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
        .where(eq(competitions.id, match.competitionId))
        .limit(1);
      competitionName = competition?.name ?? null;
      competitionSeason =
        competition?.seasonName ?? competition?.legacySeason ?? null;
    }

    const opponentSquad = await this.listOpponentPlayers(match.id);
    const projection = await this.refreshProjection(match.id);

    // Accepted Gaffer friendlies only: surface the opposing team's actual
    // confirmed lineup alongside the manually logged opponent squad. The
    // expected opponent team is verified against the match row so a match
    // can never resolve an unrelated team's lineup.
    const friendlyOpponentLineup = event.competitionFixtureId
      ? await this.friendlyFixturesService.resolveCompetitionOpponentLineup(
          event.competitionFixtureId,
          team.id,
        )
      : event.friendlyFixtureId && match.opponentTeamId
        ? await this.friendlyFixturesService.resolveOpponentLineup(
            event.friendlyFixtureId,
            team.id,
            match.opponentTeamId,
          )
        : unavailableFriendlyOpponentLineup();

    return {
      ...match,
      sharedSessionId: twoSidedLiveLoggingEnabled()
        ? match.sharedMatchId
        : null,
      teamScore: projection.provisionalTeamScore,
      opponentScore: projection.provisionalOpponentScore,
      projection,
      eventTitle: event.title,
      eventStatus: event.status,
      eventScheduledAt: event.scheduledAt,
      eventLocation: event.location,
      eventNotes: event.notes,
      competitionName,
      competitionSeason,
      opponentSquad,
      friendlyOpponentLineup,
    };
  }

  async getSquad(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);

    return this.databaseService.database
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        squadNumber: athletes.squadNumber,
        position: athletes.position,
        started: athleteMatchStats.started,
      })
      .from(athleteMatchStats)
      .innerJoin(athletes, eq(athleteMatchStats.athleteId, athletes.id))
      .where(eq(athleteMatchStats.matchId, matchId))
      .orderBy(asc(athletes.squadNumber), asc(athletes.lastName));
  }

  async getOpponentSquad(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);
    return this.listOpponentPlayers(matchId);
  }

  async getInsight(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);
    const insight = await this.insightsService.getForMatch(matchId);
    return insight ?? { matchId, status: 'unavailable' as const };
  }

  async listEvents(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { event } = await this.requireSharedMatch(team.id, matchId);
    const peer = event.teamId !== team.id;

    const rows = await this.databaseService.database
      .select({
        id: matchEvents.id,
        matchId: matchEvents.matchId,
        athleteId: matchEvents.athleteId,
        team: matchEvents.team,
        opponentLabel: matchEvents.opponentLabel,
        opponentPlayerId: matchEvents.opponentPlayerId,
        eventType: matchEvents.eventType,
        minute: matchEvents.minute,
        detail: matchEvents.detail,
        loggedByUserId: matchEvents.loggedByUserId,
        manuallyAdjusted: matchEvents.manuallyAdjusted,
        clientRequestId: matchEvents.clientRequestId,
        period: matchEvents.period,
        matchElapsedMs: matchEvents.matchElapsedMs,
        lifecycleStatus: matchEvents.lifecycleStatus,
        projectionRevision: matchEvents.projectionRevision,
        createdAt: matchEvents.createdAt,
        updatedAt: matchEvents.updatedAt,
        athleteFirstName: athletes.firstName,
        athleteLastName: athletes.lastName,
        athleteSquadNumber: athletes.squadNumber,
        athletePosition: athletes.position,
        opponentPlayerShirtNumber: opponentMatchPlayers.shirtNumber,
        opponentPlayerName: opponentMatchPlayers.name,
      })
      .from(matchEvents)
      .leftJoin(athletes, eq(matchEvents.athleteId, athletes.id))
      .leftJoin(
        opponentMatchPlayers,
        eq(matchEvents.opponentPlayerId, opponentMatchPlayers.id),
      )
      .where(
        and(
          eq(matchEvents.matchId, matchId),
          peer ? sql`${matchEvents.eventType} <> 'injury'` : undefined,
          sql`${matchEvents.lifecycleStatus} <> 'voided'`,
        ),
      )
      .orderBy(desc(matchEvents.minute), desc(matchEvents.createdAt));

    return rows.map((row) => ({
      id: row.id,
      matchId: row.matchId,
      athleteId: peer ? null : row.athleteId,
      team: row.team,
      opponentLabel: row.opponentLabel,
      opponentPlayerId: peer ? null : row.opponentPlayerId,
      eventType: row.eventType,
      minute: row.minute,
      detail: peer ? null : row.detail,
      loggedByUserId: row.loggedByUserId,
      manuallyAdjusted: row.manuallyAdjusted,
      clientRequestId: row.clientRequestId,
      period: row.period,
      matchElapsedMs: row.matchElapsedMs,
      lifecycleStatus: row.lifecycleStatus,
      projectionRevision: row.projectionRevision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      athlete:
        !peer && row.athleteId && row.athleteFirstName && row.athleteLastName
          ? {
              id: row.athleteId,
              firstName: row.athleteFirstName,
              lastName: row.athleteLastName,
              squadNumber: row.athleteSquadNumber,
              position: row.athletePosition,
            }
          : null,
      opponentPlayer:
        !peer && row.opponentPlayerId && row.opponentPlayerShirtNumber != null
          ? {
              id: row.opponentPlayerId,
              shirtNumber: row.opponentPlayerShirtNumber,
              name: row.opponentPlayerName,
            }
          : null,
    }));
  }

  async logEvent(userId: string, matchId: string, dto: CreateMatchLogEventDto) {
    const logged = await this.persistEventObservation(userId, matchId, dto);
    await this.refreshProjection(matchId);
    return logged;
  }

  private async persistEventObservation(
    userId: string,
    matchId: string,
    dto: CreateMatchLogEventDto,
  ) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    this.assertEditable(event.status);

    if (dto.athleteId) {
      await this.requireMatchAthlete(match.id, dto.athleteId);
    }
    this.validateEventAttribution(
      dto.team,
      dto.eventType,
      dto.athleteId ?? null,
      dto.opponentPlayerId ?? null,
      dto.opponentLabel ?? null,
    );
    await this.validateSubstitution(
      match.id,
      dto.team,
      dto.eventType,
      dto.detail,
    );

    const attribution = await this.resolveOpponentAttribution(match, {
      team: dto.team,
      opponentPlayerId: dto.opponentPlayerId,
      opponentLabel: dto.opponentLabel,
    });

    const period = dto.period ?? match.clockPeriod;
    const matchElapsedMs = dto.matchElapsedMs ?? dto.minute * 60_000;
    const opponentLabel =
      attribution.opponentLabel ?? dto.opponentLabel ?? null;
    const opponentPlayerId = attribution.opponentPlayerId ?? null;
    await this.validateGoalkeeperSave(
      match.id,
      dto.team,
      dto.eventType,
      dto.athleteId ?? null,
      opponentPlayerId,
    );
    const payload = {
      team: dto.team,
      eventType: dto.eventType,
      athleteId: dto.athleteId ?? null,
      opponentLabel,
      opponentPlayerId,
      period,
      matchElapsedMs,
      detail: dto.detail ?? null,
    };
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');

    if (event.status === 'completed' && dto.eventType === 'goal') {
      const current = await this.buildCompetitionFixtureResult(team.id, match);
      if (current) {
        const projected = this.adjustFixtureScore(
          current.result,
          match.isHome,
          dto.team,
          1,
        );
        await validateFixtureResult(
          this.databaseService,
          current.competitionId,
          {
            kind: 'live',
            id: match.id,
            sessionId: twoSidedLiveLoggingEnabled()
              ? (match.sharedMatchId ?? undefined)
              : undefined,
          },
          projected,
        );
      }
    }

    const side = match.isHome
      ? dto.team === 'own'
        ? 'home'
        : 'away'
      : dto.team === 'own'
        ? 'away'
        : 'home';
    const persistedResult =
      match.sharedMatchId && twoSidedLiveLoggingEnabled()
        ? await this.databaseService.database.execute<{
            canonical_event_id: string;
          }>(sql`select ingest_match_session_event_observation(
          ${dto.clientRequestId}::uuid,
          ${match.id}::uuid,
          ${match.sharedMatchId}::uuid,
          ${side}::match_session_side,
          ${dto.deviceId ?? dto.clientRequestId}::uuid,
          ${userId}::text,
          ${dto.eventType}::match_event_type,
          ${dto.team}::match_event_team,
          ${dto.athleteId ?? null}::uuid,
          ${opponentLabel}::text,
          ${opponentPlayerId}::uuid,
          ${period}::text,
          ${matchElapsedMs}::integer,
          ${dto.minute}::integer,
          ${dto.detail ?? null}::text,
          ${JSON.stringify(payload)}::jsonb,
          ${payloadHash}::text,
          ${(dto.clientCreatedAt ? new Date(dto.clientCreatedAt) : new Date()).toISOString()}::timestamptz,
          ${event.status === 'completed'}::boolean
        ) as canonical_event_id`)
        : await this.databaseService.database.execute<{
            canonical_event_id: string;
          }>(sql`select ingest_match_event_observation(
          ${dto.clientRequestId}::uuid,
          ${match.id}::uuid,
          ${dto.deviceId ?? dto.clientRequestId}::uuid,
          ${userId}::text,
          ${dto.eventType}::match_event_type,
          ${dto.team}::match_event_team,
          ${dto.athleteId ?? null}::uuid,
          ${opponentLabel}::text,
          ${opponentPlayerId}::uuid,
          ${period}::text,
          ${matchElapsedMs}::integer,
          ${dto.minute}::integer,
          ${dto.detail ?? null}::text,
          ${JSON.stringify(payload)}::jsonb,
          ${payloadHash}::text,
          ${(dto.clientCreatedAt ? new Date(dto.clientCreatedAt) : new Date()).toISOString()}::timestamptz,
          ${event.status === 'completed'}::boolean
        ) as canonical_event_id`);
    const persisted = persistedResult.rows[0];
    if (!persisted?.canonical_event_id) {
      throw new BadRequestException('Could not persist the match observation.');
    }
    const persistedEvent = await this.requireCanonicalEventForObservation(
      match.id,
      dto.clientRequestId,
    );
    await this.refreshProjection(match.id);
    await this.syncCompletedCompetitionFixture(
      team.id,
      match,
      event.status,
      dto.eventType === 'goal',
    );
    return persistedEvent;
  }

  async listEventReviews(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match } = await this.requireSharedMatch(team.id, matchId);
    const ownSheets = await this.databaseService.database
      .select({ id: matches.id })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(
        and(
          eq(events.teamId, team.id),
          match.sharedMatchId
            ? eq(matches.sharedMatchId, match.sharedMatchId)
            : eq(matches.id, matchId),
        ),
      );
    const ownSheetIds = new Set(ownSheets.map((row) => row.id));
    const reviewMatchIds =
      match.sharedMatchId && twoSidedLiveLoggingEnabled()
        ? (
            await this.databaseService.database
              .select({ id: matches.id })
              .from(matches)
              .where(eq(matches.sharedMatchId, match.sharedMatchId))
          ).map((row) => row.id)
        : [matchId];
    const rows = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(
        sql`${matchEventReviews.matchId} in (${sql.join(
          reviewMatchIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
      )
      .orderBy(desc(matchEventReviews.createdAt));
    const results = await Promise.all(
      rows.map(async (review) => {
        const observations =
          review.observationIds.length > 0
            ? await this.databaseService.database
                .select()
                .from(matchEventObservations)
                .where(
                  sql`${matchEventObservations.id} in (${sql.join(
                    review.observationIds.map((id) => sql`${id}::uuid`),
                    sql`, `,
                  )})`,
                )
            : (
                await this.databaseService.database
                  .select({ observation: matchEventObservations })
                  .from(matchEventObservations)
                  .innerJoin(
                    matchEventMemberships,
                    eq(
                      matchEventMemberships.observationId,
                      matchEventObservations.id,
                    ),
                  )
                  .where(
                    eq(
                      matchEventMemberships.canonicalEventId,
                      review.canonicalEventId,
                    ),
                  )
              ).map((row) => row.observation);
        return {
          ...review,
          observations: observations.map((observation) =>
            ownSheetIds.has(observation.matchId)
              ? observation
              : {
                  id: observation.id,
                  matchId: observation.matchId,
                  sessionId: observation.sessionId,
                  side: observation.side,
                  loggedByUserId: observation.loggedByUserId,
                  eventType: observation.eventType,
                  team: observation.team,
                  opponentLabel: observation.opponentLabel,
                  period: observation.period,
                  matchElapsedMs: observation.matchElapsedMs,
                  clientCreatedAt: observation.clientCreatedAt,
                  serverReceivedAt: observation.serverReceivedAt,
                  athleteId: null,
                  opponentPlayerId: null,
                  detail: null,
                  payload: null,
                  payloadHash: null,
                },
          ),
        };
      }),
    );
    return results.filter(
      (review) =>
        !review.observations.some(
          (observation) =>
            observation.eventType === 'injury' &&
            !ownSheetIds.has(observation.matchId),
        ),
    );
  }

  async resolveEventReview(
    userId: string,
    matchId: string,
    reviewId: string,
    dto: ResolveMatchEventReviewDto,
    operationId: string = randomUUID(),
    causalParentIds: string[] = [],
  ) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const requester = await this.requireSharedMatch(team.id, matchId);
    const [review] = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(eq(matchEventReviews.id, reviewId))
      .limit(1);
    if (
      !review ||
      (twoSidedLiveLoggingEnabled() && requester.match.sharedMatchId
        ? review.sessionId !== requester.match.sharedMatchId
        : review.matchId !== matchId)
    ) {
      throw new NotFoundException('Event review not found.');
    }
    const reviewMatchId = review.matchId;
    const { match, event } = await this.requireSharedMatch(
      team.id,
      reviewMatchId,
    );
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    const previousResult = await this.getIdempotentReviewResult(
      userId,
      reviewMatchId,
      reviewId,
      operationId,
      dto,
    );
    if (previousResult) return previousResult;
    if (review.reviewVersion === 2 && review.observationIds.length === 2) {
      return this.resolveCandidateReview(
        team.id,
        match,
        event,
        reviewId,
        reviewMatchId,
        userId,
        operationId,
        causalParentIds,
        dto,
      );
    }
    if (review.status !== 'open') {
      throw new NotFoundException('Open event review not found.');
    }
    const targetObservationIds = await this.observationIdsForCanonical(
      review.canonicalEventId,
    );

    const separatedGoals =
      dto.resolution === 'separate_events'
        ? await this.separateReviewObservations(
            team.id,
            match,
            event,
            review,
            reviewMatchId,
          )
        : false;
    await this.databaseService.database
      .update(matchEvents)
      .set({ lifecycleStatus: 'confirmed', updatedAt: new Date() })
      .where(eq(matchEvents.id, review.canonicalEventId));
    const [resolved] = await this.databaseService.database
      .update(matchEventReviews)
      .set({
        status: 'resolved',
        resolution: dto.resolution,
        resolvedByUserId: userId,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matchEventReviews.id, review.id))
      .returning();
    await this.recordOperation({
      id: operationId,
      matchId: reviewMatchId,
      actorUserId: userId,
      operationType: dto.resolution === 'same_event' ? 'merge' : 'separate',
      canonicalEventId: review.canonicalEventId,
      targetObservationIds,
      decision: { reviewId, resolution: dto.resolution },
      causalParentIds,
    });
    await this.refreshProjection(reviewMatchId);
    await this.syncCompletedCompetitionFixture(
      team.id,
      match,
      event.status,
      separatedGoals,
    );
    return resolved;
  }

  async disputeEventReview(userId: string, matchId: string, reviewId: string) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const { match, event } = await this.requireSharedMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    const [review] = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(eq(matchEventReviews.id, reviewId))
      .limit(1);
    if (
      !review ||
      (match.sharedMatchId && twoSidedLiveLoggingEnabled()
        ? review.sessionId !== match.sharedMatchId
        : review.matchId !== matchId)
    ) {
      throw new NotFoundException('Event review not found.');
    }
    if (review.status !== 'resolved') {
      throw new BadRequestException('Only a resolved review can be disputed.');
    }
    if (review.disputedAt) return review;
    if (match.sharedMatchId && review.resolvedByUserId) {
      const [resolver] = await this.databaseService.database
        .select({ teamId: matchSessionParticipants.teamId })
        .from(matchSessionParticipants)
        .innerJoin(
          teamMembers,
          eq(teamMembers.teamId, matchSessionParticipants.teamId),
        )
        .where(
          and(
            eq(matchSessionParticipants.sessionId, match.sharedMatchId),
            eq(teamMembers.userId, review.resolvedByUserId),
          ),
        )
        .limit(1);
      if (!resolver || resolver.teamId === team.id) {
        throw new BadRequestException(
          'Only the other participating team can dispute this decision.',
        );
      }
    }
    const [updated] = await this.databaseService.database
      .update(matchEventReviews)
      .set({
        disputedByUserId: userId,
        disputedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matchEventReviews.id, reviewId))
      .returning();
    this.logger.warn(
      `Open match review dispute: session=${review.sessionId ?? 'legacy'} review=${review.id} actor=${userId}`,
    );
    return updated;
  }

  private async getIdempotentReviewResult(
    userId: string,
    matchId: string,
    reviewId: string,
    operationId: string,
    dto: ResolveMatchEventReviewDto,
  ) {
    const [previousDecision] = await this.databaseService.database
      .select()
      .from(matchEventOperations)
      .where(eq(matchEventOperations.id, operationId))
      .limit(1);
    if (!previousDecision) return undefined;
    const decisionMatches =
      previousDecision.matchId === matchId &&
      previousDecision.actorUserId === userId &&
      previousDecision.decision.reviewId === reviewId &&
      previousDecision.decision.resolution === dto.resolution;
    if (!decisionMatches) {
      throw new BadRequestException('This offline operation ID was reused.');
    }
    const [resolvedReview] = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(eq(matchEventReviews.id, reviewId))
      .limit(1);
    if (resolvedReview) await this.refreshProjection(matchId);
    return resolvedReview;
  }

  private async resolveCandidateReview(
    teamId: string,
    match: typeof matches.$inferSelect,
    event: typeof events.$inferSelect,
    reviewId: string,
    matchId: string,
    userId: string,
    operationId: string,
    causalParentIds: string[],
    dto: ResolveMatchEventReviewDto,
  ) {
    const result =
      match.sharedMatchId && twoSidedLiveLoggingEnabled()
        ? await this.databaseService.database.execute<{
            canonical_event_id: string;
          }>(sql`select resolve_match_session_event_candidate(
      ${reviewId}::uuid, ${matchId}::uuid, ${match.sharedMatchId}::uuid,
      ${userId}::text, ${operationId}::uuid, ${dto.resolution}::text,
      ${JSON.stringify(causalParentIds)}::jsonb
    ) as canonical_event_id`)
        : await this.databaseService.database.execute<{
            canonical_event_id: string;
          }>(sql`select resolve_match_event_candidate(
      ${reviewId}::uuid, ${matchId}::uuid, ${userId}::text,
      ${operationId}::uuid, ${dto.resolution}::text,
      ${JSON.stringify(causalParentIds)}::jsonb
    ) as canonical_event_id`);
    await this.refreshProjection(matchId);
    await this.syncCompletedCompetitionFixture(
      teamId,
      match,
      event.status,
      true,
    );
    const [updatedReview] = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(eq(matchEventReviews.id, reviewId))
      .limit(1);
    return {
      ...updatedReview,
      canonicalEventId: result.rows[0].canonical_event_id,
    };
  }

  private async separateReviewObservations(
    teamId: string,
    match: typeof matches.$inferSelect,
    event: typeof events.$inferSelect,
    review: typeof matchEventReviews.$inferSelect,
    matchId: string,
  ): Promise<boolean> {
    const observations = await this.databaseService.database
      .select({ observation: matchEventObservations })
      .from(matchEventObservations)
      .innerJoin(
        matchEventMemberships,
        eq(matchEventMemberships.observationId, matchEventObservations.id),
      )
      .where(
        eq(matchEventMemberships.canonicalEventId, review.canonicalEventId),
      )
      .orderBy(asc(matchEventObservations.id));
    const laterObservations = observations
      .slice(1)
      .map(({ observation }) => observation);
    const additionalGoals = laterObservations.filter(
      (observation) => observation.eventType === 'goal',
    );
    if (event.status === 'completed' && additionalGoals.length > 0) {
      await this.validateSeparatedGoalScore(teamId, match, additionalGoals);
    }
    for (const observation of laterObservations) {
      await this.createSeparatedObservation(matchId, observation);
    }
    return additionalGoals.length > 0;
  }

  private async validateSeparatedGoalScore(
    teamId: string,
    match: typeof matches.$inferSelect,
    goals: Array<typeof matchEventObservations.$inferSelect>,
  ): Promise<void> {
    const current = await this.buildCompetitionFixtureResult(teamId, match);
    if (!current) return;
    let projected = current.result;
    for (const observation of goals) {
      projected = this.adjustFixtureScore(
        projected,
        match.isHome,
        observation.team,
        1,
      );
    }
    await validateFixtureResult(
      this.databaseService,
      current.competitionId,
      {
        kind: 'live',
        id: match.id,
        sessionId: twoSidedLiveLoggingEnabled()
          ? (match.sharedMatchId ?? undefined)
          : undefined,
      },
      projected,
    );
  }

  private async createSeparatedObservation(
    matchId: string,
    observation: typeof matchEventObservations.$inferSelect,
  ): Promise<void> {
    const data = observation.payload as CreateMatchLogEventDto & {
      period: string;
      matchElapsedMs: number;
    };
    await this.databaseService.database
      .insert(matchEvents)
      .values({
        id: observation.id,
        matchId,
        athleteId: observation.athleteId,
        team: observation.team,
        opponentLabel: observation.opponentLabel,
        opponentPlayerId: observation.opponentPlayerId,
        eventType: observation.eventType,
        minute: Math.floor(observation.matchElapsedMs / 60_000),
        detail: typeof data.detail === 'string' ? data.detail : null,
        loggedByUserId: observation.loggedByUserId,
        clientRequestId: observation.id,
        period: observation.period,
        matchElapsedMs: observation.matchElapsedMs,
        structuredPayload: observation.payload,
      })
      .onConflictDoNothing({ target: matchEvents.id });
    await this.databaseService.database
      .update(matchEventMemberships)
      .set({ canonicalEventId: observation.id })
      .where(eq(matchEventMemberships.observationId, observation.id));
  }

  async updateEvent(
    userId: string,
    matchId: string,
    eventId: string,
    dto: UpdateMatchLogEventDto,
    operationId: string = randomUUID(),
    causalParentIds: string[] = [],
  ) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    const previous = await this.findOperation(operationId);
    if (previous) {
      this.assertSameOperation(previous, userId, matchId, eventId, 'correct', {
        replacement: dto,
      });
      await this.refreshProjection(matchId);
      return this.requireMatchEvent(matchId, eventId);
    }
    this.assertEditable(event.status);
    const logged = await this.requireMatchEvent(matchId, eventId);

    if (dto.athleteId) {
      await this.requireMatchAthlete(match.id, dto.athleteId);
    }
    this.validateEventAttribution(
      logged.team,
      dto.eventType ?? logged.eventType,
      dto.athleteId === undefined ? logged.athleteId : dto.athleteId,
      dto.opponentPlayerId === undefined
        ? logged.opponentPlayerId
        : dto.opponentPlayerId,
      dto.opponentLabel === undefined
        ? logged.opponentLabel
        : dto.opponentLabel,
    );
    await this.validateSubstitution(
      match.id,
      logged.team,
      dto.eventType ?? logged.eventType,
      dto.detail === undefined ? logged.detail : dto.detail,
    );

    const attribution = await this.resolveOpponentAttribution(match, {
      team: logged.team,
      opponentPlayerId: dto.opponentPlayerId,
      opponentLabel: dto.opponentLabel,
    });
    await this.validateGoalkeeperSave(
      match.id,
      logged.team,
      dto.eventType ?? logged.eventType,
      dto.athleteId === undefined ? logged.athleteId : dto.athleteId,
      attribution.opponentPlayerId !== undefined
        ? attribution.opponentPlayerId
        : dto.opponentPlayerId === undefined
          ? logged.opponentPlayerId
          : dto.opponentPlayerId,
    );

    let goalDelta = 0;
    if (event.status === 'completed' && logged.lifecycleStatus !== 'voided') {
      const previousIsGoal = logged.eventType === 'goal';
      const nextIsGoal = (dto.eventType ?? logged.eventType) === 'goal';
      goalDelta = Number(nextIsGoal) - Number(previousIsGoal);
      if (goalDelta !== 0) {
        const current = await this.buildCompetitionFixtureResult(
          team.id,
          match,
        );
        if (current) {
          const projected = this.adjustFixtureScore(
            current.result,
            match.isHome,
            logged.team,
            goalDelta,
          );
          await validateFixtureResult(
            this.databaseService,
            current.competitionId,
            {
              kind: 'live',
              id: match.id,
              sessionId: twoSidedLiveLoggingEnabled()
                ? (match.sharedMatchId ?? undefined)
                : undefined,
            },
            projected,
          );
        }
      }
    }

    await this.applyEventMutation({
      id: operationId,
      matchId,
      actorUserId: userId,
      operationType: 'correct',
      canonicalEventId: eventId,
      decision: { replacement: dto },
      effective: {
        ...dto,
        ...(attribution.opponentLabel !== undefined
          ? { opponentLabel: attribution.opponentLabel }
          : {}),
        ...(attribution.opponentPlayerId !== undefined
          ? { opponentPlayerId: attribution.opponentPlayerId }
          : {}),
      },
      causalParentIds,
    });
    const updated = await this.requireMatchEvent(matchId, eventId);
    await this.syncCompletedCompetitionFixture(
      team.id,
      match,
      event.status,
      goalDelta !== 0,
    );
    return updated;
  }

  async submitCorrectionOperation(
    userId: string,
    matchId: string,
    eventId: string,
    dto: UpdateMatchLogEventDto,
    operationId: string,
    causalParentIds: string[] = [],
  ) {
    const team = await this.requireTeam(userId);
    const previous = await this.findOperation(operationId);
    if (previous) {
      this.assertSameOperation(
        previous,
        userId,
        matchId,
        eventId,
        team.role === 'coach' ? 'correct' : 'propose_correction',
        { replacement: dto },
      );
      await this.refreshProjection(matchId);
      return this.requireMatchEvent(matchId, eventId);
    }
    if (team.role === 'coach') {
      return this.updateEvent(
        userId,
        matchId,
        eventId,
        dto,
        operationId,
        causalParentIds,
      );
    }
    const { event, match } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    this.assertEditable(event.status);
    const canonical = await this.requireMatchEvent(matchId, eventId);
    await this.applyEventMutation({
      id: operationId,
      matchId,
      actorUserId: userId,
      operationType: 'propose_correction',
      canonicalEventId: eventId,
      decision: { replacement: dto },
      causalParentIds,
    });
    return canonical;
  }

  async deleteEvent(
    userId: string,
    matchId: string,
    eventId: string,
    operationId: string = randomUUID(),
    causalParentIds: string[] = [],
    reason?: string,
  ) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    const previous = await this.findOperation(operationId);
    if (previous) {
      this.assertSameOperation(previous, userId, matchId, eventId, 'void', {
        lifecycleStatus: 'voided',
      });
      await this.refreshProjection(matchId);
      return this.requireMatchEvent(matchId, eventId);
    }
    this.assertEditable(event.status);
    const logged = await this.requireMatchEvent(matchId, eventId);

    const changesScore =
      event.status === 'completed' &&
      logged.lifecycleStatus !== 'voided' &&
      logged.eventType === 'goal';
    if (changesScore) {
      const current = await this.buildCompetitionFixtureResult(team.id, match);
      if (current) {
        const projected = this.adjustFixtureScore(
          current.result,
          match.isHome,
          logged.team,
          -1,
        );
        await validateFixtureResult(
          this.databaseService,
          current.competitionId,
          {
            kind: 'live',
            id: match.id,
            sessionId: twoSidedLiveLoggingEnabled()
              ? (match.sharedMatchId ?? undefined)
              : undefined,
          },
          projected,
        );
      }
    }

    await this.applyEventMutation({
      id: operationId,
      matchId,
      actorUserId: userId,
      operationType: 'void',
      canonicalEventId: eventId,
      decision: { lifecycleStatus: 'voided' },
      causalParentIds,
      reason,
    });
    const deleted = await this.requireMatchEvent(matchId, eventId);
    await this.syncCompletedCompetitionFixture(
      team.id,
      match,
      event.status,
      changesScore,
    );
    return deleted;
  }

  async finish(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    this.assertLive(event.status);

    const [finishedMatch] = await this.databaseService.database
      .update(matches)
      .set({
        clockPeriod: 'full_time',
        clockStartedAt: null,
        clockElapsedMs: sql<number>`case
          when ${matches.clockStartedAt} is null then ${matches.clockElapsedMs}
          else ${matches.clockElapsedMs} + floor(extract(epoch from (now() - ${matches.clockStartedAt})) * 1000)::int
        end`,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, match.id))
      .returning();

    const [updated] = await this.databaseService.database
      .update(events)
      .set({
        status: 'completed',
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, event.id), eq(events.teamId, team.id)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Match not found.');
    }

    if (!finishedMatch) {
      throw new NotFoundException('Match not found.');
    }
    await this.refreshProjection(matchId);
    return this.findOne(userId, matchId);
  }

  async updateClock(userId: string, matchId: string, dto: UpdateMatchClockDto) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    this.assertLive(event.status);
    const operationId = dto.operationId ?? randomUUID();
    const clientCreatedAt = dto.clientCreatedAt ?? new Date().toISOString();
    const baseRevision = dto.baseRevision ?? match.clockRevision;
    const payloadHash = createHash('sha256')
      .update(
        JSON.stringify({
          matchId,
          period: dto.period,
          elapsedMs: dto.elapsedMs,
          running: dto.running,
          baseRevision,
          clientCreatedAt,
        }),
      )
      .digest('hex');
    try {
      await this.databaseService.database.execute(sql`
      select * from apply_match_clock_operation(
        ${operationId}::uuid,
        ${matchId}::uuid,
        ${userId}::text,
        ${dto.period}::text,
        ${dto.elapsedMs}::integer,
        ${dto.running}::boolean,
        ${baseRevision}::integer,
        ${payloadHash}::text,
        ${clientCreatedAt}::timestamptz
      )
      `);
    } catch (error) {
      const databaseError: unknown =
        (error as { cause?: { code?: string; message?: string } }).cause ??
        error;
      if (
        (databaseError as { code?: string }).code === '22000' &&
        (databaseError as Error).message ===
          'clock operation id reused with different data'
      ) {
        throw new ConflictException({
          code: 'MATCH_CLOCK_OPERATION_ID_REUSED',
          message:
            'This clock operation ID was already used with different data.',
        });
      }
      throw error;
    }
    return this.findOne(userId, matchId);
  }

  async listClockOperations(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireSharedMatch(team.id, matchId);
    return this.databaseService.database
      .select()
      .from(matchClockOperations)
      .where(eq(matchClockOperations.matchId, matchId))
      .orderBy(desc(matchClockOperations.createdAt))
      .limit(200);
  }

  async finaliseProjection(
    userId: string,
    matchId: string,
    expectedRevision: number,
  ) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const { event, match } = await this.requireMatch(team.id, matchId);
    if (!twoSidedLiveLoggingEnabled() && event.competitionFixtureId) {
      const publicationIdentity = await resolveMatchSessionIdentity(
        this.databaseService,
        event,
        match,
        { ignoreFeatureFlag: true },
      );
      if (publicationIdentity.fixtureSharedSessionId)
        throw sharedMatchConflict('SHARED_MATCH_SESSION_REQUIRED');
    }
    const identity = await resolveMatchSessionIdentity(
      this.databaseService,
      event,
      match,
    );
    assertMatchSessionIdentity(identity);
    if (event.status !== 'completed') {
      throw new BadRequestException(
        'Finish the match before finalising the result.',
      );
    }
    const projection = await this.refreshProjection(matchId);
    if (projection.revision !== expectedRevision) {
      throw new BadRequestException(
        `Projection changed; expected revision ${expectedRevision} but found ${projection.revision}.`,
      );
    }
    if (projection.unresolvedReviewCount > 0) {
      throw new BadRequestException(
        'Resolve all event reviews before finalising the result.',
      );
    }
    if (match.sharedMatchId && twoSidedLiveLoggingEnabled()) {
      return this.confirmSessionResult(
        userId,
        team.id,
        match,
        expectedRevision,
      );
    }
    const fixtureContext = await this.buildCompetitionFixtureResult(
      team.id,
      match,
    );
    if (fixtureContext) {
      await validateFixtureResult(
        this.databaseService,
        fixtureContext.competitionId,
        { kind: 'live', id: match.id },
        fixtureContext.result,
      );
    }
    const result = await this.databaseService.database.execute<{
      finalised: boolean;
    }>(sql`select finalise_match_projection(
      ${matchId}::uuid, ${expectedRevision}::integer, ${userId}::text
    ) as finalised`);
    if (!result.rows[0]?.finalised) {
      throw new BadRequestException(
        'Projection changed; refresh before finalising.',
      );
    }
    if (fixtureContext) {
      await syncFixtureResult(
        this.databaseService,
        fixtureContext.competitionId,
        { kind: 'live', id: match.id },
        fixtureContext.result,
      );
    }
    await this.recordOperation({
      id: randomUUID(),
      matchId,
      actorUserId: userId,
      operationType: 'finalise',
      targetObservationIds: [],
      decision: { projectionRevision: expectedRevision },
    });
    const [finalised] = await this.databaseService.database
      .select()
      .from(matchProjectionState)
      .where(eq(matchProjectionState.matchId, matchId))
      .limit(1);
    // Fire-and-forget: insight generation must never delay or fail
    // finalisation. InsightsService.generateForMatch always resolves (never
    // rejects) by writing a failed row internally, so this catch is a
    // last-resort log, not the primary error handling.
    void this.insightsService
      .generateForMatch(matchId, { projectionRevision: finalised.revision })
      .catch((error: unknown) =>
        this.logger.warn(
          `Insight generation failed for match ${matchId}: ${String(error)}`,
        ),
      );
    return finalised;
  }

  private async confirmSessionResult(
    userId: string,
    teamId: string,
    match: typeof matches.$inferSelect,
    expectedRevision: number,
  ) {
    const projection = await this.refreshProjection(match.id);
    if (projection.revision !== expectedRevision) {
      throw new BadRequestException(
        'Projection changed; refresh before confirming.',
      );
    }
    if (projection.unresolvedReviewCount > 0) {
      throw new BadRequestException(
        'Resolve all event reviews before confirming the result.',
      );
    }
    const [participant] = await this.databaseService.database
      .select()
      .from(matchSessionParticipants)
      .where(
        and(
          eq(matchSessionParticipants.sessionId, match.sharedMatchId!),
          eq(matchSessionParticipants.teamId, teamId),
        ),
      )
      .limit(1);
    if (!participant) throw new NotFoundException('Match session not found.');
    const blocked = await this.databaseService.database.execute<{
      blocked: boolean;
    }>(
      sql`select exists(select 1 from match_event_reviews where session_id = ${match.sharedMatchId}::uuid and (status = 'open' or disputed_at is not null)) as blocked`,
    );
    if (blocked.rows[0]?.blocked)
      throw sharedMatchConflict('SHARED_MATCH_RESULT_NOT_FINALISED');
    const now = new Date();
    await this.databaseService.database
      .update(matchSessionParticipants)
      .set({ confirmationState: 'confirmed', updatedAt: now })
      .where(eq(matchSessionParticipants.id, participant.id));
    await this.databaseService.database
      .update(matchSessions)
      .set(
        participant.side === 'home'
          ? {
              homeConfirmedAt: sql`coalesce(${matchSessions.homeConfirmedAt}, ${now})`,
              homeConfirmedByUserId: sql`coalesce(${matchSessions.homeConfirmedByUserId}, ${userId})`,
              updatedAt: now,
            }
          : {
              awayConfirmedAt: sql`coalesce(${matchSessions.awayConfirmedAt}, ${now})`,
              awayConfirmedByUserId: sql`coalesce(${matchSessions.awayConfirmedByUserId}, ${userId})`,
              updatedAt: now,
            },
      )
      .where(eq(matchSessions.id, match.sharedMatchId!));
    const [session] = await this.databaseService.database
      .select()
      .from(matchSessions)
      .where(eq(matchSessions.id, match.sharedMatchId!))
      .limit(1);
    if (!shouldFinaliseSession(session, now)) {
      return { ...session, confirmed: true, finalised: false };
    }
    const finalisedResult = await this.databaseService.database.execute<{
      finalised: boolean;
    }>(sql`
      select finalise_match_projection(${match.id}::uuid, ${expectedRevision}::integer, ${userId}::text) as finalised`);
    if (!finalisedResult.rows[0]?.finalised) {
      throw new BadRequestException(
        'Projection changed; refresh before finalising.',
      );
    }
    await this.databaseService.database
      .update(matchSessions)
      .set({ finalisedAt: now, finalisedByUserId: userId, updatedAt: now })
      .where(
        and(
          eq(matchSessions.id, match.sharedMatchId!),
          sql`${matchSessions.finalisedAt} is null`,
        ),
      );
    const fixtureContext = await this.buildCompetitionFixtureResult(
      teamId,
      match,
    );
    if (fixtureContext) {
      await syncFixtureResult(
        this.databaseService,
        fixtureContext.competitionId,
        { kind: 'live', id: match.id, sessionId: match.sharedMatchId! },
        fixtureContext.result,
      );
    }
    return { ...session, finalisedAt: now, finalised: true };
  }

  async reopenProjection(userId: string, matchId: string, reason: string) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    assertMatchSessionIdentity(
      await resolveMatchSessionIdentity(this.databaseService, event, match),
    );
    if (match.sharedMatchId && twoSidedLiveLoggingEnabled()) {
      const [session] = await this.databaseService.database
        .select()
        .from(matchSessions)
        .where(eq(matchSessions.id, match.sharedMatchId))
        .limit(1);
      if (!session || session.finalisedAt) {
        throw new BadRequestException(
          'A final session result cannot be reopened.',
        );
      }
      await this.databaseService.database
        .update(matchSessionParticipants)
        .set({ confirmationState: 'pending', updatedAt: new Date() })
        .where(eq(matchSessionParticipants.sessionId, match.sharedMatchId));
      await this.databaseService.database
        .update(matchSessions)
        .set({
          homeConfirmedAt: null,
          homeConfirmedByUserId: null,
          awayConfirmedAt: null,
          awayConfirmedByUserId: null,
          updatedAt: new Date(),
        })
        .where(eq(matchSessions.id, match.sharedMatchId));
    }
    const [reopened] = await this.databaseService.database
      .update(matchProjectionState)
      .set({
        finalisationState: 'open',
        finalisedByUserId: null,
        finalisedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(matchProjectionState.matchId, matchId))
      .returning();
    if (!reopened) throw new NotFoundException('Projection not found.');
    await this.recordOperation({
      id: randomUUID(),
      matchId,
      actorUserId: userId,
      operationType: 'reopen',
      targetObservationIds: [],
      decision: { reason },
      reason,
    });
    // Cheap flag update, no LLM call — the next finalise regenerates.
    await this.insightsService.markStale(matchId);
    return reopened;
  }

  private async observationIdsForCanonical(canonicalEventId: string) {
    const rows = await this.databaseService.database
      .select({ id: matchEventMemberships.observationId })
      .from(matchEventMemberships)
      .where(eq(matchEventMemberships.canonicalEventId, canonicalEventId))
      .orderBy(asc(matchEventMemberships.observationId));
    return rows.map((row) => row.id);
  }

  async listEventOperations(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { event } = await this.requireSharedMatch(team.id, matchId);
    const peer = event.teamId !== team.id;
    const operations = await this.databaseService.database
      .select()
      .from(matchEventOperations)
      .where(
        and(
          eq(matchEventOperations.matchId, matchId),
          peer
            ? sql`${matchEventOperations.operationType} in ('merge', 'separate')`
            : undefined,
          peer
            ? sql`${matchEventOperations.canonicalEventId} in (select id from match_events where event_type <> 'injury')`
            : undefined,
        ),
      )
      .orderBy(asc(matchEventOperations.id))
      .limit(500);
    return peer
      ? operations.map((operation) => ({ ...operation, reason: null }))
      : operations;
  }

  private async findOperation(operationId: string) {
    const [operation] = await this.databaseService.database
      .select()
      .from(matchEventOperations)
      .where(eq(matchEventOperations.id, operationId))
      .limit(1);
    return operation;
  }

  private assertSameOperation(
    previous: typeof matchEventOperations.$inferSelect,
    userId: string,
    matchId: string,
    eventId: string,
    operationType: string,
    decision: Record<string, unknown>,
  ) {
    if (
      previous.actorUserId !== userId ||
      previous.matchId !== matchId ||
      previous.canonicalEventId !== eventId ||
      previous.operationType !== operationType ||
      stableStringify(previous.decision) !== stableStringify(decision)
    ) {
      throw new BadRequestException('This offline operation ID was reused.');
    }
  }

  async canonicalEventIdForObservation(matchId: string, observationId: string) {
    const [membership] = await this.databaseService.database
      .select({ canonicalEventId: matchEventMemberships.canonicalEventId })
      .from(matchEventMemberships)
      .innerJoin(
        matchEvents,
        eq(matchEvents.id, matchEventMemberships.canonicalEventId),
      )
      .where(
        and(
          eq(matchEventMemberships.observationId, observationId),
          eq(matchEvents.matchId, matchId),
        ),
      )
      .limit(1);
    if (!membership) {
      throw new NotFoundException('Canonical event membership not found.');
    }
    return membership.canonicalEventId;
  }

  private async requireCanonicalEventForObservation(
    matchId: string,
    observationId: string,
  ) {
    const [logged] = await this.databaseService.database
      .select({ event: matchEvents })
      .from(matchEventMemberships)
      .innerJoin(
        matchEvents,
        eq(matchEvents.id, matchEventMemberships.canonicalEventId),
      )
      .where(
        and(
          eq(matchEventMemberships.observationId, observationId),
          eq(matchEvents.matchId, matchId),
        ),
      )
      .limit(1);
    if (!logged) {
      throw new NotFoundException('Canonical event membership not found.');
    }
    return logged.event;
  }

  private async recordOperation(input: {
    id: string;
    matchId: string;
    actorUserId: string;
    operationType: string;
    targetObservationIds: string[];
    canonicalEventId?: string | null;
    causalParentIds?: string[];
    decision: Record<string, unknown>;
    reason?: string | null;
  }) {
    await this.databaseService.database
      .insert(matchEventOperations)
      .values({
        ...input,
        canonicalEventId: input.canonicalEventId ?? null,
        causalParentIds: input.causalParentIds ?? [],
        reason: input.reason ?? null,
      })
      .onConflictDoNothing({ target: matchEventOperations.id });
  }

  private async applyEventMutation(input: {
    id: string;
    matchId: string;
    actorUserId: string;
    canonicalEventId: string;
    operationType: 'correct' | 'propose_correction' | 'void';
    decision: Record<string, unknown>;
    effective?: Record<string, unknown>;
    causalParentIds: string[];
    reason?: string;
  }) {
    await this.databaseService.database.execute(sql`
      select apply_match_event_mutation(
        ${input.id}::uuid, ${input.matchId}::uuid,
        ${input.actorUserId}::text, ${input.canonicalEventId}::uuid,
        ${input.operationType}::text, ${JSON.stringify(input.decision)}::jsonb,
        ${JSON.stringify(input.effective ?? {})}::jsonb,
        ${JSON.stringify(input.causalParentIds)}::jsonb,
        ${input.reason ?? null}::text
      )
    `);
  }

  private async refreshProjection(matchId: string) {
    await this.databaseService.database.execute(
      sql`select refresh_match_projection(${matchId}::uuid)`,
    );
    const [projection] = await this.databaseService.database
      .select()
      .from(matchProjectionState)
      .where(eq(matchProjectionState.matchId, matchId))
      .limit(1);
    if (!projection) {
      throw new ServiceUnavailableException(
        'Could not refresh the match result.',
      );
    }
    return projection;
  }

  private async buildCompetitionFixtureResult(
    teamId: string,
    match: typeof matches.$inferSelect,
  ): Promise<{
    competitionId: string;
    result: {
      homeCompetitionTeamId: string;
      awayCompetitionTeamId: string;
      homeScore: number;
      awayScore: number;
    };
  } | null> {
    if (!match.competitionId || !match.opponentCompetitionTeamId) return null;
    const sharedResult = Boolean(
      match.sharedMatchId && twoSidedLiveLoggingEnabled(),
    );

    const [[ownParticipant], [score], [fixture]] = await Promise.all([
      this.databaseService.database
        .select({ id: competitionTeams.id })
        .from(competitionTeams)
        .where(
          and(
            eq(competitionTeams.competitionId, match.competitionId),
            eq(competitionTeams.teamId, teamId),
          ),
        )
        .limit(1),
      this.databaseService.database
        .select({
          teamScore: sharedResult
            ? sql<number>`count(*) filter (where ${matchEvents.side} = 'home' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`
            : sql<number>`count(*) filter (where ${matchEvents.team} = 'own' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`,
          opponentScore: sharedResult
            ? sql<number>`count(*) filter (where ${matchEvents.side} = 'away' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`
            : sql<number>`count(*) filter (where ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`,
        })
        .from(matchEvents)
        .where(
          sharedResult
            ? eq(matchEvents.sessionId, match.sharedMatchId!)
            : eq(matchEvents.matchId, match.id),
        ),
      match.sharedMatchId
        ? this.databaseService.database
            .select({
              homeCompetitionTeamId: competitionFixtures.homeCompetitionTeamId,
              awayCompetitionTeamId: competitionFixtures.awayCompetitionTeamId,
            })
            .from(competitionFixtures)
            .where(eq(competitionFixtures.sharedSessionId, match.sharedMatchId))
            .limit(1)
        : Promise.resolve([]),
    ]);
    if (!ownParticipant) return null;

    const teamScore = score?.teamScore ?? 0;
    const opponentScore = score?.opponentScore ?? 0;
    const ownTeamIsHome = fixture
      ? fixture.homeCompetitionTeamId === ownParticipant.id
      : match.isHome;
    return {
      competitionId: match.competitionId,
      result: {
        homeCompetitionTeamId:
          fixture?.homeCompetitionTeamId ??
          (ownTeamIsHome ? ownParticipant.id : match.opponentCompetitionTeamId),
        awayCompetitionTeamId:
          fixture?.awayCompetitionTeamId ??
          (ownTeamIsHome ? match.opponentCompetitionTeamId : ownParticipant.id),
        homeScore: sharedResult || ownTeamIsHome ? teamScore : opponentScore,
        awayScore: sharedResult || ownTeamIsHome ? opponentScore : teamScore,
      },
    };
  }

  private adjustFixtureScore(
    result: {
      homeCompetitionTeamId: string;
      awayCompetitionTeamId: string;
      homeScore: number;
      awayScore: number;
    },
    ownTeamIsHome: boolean,
    eventTeam: 'own' | 'opponent',
    delta: number,
  ) {
    const changesHome = eventTeam === (ownTeamIsHome ? 'own' : 'opponent');
    return {
      ...result,
      homeScore: result.homeScore + (changesHome ? delta : 0),
      awayScore: result.awayScore + (changesHome ? 0 : delta),
    };
  }

  private async syncCompletedCompetitionFixture(
    teamId: string,
    match: typeof matches.$inferSelect,
    eventStatus: string,
    scoreMayHaveChanged: boolean,
  ) {
    if (eventStatus !== 'completed' || !scoreMayHaveChanged) return;
    const projection = await this.refreshProjection(match.id);
    if (
      projection.finalisationState !== 'finalised' ||
      projection.unresolvedReviewCount > 0
    )
      return;
    const fixtureContext = await this.buildCompetitionFixtureResult(
      teamId,
      match,
    );
    if (!fixtureContext) return;
    await syncFixtureResult(
      this.databaseService,
      fixtureContext.competitionId,
      {
        kind: 'live',
        id: match.id,
        sessionId: twoSidedLiveLoggingEnabled()
          ? (match.sharedMatchId ?? undefined)
          : undefined,
      },
      fixtureContext.result,
    );
  }

  private async listOpponentPlayers(matchId: string) {
    return this.databaseService.database
      .select({
        id: opponentMatchPlayers.id,
        shirtNumber: opponentMatchPlayers.shirtNumber,
        name: opponentMatchPlayers.name,
        position: opponentMatchPlayers.position,
      })
      .from(opponentMatchPlayers)
      .where(eq(opponentMatchPlayers.matchId, matchId))
      .orderBy(asc(opponentMatchPlayers.shirtNumber));
  }

  private async resolveOpponentAttribution(
    match: typeof matches.$inferSelect,
    dto: {
      team: 'own' | 'opponent';
      opponentPlayerId?: string | null;
      opponentLabel?: string | null;
    },
  ): Promise<{
    opponentPlayerId?: string | null;
    opponentLabel?: string | null;
  }> {
    if (dto.opponentPlayerId === undefined) {
      return { opponentLabel: dto.opponentLabel };
    }

    if (dto.opponentPlayerId === null) {
      return {
        opponentPlayerId: null,
        opponentLabel: dto.opponentLabel,
      };
    }

    if (dto.team !== 'opponent') {
      throw new BadRequestException(
        'Opponent players can only be set on opponent events.',
      );
    }

    if (match.opponentSquadVisibility === 'none') {
      throw new BadRequestException('This match has no opponent squad.');
    }

    const player = await this.requireOpponentPlayer(
      match.id,
      dto.opponentPlayerId,
    );

    return {
      opponentPlayerId: player.id,
      opponentLabel:
        dto.opponentLabel !== undefined && dto.opponentLabel !== null
          ? dto.opponentLabel
          : this.opponentPlayerLabel(player),
    };
  }

  private opponentPlayerLabel(player: {
    shirtNumber: number;
    name: string | null;
  }) {
    if (player.name) {
      return `Opponent #${player.shirtNumber} ${player.name}`;
    }
    return `Opponent #${player.shirtNumber}`;
  }

  private async requireOpponentPlayer(matchId: string, playerId: string) {
    const [player] = await this.databaseService.database
      .select({
        id: opponentMatchPlayers.id,
        shirtNumber: opponentMatchPlayers.shirtNumber,
        name: opponentMatchPlayers.name,
      })
      .from(opponentMatchPlayers)
      .where(
        and(
          eq(opponentMatchPlayers.id, playerId),
          eq(opponentMatchPlayers.matchId, matchId),
        ),
      )
      .limit(1);

    if (!player) {
      throw new BadRequestException(
        'Opponent player is not on this match squad.',
      );
    }

    return player;
  }

  private async requireTeam(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);
    if (!team) {
      throw new ForbiddenException('No team associated with this account.');
    }
    return team;
  }

  private async requireMatch(teamId: string, matchId: string) {
    const [row] = await this.databaseService.database
      .select({ match: matches, event: events })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(and(eq(matches.id, matchId), eq(events.teamId, teamId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Match not found.');
    }

    return row;
  }

  /**
   * Shared read endpoints may address either team's match sheet once a
   * canonical session is enabled. Private sheet endpoints continue to use
   * `requireMatch`, and the feature flag off path is exactly the legacy gate.
   */
  private async requireSharedMatch(teamId: string, matchId: string) {
    if (!twoSidedLiveLoggingEnabled()) {
      return this.requireMatch(teamId, matchId);
    }

    const [row] = await this.databaseService.database
      .select({ match: matches, event: events })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!row) throw new NotFoundException('Match not found.');
    if (row.event.teamId === teamId) return row;
    if (!row.match.sharedMatchId) {
      throw new NotFoundException('Match not found.');
    }

    const [participant] = await this.databaseService.database
      .select({ id: matchSessionParticipants.id })
      .from(matchSessionParticipants)
      .where(
        and(
          eq(matchSessionParticipants.sessionId, row.match.sharedMatchId),
          eq(matchSessionParticipants.teamId, teamId),
        ),
      )
      .limit(1);
    if (!participant) throw new NotFoundException('Match not found.');
    return row;
  }

  private async requireMatchEvent(matchId: string, eventId: string) {
    const [logged] = await this.databaseService.database
      .select()
      .from(matchEvents)
      .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
      .limit(1);

    if (!logged) {
      throw new NotFoundException('Match event not found.');
    }

    return logged;
  }

  private async requireMatchAthlete(matchId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .select({ id: athletes.id })
      .from(athleteMatchStats)
      .innerJoin(athletes, eq(athleteMatchStats.athleteId, athletes.id))
      .where(
        and(
          eq(athleteMatchStats.matchId, matchId),
          eq(athleteMatchStats.athleteId, athleteId),
        ),
      )
      .limit(1);

    if (!athlete) {
      throw new BadRequestException('Athlete is not in this match squad.');
    }
  }

  private assertLive(status: string) {
    if (status !== 'scheduled') {
      throw new BadRequestException('This match is not live.');
    }
  }

  /** Completed matches stay editable (match report corrections). Cancelled matches do not. */
  private assertEditable(status: string) {
    if (status === 'cancelled') {
      throw new BadRequestException('Cancelled matches cannot be edited.');
    }
  }

  private async validateGoalkeeperSave(
    matchId: string,
    team: 'own' | 'opponent',
    eventType: string,
    athleteId: string | null,
    opponentPlayerId: string | null,
  ) {
    if (eventType !== 'goalkeeper_save') return;

    const position =
      team === 'own'
        ? await this.ownAthletePosition(matchId, athleteId)
        : await this.opponentPlayerPosition(matchId, opponentPlayerId);

    if (!isGoalkeeperPosition(position)) {
      throw new BadRequestException(
        'Goalkeeper saves can only be logged for a goalkeeper.',
      );
    }
  }

  private async ownAthletePosition(matchId: string, athleteId: string | null) {
    if (!athleteId) return null;
    const [athlete] = await this.databaseService.database
      .select({ position: athletes.position })
      .from(athletes)
      .innerJoin(
        athleteMatchStats,
        eq(athleteMatchStats.athleteId, athletes.id),
      )
      .where(
        and(eq(athletes.id, athleteId), eq(athleteMatchStats.matchId, matchId)),
      )
      .limit(1);
    return athlete?.position ?? null;
  }

  private async opponentPlayerPosition(
    matchId: string,
    opponentPlayerId: string | null,
  ) {
    if (!opponentPlayerId) return null;
    const [player] = await this.databaseService.database
      .select({ position: opponentMatchPlayers.position })
      .from(opponentMatchPlayers)
      .where(
        and(
          eq(opponentMatchPlayers.id, opponentPlayerId),
          eq(opponentMatchPlayers.matchId, matchId),
        ),
      )
      .limit(1);
    return player?.position ?? null;
  }

  private async validateSubstitution(
    matchId: string,
    team: 'own' | 'opponent',
    eventType: string,
    detail?: string | null,
  ) {
    if (eventType !== 'substitution') return;
    if (team === 'opponent' && !detail) return;
    if (!detail) {
      throw new BadRequestException('An incoming player is required.');
    }
    if (team === 'own') {
      await this.requireMatchAthlete(matchId, detail);
    } else {
      await this.requireOpponentPlayer(matchId, detail);
    }
  }

  private validateEventAttribution(
    team: 'own' | 'opponent',
    eventType: string,
    athleteId: string | null,
    opponentPlayerId: string | null,
    opponentLabel: string | null,
  ) {
    if (team === 'own' && (opponentPlayerId || opponentLabel)) {
      throw new BadRequestException(
        'Own-team events cannot reference an opponent.',
      );
    }
    if (team === 'opponent' && athleteId) {
      throw new BadRequestException(
        'Opponent events cannot reference a team athlete.',
      );
    }
    if (eventType === 'substitution') {
      if (team === 'own' && !athleteId) {
        throw new BadRequestException('An outgoing squad athlete is required.');
      }
      if (team === 'opponent' && !opponentPlayerId && !opponentLabel) {
        throw new BadRequestException(
          'An opponent label is required when no opponent squad is available.',
        );
      }
    }
  }
}
