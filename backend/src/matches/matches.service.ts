import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { projectCanonicalEvents } from '@gaffer/match-domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  competitions,
  events,
  matchEvents,
  matchEventMemberships,
  matchEventObservations,
  matchEventOperations,
  matchEventReviews,
  matchClockOperations,
  matchProjectionState,
  matches,
  opponentMatchPlayers,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateMatchLogEventDto,
  ResolveMatchEventReviewDto,
  UpdateMatchLogEventDto,
  UpdateMatchClockDto,
} from './matches.schemas';

/**
 * Live match logging. Every query is scoped to the team returned by
 * `TeamsService.findTeamForUser`; matches on other teams are treated as
 * missing (404) rather than forbidden, so existence is not leaked.
 */
@Injectable()
export class MatchesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  async findOne(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);

    let competitionName: string | null = null;
    if (match.competitionId) {
      const [competition] = await this.databaseService.database
        .select({ name: competitions.name })
        .from(competitions)
        .where(eq(competitions.id, match.competitionId))
        .limit(1);
      competitionName = competition?.name ?? null;
    }

    const opponentSquad = await this.listOpponentPlayers(match.id);
    const projection = await this.refreshProjection(match.id);

    return {
      ...match,
      teamScore: projection.provisionalTeamScore,
      opponentScore: projection.provisionalOpponentScore,
      projection,
      eventTitle: event.title,
      eventStatus: event.status,
      eventScheduledAt: event.scheduledAt,
      eventLocation: event.location,
      competitionName,
      opponentSquad,
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

  async listEvents(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);

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
          sql`${matchEvents.lifecycleStatus} <> 'voided'`,
        ),
      )
      .orderBy(desc(matchEvents.minute), desc(matchEvents.createdAt));

    return rows.map((row) => ({
      id: row.id,
      matchId: row.matchId,
      athleteId: row.athleteId,
      team: row.team,
      opponentLabel: row.opponentLabel,
      opponentPlayerId: row.opponentPlayerId,
      eventType: row.eventType,
      minute: row.minute,
      detail: row.detail,
      loggedByUserId: row.loggedByUserId,
      manuallyAdjusted: row.manuallyAdjusted,
      clientRequestId: row.clientRequestId,
      period: row.period,
      matchElapsedMs: row.matchElapsedMs,
      lifecycleStatus: row.lifecycleStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      athlete:
        row.athleteId && row.athleteFirstName && row.athleteLastName
          ? {
              id: row.athleteId,
              firstName: row.athleteFirstName,
              lastName: row.athleteLastName,
              squadNumber: row.athleteSquadNumber,
              position: row.athletePosition,
            }
          : null,
      opponentPlayer:
        row.opponentPlayerId && row.opponentPlayerShirtNumber != null
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

    if (process.env.OFFLINE_RECONCILIATION_FUNCTION !== 'disabled') {
      const persistedResult = await this.databaseService.database.execute<{
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
        throw new BadRequestException(
          'Could not persist the match observation.',
        );
      }
      return this.requireCanonicalEventForObservation(
        match.id,
        dto.clientRequestId,
      );
    }

    const [insertedObservation] = await this.databaseService.database
      .insert(matchEventObservations)
      .values({
        id: dto.clientRequestId,
        matchId: match.id,
        deviceId: dto.deviceId ?? dto.clientRequestId,
        loggedByUserId: userId,
        eventType: dto.eventType,
        team: dto.team,
        athleteId: dto.athleteId,
        opponentLabel,
        opponentPlayerId,
        period,
        matchElapsedMs,
        payload,
        payloadHash,
        clientCreatedAt: dto.clientCreatedAt
          ? new Date(dto.clientCreatedAt)
          : new Date(),
      })
      .onConflictDoNothing({ target: matchEventObservations.id })
      .returning();

    if (!insertedObservation) {
      const [existingObservation] = await this.databaseService.database
        .select()
        .from(matchEventObservations)
        .where(eq(matchEventObservations.id, dto.clientRequestId))
        .limit(1);
      if (
        !existingObservation ||
        existingObservation.matchId !== match.id ||
        existingObservation.payloadHash !== payloadHash
      ) {
        throw new BadRequestException(
          'This offline operation ID was already used with different data.',
        );
      }
      const [membership] = await this.databaseService.database
        .select()
        .from(matchEventMemberships)
        .where(eq(matchEventMemberships.observationId, dto.clientRequestId))
        .limit(1);
      if (membership) {
        return this.requireMatchEvent(match.id, membership.canonicalEventId);
      }
    }

    // A semantic duplicate has a different operation ID, so ordinary database
    // uniqueness cannot detect it. Attach close, equivalent observations to one
    // canonical event and open an explicit coach review.
    const [candidate] = await this.databaseService.database
      .select({ canonicalEventId: matchEventMemberships.canonicalEventId })
      .from(matchEventObservations)
      .innerJoin(
        matchEventMemberships,
        eq(matchEventMemberships.observationId, matchEventObservations.id),
      )
      .where(
        sql`
        ${matchEventObservations.matchId} = ${match.id}
        and ${matchEventObservations.id} <> ${dto.clientRequestId}
        and ${matchEventObservations.period} = ${period}
        and ${matchEventObservations.eventType} = ${dto.eventType}
        and ${matchEventObservations.team} = ${dto.team}
        and ${matchEventObservations.athleteId} is not distinct from ${dto.athleteId ?? null}
        and ${matchEventObservations.opponentPlayerId} is not distinct from ${opponentPlayerId}
        and ${matchEventObservations.opponentLabel} is not distinct from ${opponentLabel}
        and abs(${matchEventObservations.matchElapsedMs} - ${matchElapsedMs}) <= 5000
      `,
      )
      .orderBy(asc(matchEventMemberships.canonicalEventId))
      .limit(1);

    if (candidate) {
      const currentBecomesAnchor =
        dto.clientRequestId.localeCompare(candidate.canonicalEventId) < 0;
      if (currentBecomesAnchor) {
        await this.databaseService.database.insert(matchEvents).values({
          id: dto.clientRequestId,
          matchId: match.id,
          athleteId: dto.athleteId,
          team: dto.team,
          opponentLabel,
          opponentPlayerId,
          eventType: dto.eventType,
          minute: dto.minute,
          detail: dto.detail,
          loggedByUserId: userId,
          clientRequestId: dto.clientRequestId,
          manuallyAdjusted: event.status === 'completed',
          period,
          matchElapsedMs,
          structuredPayload: payload,
          lifecycleStatus: 'needs_review',
        });
      }
      const canonicalEventId = currentBecomesAnchor
        ? dto.clientRequestId
        : candidate.canonicalEventId;
      await this.databaseService.database
        .insert(matchEventMemberships)
        .values({
          observationId: dto.clientRequestId,
          canonicalEventId,
        })
        .onConflictDoNothing({ target: matchEventMemberships.observationId });
      if (currentBecomesAnchor) {
        await this.databaseService.database
          .update(matchEventMemberships)
          .set({ canonicalEventId })
          .where(
            eq(
              matchEventMemberships.canonicalEventId,
              candidate.canonicalEventId,
            ),
          );
        await this.databaseService.database
          .delete(matchEvents)
          .where(eq(matchEvents.id, candidate.canonicalEventId));
      }
      await this.databaseService.database
        .update(matchEvents)
        .set({ lifecycleStatus: 'needs_review', updatedAt: new Date() })
        .where(eq(matchEvents.id, canonicalEventId));
      await this.databaseService.database
        .insert(matchEventReviews)
        .values({
          matchId: match.id,
          canonicalEventId,
          reason: 'possible_duplicate',
        })
        .onConflictDoNothing();
      return this.requireMatchEvent(match.id, canonicalEventId);
    }

    const [created] = await this.databaseService.database
      .insert(matchEvents)
      .values({
        id: dto.clientRequestId,
        matchId: match.id,
        athleteId: dto.athleteId,
        team: dto.team,
        opponentLabel,
        opponentPlayerId,
        eventType: dto.eventType,
        minute: dto.minute,
        detail: dto.detail,
        loggedByUserId: userId,
        clientRequestId: dto.clientRequestId,
        manuallyAdjusted: event.status === 'completed',
        period,
        matchElapsedMs,
        structuredPayload: payload,
      })
      .onConflictDoNothing({ target: matchEvents.id })
      .returning();
    const canonical =
      created ?? (await this.requireMatchEvent(match.id, dto.clientRequestId));
    await this.databaseService.database
      .insert(matchEventMemberships)
      .values({
        observationId: dto.clientRequestId,
        canonicalEventId: canonical.id,
      })
      .onConflictDoNothing({ target: matchEventMemberships.observationId });

    // Close the race where two devices inserted their memberships between the
    // first candidate lookup and this insert. The lexicographically smallest
    // client UUID is the stable anchor, independent of reconnect order.
    const [lateCandidate] = await this.databaseService.database
      .select({ canonicalEventId: matchEventMemberships.canonicalEventId })
      .from(matchEventObservations)
      .innerJoin(
        matchEventMemberships,
        eq(matchEventMemberships.observationId, matchEventObservations.id),
      )
      .where(
        sql`
        ${matchEventObservations.matchId} = ${match.id}
        and ${matchEventObservations.id} <> ${dto.clientRequestId}
        and ${matchEventObservations.period} = ${period}
        and ${matchEventObservations.eventType} = ${dto.eventType}
        and ${matchEventObservations.team} = ${dto.team}
        and ${matchEventObservations.athleteId} is not distinct from ${dto.athleteId ?? null}
        and ${matchEventObservations.opponentPlayerId} is not distinct from ${opponentPlayerId}
        and ${matchEventObservations.opponentLabel} is not distinct from ${opponentLabel}
        and abs(${matchEventObservations.matchElapsedMs} - ${matchElapsedMs}) <= 5000
      `,
      )
      .orderBy(asc(matchEventMemberships.canonicalEventId))
      .limit(1);
    if (!lateCandidate || lateCandidate.canonicalEventId === canonical.id) {
      return canonical;
    }
    const winningId = [canonical.id, lateCandidate.canonicalEventId].sort()[0];
    const losingId =
      winningId === canonical.id
        ? lateCandidate.canonicalEventId
        : canonical.id;
    await this.databaseService.database
      .update(matchEventMemberships)
      .set({ canonicalEventId: winningId })
      .where(eq(matchEventMemberships.canonicalEventId, losingId));
    await this.databaseService.database
      .delete(matchEvents)
      .where(eq(matchEvents.id, losingId));
    await this.databaseService.database
      .update(matchEvents)
      .set({ lifecycleStatus: 'needs_review', updatedAt: new Date() })
      .where(eq(matchEvents.id, winningId));
    await this.databaseService.database
      .insert(matchEventReviews)
      .values({
        matchId: match.id,
        canonicalEventId: winningId,
        reason: 'possible_duplicate',
      })
      .onConflictDoNothing();
    return this.requireMatchEvent(match.id, winningId);
  }

  async listEventReviews(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);
    const rows = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(eq(matchEventReviews.matchId, matchId))
      .orderBy(desc(matchEventReviews.createdAt));
    return Promise.all(
      rows.map(async (review) => {
        const observations = await this.databaseService.database
          .select()
          .from(matchEventObservations)
          .innerJoin(
            matchEventMemberships,
            eq(matchEventMemberships.observationId, matchEventObservations.id),
          )
          .where(
            eq(matchEventMemberships.canonicalEventId, review.canonicalEventId),
          );
        return {
          ...review,
          observations: observations.map((row) => row.match_event_observations),
        };
      }),
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
    await this.requireMatch(team.id, matchId);
    const [review] = await this.databaseService.database
      .select()
      .from(matchEventReviews)
      .where(
        and(
          eq(matchEventReviews.id, reviewId),
          eq(matchEventReviews.matchId, matchId),
          eq(matchEventReviews.status, 'open'),
        ),
      )
      .limit(1);
    if (!review) throw new NotFoundException('Open event review not found.');
    const targetObservationIds = await this.observationIdsForCanonical(
      review.canonicalEventId,
    );

    if (dto.resolution === 'separate_events') {
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
      for (const { observation } of observations.slice(1)) {
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
    }
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
      matchId,
      actorUserId: userId,
      operationType: dto.resolution === 'same_event' ? 'merge' : 'separate',
      canonicalEventId: review.canonicalEventId,
      targetObservationIds,
      decision: { reviewId, resolution: dto.resolution },
      causalParentIds,
    });
    await this.refreshProjection(matchId);
    return resolved;
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

    const [updated] = await this.databaseService.database
      .update(matchEvents)
      .set({
        ...(dto.athleteId !== undefined ? { athleteId: dto.athleteId } : {}),
        ...(attribution.opponentLabel !== undefined
          ? { opponentLabel: attribution.opponentLabel }
          : dto.opponentLabel !== undefined
            ? { opponentLabel: dto.opponentLabel }
            : {}),
        ...(attribution.opponentPlayerId !== undefined
          ? { opponentPlayerId: attribution.opponentPlayerId }
          : {}),
        ...(dto.minute !== undefined ? { minute: dto.minute } : {}),
        ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
        ...(dto.detail !== undefined ? { detail: dto.detail } : {}),
        manuallyAdjusted: event.status === 'completed' ? true : true,
        updatedAt: new Date(),
      })
      .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Match event not found.');
    }

    await this.recordOperation({
      id: operationId,
      matchId,
      actorUserId: userId,
      operationType: 'correct',
      canonicalEventId: eventId,
      targetObservationIds: await this.observationIdsForCanonical(eventId),
      decision: { replacement: dto },
      causalParentIds,
    });
    await this.refreshProjection(matchId);

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
    const { event } = await this.requireMatch(team.id, matchId);
    this.assertEditable(event.status);
    const canonical = await this.requireMatchEvent(matchId, eventId);
    await this.recordOperation({
      id: operationId,
      matchId,
      actorUserId: userId,
      operationType: 'propose_correction',
      canonicalEventId: eventId,
      targetObservationIds: await this.observationIdsForCanonical(eventId),
      decision: { replacement: dto },
      causalParentIds,
    });
    await this.databaseService.database
      .insert(matchEventReviews)
      .values({
        matchId,
        canonicalEventId: eventId,
        reason: 'assistant_proposed_correction',
      })
      .onConflictDoNothing();
    await this.databaseService.database
      .update(matchEvents)
      .set({ lifecycleStatus: 'needs_review', updatedAt: new Date() })
      .where(
        and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)),
      );
    await this.refreshProjection(matchId);
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
    const { event } = await this.requireMatch(team.id, matchId);
    this.assertEditable(event.status);

    const [deleted] = await this.databaseService.database
      .update(matchEvents)
      .set({ lifecycleStatus: 'voided', updatedAt: new Date() })
      .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
      .returning();

    if (!deleted) {
      throw new NotFoundException('Match event not found.');
    }

    await this.recordOperation({
      id: operationId,
      matchId,
      actorUserId: userId,
      operationType: 'void',
      canonicalEventId: eventId,
      targetObservationIds: await this.observationIdsForCanonical(eventId),
      decision: { lifecycleStatus: 'voided' },
      causalParentIds,
      reason,
    });
    await this.refreshProjection(matchId);

    return deleted;
  }

  async finish(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
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
    return this.findOne(userId, matchId);
  }

  async updateClock(userId: string, matchId: string, dto: UpdateMatchClockDto) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
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
    return this.findOne(userId, matchId);
  }

  async listClockOperations(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);
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
    await this.requireMatch(team.id, matchId);
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
    const [finalised] = await this.databaseService.database
      .update(matchProjectionState)
      .set({
        finalisationState: 'finalised',
        finalisedByUserId: userId,
        finalisedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(matchProjectionState.matchId, matchId))
      .returning();
    await this.recordOperation({
      id: randomUUID(),
      matchId,
      actorUserId: userId,
      operationType: 'finalise',
      targetObservationIds: [],
      decision: { projectionRevision: expectedRevision },
    });
    return finalised;
  }

  async reopenProjection(userId: string, matchId: string, reason: string) {
    const team = await this.teamsService.requireCoachTeam(userId);
    await this.requireMatch(team.id, matchId);
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

  private async refreshProjection(matchId: string) {
    const eventRows = await this.databaseService.database
      .select({
        id: matchEvents.id,
        team: matchEvents.team,
        eventType: matchEvents.eventType,
        athleteId: matchEvents.athleteId,
        lifecycleStatus: matchEvents.lifecycleStatus,
        updatedAt: matchEvents.updatedAt,
      })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId))
      .orderBy(asc(matchEvents.id));
    const openReviews = await this.databaseService.database
      .select({ id: matchEventReviews.id })
      .from(matchEventReviews)
      .where(
        and(
          eq(matchEventReviews.matchId, matchId),
          eq(matchEventReviews.status, 'open'),
        ),
      )
      .orderBy(asc(matchEventReviews.id));
    const domainProjection = projectCanonicalEvents(eventRows);
    const digestInput = {
      events: eventRows.map((event) => ({
        id: event.id,
        team: event.team,
        type: event.eventType,
        athleteId: event.athleteId,
        status: event.lifecycleStatus,
        updatedAt: event.updatedAt.toISOString(),
      })),
      openReviewIds: openReviews.map((review) => review.id),
      rulesVersion: 1,
    };
    const inputDigest = createHash('sha256')
      .update(JSON.stringify(digestInput))
      .digest('hex');
    const [existing] = await this.databaseService.database
      .select()
      .from(matchProjectionState)
      .where(eq(matchProjectionState.matchId, matchId))
      .limit(1);
    if (existing?.inputDigest === inputDigest) return existing;
    const revision = (existing?.revision ?? 0) + 1;
    const values = {
      matchId,
      revision,
      inputDigest,
      rulesVersion: 1,
      ...domainProjection,
      unresolvedReviewCount: openReviews.length,
      finalisationState:
        existing?.finalisationState === 'finalised'
          ? 'amendment_required'
          : (existing?.finalisationState ?? 'open'),
      updatedAt: new Date(),
    };
    const [projection] = await this.databaseService.database
      .insert(matchProjectionState)
      .values(values)
      .onConflictDoUpdate({
        target: matchProjectionState.matchId,
        set: values,
      })
      .returning();
    await this.databaseService.database
      .update(matchEvents)
      .set({ projectionRevision: revision })
      .where(eq(matchEvents.matchId, matchId));
    await this.databaseService.database
      .update(matchEventMemberships)
      .set({ projectionRevision: revision })
      .where(
        sql`${matchEventMemberships.canonicalEventId} in (
          select id from match_events where match_id = ${matchId}
        )`,
      );
    return projection;
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
