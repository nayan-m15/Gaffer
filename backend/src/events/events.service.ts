import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  ne,
  notInArray,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { AthletesService } from '../athletes/athletes.service';
import { DatabaseService } from '../database/database.service';
import {
  ensureCompetitionFixtureSession,
  ensureFriendlyFixtureSession,
  twoSidedLiveLoggingEnabled,
} from '../matches/match-sessions';
import {
  athleteMatchStats,
  athletes,
  competitions,
  competitionFixtures,
  competitionTeams,
  eventLineups,
  eventRsvps,
  events,
  friendlyFixtures,
  gamePlans,
  matchSessionParticipants,
  matches,
  opponentMatchPlayers,
  teams,
} from '../database/schema';
import {
  FriendlyFixturesService,
  unavailableFriendlyOpponentLineup,
} from '../friendly-fixtures/friendly-fixtures.service';
import { TeamsService } from '../teams/teams.service';
import {
  DEFAULT_FORMATION_ID,
  getFormationPlayerCount,
} from '../common/formations';
import type {
  ConfirmLineupDto,
  CreateEventDto,
  CreateRsvpDto,
  StartMatchDto,
  UpdateEventDto,
} from './events.schemas';

/**
 * CRUD for a coach's team events. Every query is scoped to the team returned
 * by `TeamsService.findTeamForUser`; events on other teams are treated as
 * missing (404) rather than forbidden, so existence is not leaked.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
    private readonly athletesService: AthletesService,
    private readonly friendlyFixturesService: FriendlyFixturesService,
  ) {}

  async create(userId: string, dto: CreateEventDto) {
    const team = await this.requireTeam(userId);
    const competitionId = dto.type === 'match' ? dto.competitionId : null;
    if (competitionId) {
      await this.requireTeamCompetition(team.id, competitionId);
    }

    const friendlyOpponent =
      dto.type === 'match' && !competitionId && dto.friendlyOpponentTeamId
        ? await this.requireFriendlyOpponentTeam(
            team.id,
            dto.friendlyOpponentTeamId,
          )
        : null;

    // The fixture request is written first so the event carries the link from
    // the start; a failed event insert removes the request again.
    let fixtureId: string | null = null;
    if (friendlyOpponent) {
      const [fixture] = await this.databaseService.database
        .insert(friendlyFixtures)
        .values({
          requesterTeamId: team.id,
          opponentTeamId: friendlyOpponent.id,
          createdByUserId: userId,
        })
        .returning({ id: friendlyFixtures.id });
      fixtureId = fixture.id;
    }

    try {
      const [event] = await this.databaseService.database
        .insert(events)
        .values({
          teamId: team.id,
          title: dto.title,
          type: dto.type,
          scheduledAt: new Date(dto.scheduledAt),
          location: dto.location,
          venueName: dto.venueName,
          venueAddress: dto.venueAddress,
          weatherLocation: dto.weatherLocation,
          weatherLatitude: dto.weatherLatitude,
          weatherLongitude: dto.weatherLongitude,
          weatherTimezone: dto.weatherTimezone,
          notes: dto.notes,
          competitionId,
          friendlyFixtureId: fixtureId,
        })
        .returning();

      return event;
    } catch (error) {
      if (fixtureId) {
        await this.databaseService.database
          .delete(friendlyFixtures)
          .where(eq(friendlyFixtures.id, fixtureId));
      }
      throw error;
    }
  }

  async list(userId: string) {
    const team = await this.requireTeam(userId);
    return this.listForTeam(team.id);
  }

  /**
   * All events for a team (with their match ids) in schedule order — shared
   * with the player module, which scopes by the claimed athlete's team
   * instead of a coach's owned team.
   */
  async listForTeam(teamId: string) {
    const requesterTeams = alias(teams, 'friendly_requester_team');
    const opponentTeams = alias(teams, 'friendly_opponent_team');

    const rows = await this.databaseService.database
      .select({
        event: events,
        matchId: matches.id,
        fixtureScheduleConfirmedAt: competitionFixtures.scheduleConfirmedAt,
        lineupConfirmedAt: eventLineups.confirmedAt,
        friendlyFixtureStatus: friendlyFixtures.status,
        friendlyRequesterTeamId: friendlyFixtures.requesterTeamId,
        friendlyRequesterTeamName: requesterTeams.name,
        friendlyOpponentTeamId: friendlyFixtures.opponentTeamId,
        friendlyOpponentTeamName: opponentTeams.name,
      })
      .from(events)
      .leftJoin(matches, eq(matches.eventId, events.id))
      .leftJoin(eventLineups, eq(eventLineups.eventId, events.id))
      .leftJoin(
        competitionFixtures,
        eq(competitionFixtures.id, events.competitionFixtureId),
      )
      .leftJoin(
        friendlyFixtures,
        eq(friendlyFixtures.id, events.friendlyFixtureId),
      )
      .leftJoin(
        requesterTeams,
        eq(requesterTeams.id, friendlyFixtures.requesterTeamId),
      )
      .leftJoin(
        opponentTeams,
        eq(opponentTeams.id, friendlyFixtures.opponentTeamId),
      )
      .where(eq(events.teamId, teamId))
      .orderBy(asc(events.scheduledAt));

    return rows.map((row) => {
      // Each side's calendar shows the *other* team as the opponent. The
      // link itself is what keeps the two sides on the same friendly fixture.
      const isRequester = row.friendlyRequesterTeamId === row.event.teamId;
      const friendlyOpponentTeam = row.event.friendlyFixtureId
        ? isRequester
          ? {
              id: row.friendlyOpponentTeamId,
              name: row.friendlyOpponentTeamName,
            }
          : {
              id: row.friendlyRequesterTeamId,
              name: row.friendlyRequesterTeamName,
            }
        : { id: null, name: null };

      return {
        ...row.event,
        matchId: row.matchId,
        fixtureScheduleConfirmedAt: row.fixtureScheduleConfirmedAt,
        lineupConfirmedAt: row.lineupConfirmedAt,
        friendlyFixtureStatus: row.friendlyFixtureStatus,
        friendlyRequesterTeamId: row.friendlyRequesterTeamId,
        friendlyRequesterTeamName: row.friendlyRequesterTeamName,
        friendlyOpponentTeamId: friendlyOpponentTeam.id,
        friendlyOpponentTeamName: friendlyOpponentTeam.name,
      };
    });
  }

  /**
   * Every RSVP row for one athlete, across all events — used to annotate a
   * player's event list with their own responses.
   */
  async findRsvpsForAthlete(athleteId: string) {
    return this.databaseService.database
      .select()
      .from(eventRsvps)
      .where(eq(eventRsvps.athleteId, athleteId));
  }

  /**
   * Records (or updates) the caller's RSVP for an event. The caller must
   * have claimed an athlete on that event's team — a coach or unclaimed
   * user gets a 403. Upserts on the (eventId, athleteId) unique index so a
   * fresh response updates the existing row.
   */
  async rsvp(userId: string, eventId: string, dto: CreateRsvpDto) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    const athlete = await this.athletesService.findClaimedAthleteOnTeam(
      userId,
      event.teamId,
    );

    if (!athlete) {
      throw new ForbiddenException('No claimed player profile on this team.');
    }

    // The database stores an absolute timestamptz instant. Comparing it to
    // the server clock prevents late RSVPs regardless of the player's timezone
    // or any manipulated client clock. A coach rescheduling the event into the
    // future naturally reopens RSVPs if its status is still scheduled.
    if (
      event.status !== 'scheduled' ||
      event.scheduledAt.getTime() <= Date.now()
    ) {
      throw new ConflictException(
        'RSVP closed: this event has already started or is no longer scheduled.',
      );
    }

    const [rsvp] = await this.databaseService.database
      .insert(eventRsvps)
      .values({
        eventId,
        athleteId: athlete.id,
        status: dto.status,
        note: dto.note,
      })
      .onConflictDoUpdate({
        target: [eventRsvps.eventId, eventRsvps.athleteId],
        set: {
          status: dto.status,
          note: dto.note,
          respondedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();

    return rsvp;
  }

  /**
   * Coach-only roster-style RSVP breakdown for one of their team's events:
   * every active athlete with their RSVP status (null when not yet
   * responded).
   */
  async listRsvps(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    await this.requireEvent(team.id, eventId);

    return this.databaseService.database
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        position: athletes.position,
        squadNumber: athletes.squadNumber,
        rsvpStatus: eventRsvps.status,
        rsvpNote: eventRsvps.note,
        rsvpRespondedAt: eventRsvps.respondedAt,
      })
      .from(athletes)
      .leftJoin(
        eventRsvps,
        and(
          eq(eventRsvps.athleteId, athletes.id),
          eq(eventRsvps.eventId, eventId),
        ),
      )
      .where(and(eq(athletes.teamId, team.id), isNull(athletes.archivedAt)))
      .orderBy(asc(athletes.lastName), asc(athletes.firstName));
  }

  async findOne(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const event = await this.requireEvent(team.id, eventId);

    const [friendlyContext, matchRows, lineupRows] = await Promise.all([
      event.friendlyFixtureId
        ? this.resolveFriendlyFixtureContext(team.id, event.friendlyFixtureId)
        : Promise.resolve(null),
      this.databaseService.database
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.eventId, event.id))
        .limit(1),
      this.databaseService.database
        .select({ confirmedAt: eventLineups.confirmedAt })
        .from(eventLineups)
        .where(eq(eventLineups.eventId, event.id))
        .limit(1),
    ]);
    // Side-aware friendly fields: the opponent is always the *other* team,
    // and the requester identity lets the UI tell which side is viewing.
    const friendlyFields = {
      friendlyFixtureStatus: friendlyContext?.status ?? null,
      friendlyRequesterTeamId: friendlyContext?.requester?.id ?? null,
      friendlyRequesterTeamName: friendlyContext?.requester?.name ?? null,
      friendlyOpponentTeamId: friendlyContext?.opponent?.id ?? null,
      friendlyOpponentTeamName: friendlyContext?.opponent?.name ?? null,
    };
    const lineupFields = {
      matchId: matchRows[0]?.id ?? null,
      lineupConfirmedAt: lineupRows[0]?.confirmedAt ?? null,
    };

    if (!event.competitionFixtureId) {
      return {
        ...event,
        fixtureScheduleConfirmedAt: null,
        fixtureOpponentCompetitionTeamId: null,
        fixtureOpponentName: null,
        ...friendlyFields,
        ...lineupFields,
      };
    }

    const fixtureContext = await this.resolveGeneratedFixtureOpponent(
      team.id,
      event.competitionFixtureId,
      event.competitionId,
    );

    return {
      ...event,
      fixtureScheduleConfirmedAt: fixtureContext.scheduleConfirmedAt,
      fixtureOpponentCompetitionTeamId: fixtureContext.opponent?.id ?? null,
      fixtureOpponentName: fixtureContext.opponent?.displayName ?? null,
      ...friendlyFields,
      ...lineupFields,
    };
  }

  async getEventLinkDiagnostic(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);
    if (!event) throw new NotFoundException('Event not found.');

    let fixtureId: string | null = null;
    let sharedSessionId: string | null = null;
    let participants: Array<{ teamId: string | null; side: 'home' | 'away' }> =
      [];
    let matchSheets: Array<{
      teamId: string | null;
      side: 'home' | 'away';
      matchId: string | null;
    }> = [];
    if (event.competitionFixtureId) {
      const [fixture] = await this.databaseService.database
        .select()
        .from(competitionFixtures)
        .where(eq(competitionFixtures.id, event.competitionFixtureId))
        .limit(1);
      if (fixture) {
        fixtureId = fixture.id;
        sharedSessionId = fixture.sharedSessionId;
        const participantIds = [
          fixture.homeCompetitionTeamId,
          fixture.awayCompetitionTeamId,
        ].filter((id): id is string => Boolean(id));
        const participantRows = participantIds.length
          ? await this.databaseService.database
              .select({
                id: competitionTeams.id,
                teamId: competitionTeams.teamId,
              })
              .from(competitionTeams)
              .where(
                and(
                  eq(competitionTeams.competitionId, fixture.competitionId),
                  inArray(competitionTeams.id, participantIds),
                ),
              )
          : [];
        const teamsByParticipant = new Map(
          participantRows.map((row) => [row.id, row.teamId]),
        );
        participants = [
          ...(fixture.homeCompetitionTeamId
            ? [
                {
                  teamId:
                    teamsByParticipant.get(fixture.homeCompetitionTeamId) ??
                    null,
                  side: 'home' as const,
                },
              ]
            : []),
          ...(fixture.awayCompetitionTeamId
            ? [
                {
                  teamId:
                    teamsByParticipant.get(fixture.awayCompetitionTeamId) ??
                    null,
                  side: 'away' as const,
                },
              ]
            : []),
        ];
      }
    } else if (event.friendlyFixtureId) {
      const [fixture] = await this.databaseService.database
        .select()
        .from(friendlyFixtures)
        .where(eq(friendlyFixtures.id, event.friendlyFixtureId))
        .limit(1);
      if (fixture) {
        fixtureId = fixture.id;
        sharedSessionId = fixture.sharedSessionId;
        participants = [
          { teamId: fixture.requesterTeamId, side: 'home' },
          { teamId: fixture.opponentTeamId, side: 'away' },
        ];
      }
    }

    if (fixtureId) {
      if (!participants.some((participant) => participant.teamId === team.id)) {
        throw new NotFoundException('Event not found.');
      }
      const sheetRows = await this.databaseService.database
        .select({ teamId: events.teamId, matchId: matches.id })
        .from(events)
        .innerJoin(matches, eq(matches.eventId, events.id))
        .where(
          event.competitionFixtureId
            ? eq(events.competitionFixtureId, fixtureId)
            : eq(events.friendlyFixtureId, fixtureId),
        );
      matchSheets = participants.map((participant) => ({
        teamId: participant.teamId,
        side: participant.side,
        matchId:
          sheetRows.find((row) => row.teamId === participant.teamId)?.matchId ??
          null,
      }));
    } else if (event.teamId !== team.id) {
      throw new NotFoundException('Event not found.');
    }

    const status = fixtureId && sharedSessionId ? 'linked' : 'unlinked';
    return {
      eventId: event.id,
      fixtureId,
      sharedSessionId,
      participants,
      matchSheets,
      status,
      ...(status === 'unlinked'
        ? { warning: 'Event is not linked to a shared fixture session.' }
        : {}),
    };
  }

  /**
   * The opposing Gaffer team's confirmed match lineup for an accepted
   * friendly fixture on this event, so coaches never have to re-enter the
   * opposition by hand. Only the event's own team is ever resolved as the
   * other side of the shared fixture; every other case returns the neutral
   * "not available" shape.
   */
  async getFriendlyOpponentLineup(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const event = await this.requireEvent(team.id, eventId);
    if (event.competitionFixtureId && event.competitionId) {
      return this.friendlyFixturesService.resolveCompetitionOpponentLineup(
        event.competitionFixtureId,
        team.id,
      );
    }
    if (!event.friendlyFixtureId) {
      return unavailableFriendlyOpponentLineup();
    }
    return this.friendlyFixturesService.resolveOpponentLineup(
      event.friendlyFixtureId,
      team.id,
    );
  }

  /**
   * Saves (or replaces) the pre-match lineup for a scheduled match so the
   * squad is on record before kickoff — in particular for accepted friendly
   * fixtures, where the opponent sees it through the friendly-opponent
   * lookup. Open to every team member, mirroring the start-match access
   * model; once the match starts, this confirmed snapshot becomes read-only.
   */
  async confirmLineup(userId: string, eventId: string, dto: ConfirmLineupDto) {
    const team = await this.requireTeam(userId);
    const event = await this.requireEvent(team.id, eventId);

    if (event.type !== 'match') {
      throw new NotFoundException('Event not found.');
    }

    if (event.status !== 'scheduled') {
      throw new BadRequestException(
        'Only scheduled matches can have a confirmed lineup.',
      );
    }

    const [existingMatch] = await this.databaseService.database
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.eventId, event.id))
      .limit(1);

    if (existingMatch) {
      throw new ConflictException(
        'This match has already started — the squad is managed from the Live Logger.',
      );
    }

    await this.loadSelectableTeamAthletes(
      team.id,
      dto.startingAthleteIds,
      dto.benchAthleteIds,
    );

    const confirmedAt = new Date();
    const [lineup] = await this.databaseService.database
      .insert(eventLineups)
      .values({
        eventId: event.id,
        teamId: team.id,
        startingAthleteIds: dto.startingAthleteIds,
        benchAthleteIds: dto.benchAthleteIds ?? [],
        formationId: dto.formationId ?? null,
        pitchAssignments: dto.pitchAssignments ?? null,
        customPositions: dto.customPositions ?? null,
        confirmedByUserId: userId,
        confirmedAt,
      })
      .onConflictDoUpdate({
        target: eventLineups.eventId,
        set: {
          startingAthleteIds: dto.startingAthleteIds,
          benchAthleteIds: dto.benchAthleteIds ?? [],
          formationId: dto.formationId ?? null,
          pitchAssignments: dto.pitchAssignments ?? null,
          customPositions: dto.customPositions ?? null,
          confirmedByUserId: userId,
          confirmedAt,
          updatedAt: confirmedAt,
        },
      })
      .returning();

    return this.toLineupResponse(lineup);
  }

  /**
   * The team's currently confirmed pre-match lineup for this event, or null
   * when nothing has been confirmed (or the match has started and its live
   * squad superseded the pre-match record).
   */
  async getLineup(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const event = await this.requireEvent(team.id, eventId);

    const [lineup] = await this.databaseService.database
      .select()
      .from(eventLineups)
      .where(eq(eventLineups.eventId, event.id))
      .limit(1);

    return lineup ? this.toLineupResponse(lineup) : null;
  }

  private toLineupResponse(lineup: typeof eventLineups.$inferSelect) {
    return {
      startingAthleteIds: lineup.startingAthleteIds,
      benchAthleteIds: lineup.benchAthleteIds,
      formationId: lineup.formationId,
      pitchAssignments: lineup.pitchAssignments,
      customPositions: lineup.customPositions,
      confirmedAt: lineup.confirmedAt,
    };
  }

  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const team = await this.requireTeam(userId);
    const existingEvent = await this.requireEvent(team.id, eventId);
    this.ensureEventCanBeUpdated(existingEvent);
    const fixture = existingEvent.friendlyFixtureId
      ? await this.requireFriendlyFixture(existingEvent.friendlyFixtureId)
      : null;

    const type = dto.type ?? existingEvent.type;
    const competitionId =
      type === 'match'
        ? dto.competitionId !== undefined
          ? dto.competitionId
          : existingEvent.competitionId
        : null;
    const competitionChanged = competitionId !== existingEvent.competitionId;
    this.ensureCompetitionUpdateAllowed(
      fixture,
      type,
      competitionChanged,
      competitionId,
    );
    if (competitionChanged) {
      const [startedMatch] = await this.databaseService.database
        .select({ id: matches.id })
        .from(matches)
        .where(eq(matches.eventId, eventId))
        .limit(1);
      if (startedMatch) {
        throw new BadRequestException(
          'The competition cannot be changed after the match has started.',
        );
      }
    }
    if (competitionId && competitionChanged) {
      await this.requireTeamCompetition(team.id, competitionId);
    }

    // Resolve the friendly-opponent link after this update. A pending request
    // can still be swapped or removed; an accepted fixture is fixed because
    // the opponent's calendar mirrors it.
    const currentFriendlyTeamId = fixture
      ? this.friendlyOpponentTeamIdFor(fixture, team.id)
      : null;
    const requestedFriendlyTeamId = this.getRequestedFriendlyTeamId(
      dto,
      type,
      competitionId,
      currentFriendlyTeamId,
    );
    this.ensureAcceptedFriendlyOpponentUnchanged(
      fixture,
      requestedFriendlyTeamId,
      currentFriendlyTeamId,
    );
    const { friendlyFixtureId, createdFixtureId } =
      await this.prepareFriendlyFixtureUpdate(
        userId,
        team.id,
        existingEvent.friendlyFixtureId,
        requestedFriendlyTeamId,
        currentFriendlyTeamId,
      );

    try {
      const [event] = await this.databaseService.database
        .update(events)
        .set(
          this.buildEventUpdateValues(
            dto,
            type,
            competitionId,
            friendlyFixtureId,
            existingEvent.friendlyFixtureId,
          ),
        )
        .where(and(eq(events.id, eventId), eq(events.teamId, team.id)))
        .returning();

      await this.syncFriendlyFixtureUpdate(
        fixture,
        friendlyFixtureId,
        currentFriendlyTeamId,
        dto,
      );

      await this.databaseService.database
        .update(matches)
        .set({ competitionId, updatedAt: new Date() })
        .where(eq(matches.eventId, eventId));

      return event;
    } catch (error) {
      // Do not leave a freshly created request behind when the event update
      // fails — it would surface as an orphaned inbound ask for the opponent.
      if (createdFixtureId) {
        await this.databaseService.database
          .delete(friendlyFixtures)
          .where(eq(friendlyFixtures.id, createdFixtureId));
      }
      throw error;
    }
  }

  private ensureEventCanBeUpdated(event: typeof events.$inferSelect) {
    if (event.competitionFixtureId) {
      throw new BadRequestException(
        'Generated competition fixtures are managed from Leagues & Competitions.',
      );
    }
  }

  private buildEventUpdateValues(
    dto: UpdateEventDto,
    type: string,
    competitionId: string | null,
    friendlyFixtureId: string | null,
    existingFriendlyFixtureId: string | null,
  ): Partial<typeof events.$inferInsert> {
    return {
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.scheduledAt !== undefined
        ? { scheduledAt: new Date(dto.scheduledAt) }
        : {}),
      ...(dto.location !== undefined ? { location: dto.location } : {}),
      ...(dto.venueName !== undefined ? { venueName: dto.venueName } : {}),
      ...(dto.venueAddress !== undefined
        ? { venueAddress: dto.venueAddress }
        : {}),
      ...(dto.weatherLocation !== undefined
        ? { weatherLocation: dto.weatherLocation }
        : {}),
      ...(dto.weatherLatitude !== undefined
        ? { weatherLatitude: dto.weatherLatitude }
        : {}),
      ...(dto.weatherLongitude !== undefined
        ? { weatherLongitude: dto.weatherLongitude }
        : {}),
      ...(dto.weatherTimezone !== undefined
        ? { weatherTimezone: dto.weatherTimezone }
        : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      ...(dto.competitionId !== undefined || type !== 'match'
        ? { competitionId }
        : {}),
      ...(friendlyFixtureId !== existingFriendlyFixtureId
        ? { friendlyFixtureId }
        : {}),
      updatedAt: new Date(),
    };
  }

  private ensureCompetitionUpdateAllowed(
    fixture: typeof friendlyFixtures.$inferSelect | null,
    type: string,
    competitionChanged: boolean,
    competitionId: string | null,
  ) {
    if (fixture && competitionChanged && competitionId) {
      throw new BadRequestException(
        'Remove the Gaffer opponent before adding this match to a competition.',
      );
    }
    if (
      fixture?.status === 'accepted' &&
      (type !== 'match' || competitionChanged)
    ) {
      throw new BadRequestException(
        'This friendly fixture has been accepted and cannot be moved to another competition.',
      );
    }
  }

  private getRequestedFriendlyTeamId(
    dto: UpdateEventDto,
    type: string,
    competitionId: string | null,
    currentTeamId: string | null,
  ) {
    if (dto.friendlyOpponentTeamId === undefined) return currentTeamId;
    return type === 'match' && competitionId === null
      ? dto.friendlyOpponentTeamId
      : null;
  }

  private ensureAcceptedFriendlyOpponentUnchanged(
    fixture: typeof friendlyFixtures.$inferSelect | null,
    requestedTeamId: string | null,
    currentTeamId: string | null,
  ) {
    if (fixture?.status === 'accepted' && requestedTeamId !== currentTeamId) {
      throw new BadRequestException(
        'The opponent is fixed while this friendly fixture is accepted.',
      );
    }
  }

  private async prepareFriendlyFixtureUpdate(
    userId: string,
    teamId: string,
    existingFixtureId: string | null,
    requestedTeamId: string | null,
    currentTeamId: string | null,
  ): Promise<{
    friendlyFixtureId: string | null;
    createdFixtureId: string | null;
  }> {
    if (requestedTeamId === currentTeamId) {
      return { friendlyFixtureId: existingFixtureId, createdFixtureId: null };
    }
    if (!requestedTeamId) {
      return { friendlyFixtureId: null, createdFixtureId: null };
    }
    await this.requireFriendlyOpponentTeam(teamId, requestedTeamId);
    const [created] = await this.databaseService.database
      .insert(friendlyFixtures)
      .values({
        requesterTeamId: teamId,
        opponentTeamId: requestedTeamId,
        createdByUserId: userId,
      })
      .returning({ id: friendlyFixtures.id });
    return { friendlyFixtureId: created.id, createdFixtureId: created.id };
  }

  private async syncFriendlyFixtureUpdate(
    fixture: typeof friendlyFixtures.$inferSelect | null,
    friendlyFixtureId: string | null,
    currentFriendlyTeamId: string | null,
    dto: UpdateEventDto,
  ) {
    if (fixture && fixture.id !== friendlyFixtureId) {
      await this.databaseService.database
        .update(friendlyFixtures)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(friendlyFixtures.id, fixture.id),
            eq(friendlyFixtures.status, 'pending'),
          ),
        );
    }
    if (
      !this.shouldSyncAcceptedFriendlyEvent(
        fixture,
        friendlyFixtureId,
        currentFriendlyTeamId,
        dto,
      )
    )
      return;
    await this.databaseService.database
      .update(events)
      .set({
        ...(dto.scheduledAt !== undefined
          ? { scheduledAt: new Date(dto.scheduledAt) }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(events.friendlyFixtureId, fixture!.id),
          eq(events.teamId, currentFriendlyTeamId!),
        ),
      );
  }

  private shouldSyncAcceptedFriendlyEvent(
    fixture: typeof friendlyFixtures.$inferSelect | null,
    friendlyFixtureId: string | null,
    currentTeamId: string | null,
    dto: UpdateEventDto,
  ) {
    return Boolean(
      fixture?.status === 'accepted' &&
      fixture.id === friendlyFixtureId &&
      currentTeamId &&
      (dto.scheduledAt !== undefined || dto.location !== undefined),
    );
  }

  async cancel(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const existingEvent = await this.requireEvent(team.id, eventId);
    if (existingEvent.competitionFixtureId) {
      throw new BadRequestException(
        'Generated competition fixtures are managed from Leagues & Competitions.',
      );
    }

    if (existingEvent.friendlyFixtureId) {
      await this.cancelFriendlyFixture(existingEvent.friendlyFixtureId);
    }

    const [event] = await this.databaseService.database
      .update(events)
      .set({
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, eventId), eq(events.teamId, team.id)))
      .returning();

    return event;
  }

  /**
   * A friendly fixture is one shared agreement: cancelling either side
   * retires the fixture and cancels the linked events on both calendars.
   * Already declined/cancelled fixtures keep their terminal status.
   */
  private async cancelFriendlyFixture(fixtureId: string) {
    await this.databaseService.database
      .update(events)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(events.friendlyFixtureId, fixtureId),
          ne(events.status, 'cancelled'),
        ),
      );

    await this.databaseService.database
      .update(friendlyFixtures)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(
        and(
          eq(friendlyFixtures.id, fixtureId),
          inArray(friendlyFixtures.status, ['pending', 'accepted']),
        ),
      );
  }

  async startMatch(userId: string, eventId: string, dto: StartMatchDto) {
    const team = await this.requireTeam(userId);
    const event = await this.requireEvent(team.id, eventId);

    if (event.type !== 'match') {
      throw new NotFoundException('Event not found.');
    }

    if (event.status !== 'scheduled') {
      throw new BadRequestException('Only scheduled matches can be started.');
    }

    const generatedFixtureOpponent = event.competitionFixtureId
      ? await this.getConfirmedGeneratedOpponent(team.id, event, dto)
      : null;
    const friendlyFixtureOpponent = event.friendlyFixtureId
      ? await this.getAcceptedFriendlyOpponent(team.id, event.friendlyFixtureId)
      : null;

    let sharedMatchId: string | null = null;
    if (twoSidedLiveLoggingEnabled() && event.friendlyFixtureId) {
      sharedMatchId = await ensureFriendlyFixtureSession(
        this.databaseService,
        event.friendlyFixtureId,
      );
      if (!sharedMatchId) {
        throw new ConflictException(
          'The friendly fixture session could not be resolved safely.',
        );
      }
    } else if (twoSidedLiveLoggingEnabled() && event.competitionFixtureId) {
      sharedMatchId = await ensureCompetitionFixtureSession(
        this.databaseService,
        event.competitionFixtureId,
      );
      if (!sharedMatchId) {
        throw new ConflictException(
          'The generated fixture session could not be resolved safely.',
        );
      }
    }

    if (this.isBeforeMatchDay(event.scheduledAt)) {
      throw new ForbiddenException(
        'Matches cannot be started before match day.',
      );
    }

    const competitionOpponent = generatedFixtureOpponent
      ? generatedFixtureOpponent
      : event.competitionId
        ? await this.requireCompetitionOpponent(
            team.id,
            event.competitionId,
            dto.opponentCompetitionTeamId,
          )
        : null;
    const opponentName =
      competitionOpponent?.displayName ??
      friendlyFixtureOpponent?.name ??
      dto.opponentName;

    const gamePlan = dto.gamePlanId
      ? await this.requireTeamGamePlan(team.id, dto.gamePlanId)
      : null;
    const gamePlanPlayerCount = gamePlan
      ? getFormationPlayerCount(gamePlan.formationId)
      : null;
    if (gamePlan && !gamePlanPlayerCount) {
      throw new BadRequestException('Formation is not supported.');
    }

    const competition = event.competitionId
      ? await this.requireTeamCompetition(team.id, event.competitionId)
      : null;
    const requiredStarterCount =
      competition?.playersPerSide ??
      gamePlanPlayerCount ??
      getFormationPlayerCount(DEFAULT_FORMATION_ID);
    if (!requiredStarterCount) {
      throw new BadRequestException('Match format is not supported.');
    }
    if (
      competition &&
      gamePlanPlayerCount &&
      gamePlanPlayerCount !== requiredStarterCount
    ) {
      throw new BadRequestException(
        `This competition is ${requiredStarterCount}-a-side. Choose a compatible game plan.`,
      );
    }
    if (dto.startingAthleteIds.length !== requiredStarterCount) {
      throw new BadRequestException(
        `This match format requires exactly ${requiredStarterCount} starting athletes.`,
      );
    }

    const { teamAthletes, requestedIds } =
      await this.loadSelectableTeamAthletes(
        team.id,
        dto.startingAthleteIds,
        dto.benchAthleteIds,
      );

    const startingIds = new Set(dto.startingAthleteIds);
    const teamColor = dto.teamColor ?? team.primaryColor ?? null;
    const matchValues = {
      opponentName,
      opponentCompetitionTeamId: competitionOpponent?.id ?? null,
      opponentTeamId: friendlyFixtureOpponent?.id ?? null,
      // Fixture orientation is authoritative for generated and accepted
      // friendlies. Keep client orientation only for standalone manual events.
      isHome:
        generatedFixtureOpponent?.isHome ??
        friendlyFixtureOpponent?.isHome ??
        dto.isHome,
      gamePlanId: dto.gamePlanId ?? null,
      gamePlanSnapshot: gamePlan
        ? {
            name: gamePlan.name,
            formationId: gamePlan.formationId,
            assignments: gamePlan.assignments,
            customPositions: gamePlan.customPositions,
            substituteIds: gamePlan.substituteIds,
            defensiveStyle: gamePlan.defensiveStyle,
            defensiveWidth: gamePlan.defensiveWidth,
            defensiveDepth: gamePlan.defensiveDepth,
            offensiveStyle: gamePlan.offensiveStyle,
            offensiveWidth: gamePlan.offensiveWidth,
            playersInBox: gamePlan.playersInBox,
            cornersCommitment: gamePlan.cornersCommitment,
            freeKicksCommitment: gamePlan.freeKicksCommitment,
            captainId: gamePlan.captainId,
            freeKickTakerId: gamePlan.freeKickTakerId,
            penaltyTakerId: gamePlan.penaltyTakerId,
            cornerTakerId: gamePlan.cornerTakerId,
          }
        : null,
      opponentSquadVisibility: dto.opponentSquadVisibility,
      teamColor,
      opponentColor: dto.opponentColor ?? null,
      updatedAt: new Date(),
    };

    const [existingMatch] = await this.databaseService.database
      .select()
      .from(matches)
      .where(eq(matches.eventId, event.id))
      .limit(1);

    if (existingMatch) {
      if (!twoSidedLiveLoggingEnabled()) {
        await this.databaseService.database
          .delete(eventLineups)
          .where(eq(eventLineups.eventId, event.id));
      }
      return this.attachMatchToSession(existingMatch, sharedMatchId);
    }

    const [match] = await this.databaseService.database
      .insert(matches)
      .values({
        eventId: event.id,
        sharedMatchId,
        competitionId: event.competitionId,
        opponentCompetitionTeamId: matchValues.opponentCompetitionTeamId,
        opponentTeamId: matchValues.opponentTeamId,
        opponentName: matchValues.opponentName,
        isHome: matchValues.isHome,
        gamePlanId: matchValues.gamePlanId,
        gamePlanSnapshot: matchValues.gamePlanSnapshot,
        opponentSquadVisibility: matchValues.opponentSquadVisibility,
        teamColor: matchValues.teamColor,
        opponentColor: matchValues.opponentColor,
      })
      .onConflictDoNothing({ target: matches.eventId })
      .returning();

    if (!match) {
      const [concurrentMatch] = await this.databaseService.database
        .select()
        .from(matches)
        .where(eq(matches.eventId, event.id))
        .limit(1);
      if (concurrentMatch) {
        return this.attachMatchToSession(concurrentMatch, sharedMatchId);
      }
      throw new ConflictException('This match could not be started safely.');
    }

    try {
      const squadAthletes = dto.benchAthleteIds
        ? teamAthletes.filter((athlete) => requestedIds.includes(athlete.id))
        : teamAthletes.filter((athlete) => athlete.status !== 'injured');

      if (dto.benchAthleteIds && requestedIds.length > 0) {
        await this.databaseService.database
          .delete(athleteMatchStats)
          .where(
            and(
              eq(athleteMatchStats.matchId, match.id),
              notInArray(athleteMatchStats.athleteId, requestedIds),
            ),
          );
      }

      if (squadAthletes.length > 0) {
        await this.databaseService.database
          .insert(athleteMatchStats)
          .values(
            squadAthletes.map((athlete) => ({
              matchId: match.id,
              athleteId: athlete.id,
              started: startingIds.has(athlete.id),
            })),
          )
          .onConflictDoUpdate({
            target: [athleteMatchStats.matchId, athleteMatchStats.athleteId],
            set: {
              started: sql`excluded.started`,
              updatedAt: new Date(),
            },
          });
      }

      await this.replaceOpponentSquad(match.id, dto);

      // Keep the confirmed lineup snapshot for the opponent's read-only view.
      // confirmLineup rejects changes once this match row exists.
      if (!twoSidedLiveLoggingEnabled()) {
        await this.databaseService.database
          .delete(eventLineups)
          .where(eq(eventLineups.eventId, event.id));
      }
    } catch (error) {
      // Compensate for Neon HTTP's lack of interactive transactions so a
      // partially-created match can be retried from the confirmation screen.
      await this.databaseService.database
        .delete(matches)
        .where(eq(matches.id, match.id));
      throw error;
    }

    return match;
  }

  private async getConfirmedGeneratedOpponent(
    teamId: string,
    event: typeof events.$inferSelect,
    dto: StartMatchDto,
  ) {
    const fixtureContext = await this.resolveGeneratedFixtureOpponent(
      teamId,
      event.competitionFixtureId!,
      event.competitionId,
    );
    if (!fixtureContext.scheduleConfirmedAt) {
      throw new ForbiddenException(
        'Both teams must confirm the fixture date before this match can start.',
      );
    }
    const opponent = fixtureContext.opponent;
    if (!opponent) {
      throw new BadRequestException(
        'The opponent for this generated fixture is not known yet.',
      );
    }
    if (
      dto.opponentCompetitionTeamId &&
      dto.opponentCompetitionTeamId !== opponent.id
    ) {
      throw new BadRequestException(
        'The opponent is fixed by this generated competition fixture.',
      );
    }
    return {
      ...opponent,
      isHome:
        fixtureContext.ownCompetitionTeamId ===
        fixtureContext.homeCompetitionTeamId,
    };
  }

  private async getAcceptedFriendlyOpponent(teamId: string, fixtureId: string) {
    const fixture = await this.requireFriendlyFixture(fixtureId);
    const blockedStatuses = {
      pending: 'Waiting for the opponent to accept this friendly fixture.',
      declined: 'The opponent declined this friendly fixture.',
      cancelled: 'This friendly fixture has been cancelled.',
    } as const;
    const blockedMessage =
      blockedStatuses[fixture.status as keyof typeof blockedStatuses];
    if (blockedMessage) throw new ForbiddenException(blockedMessage);

    const opponentTeamId = this.friendlyOpponentTeamIdFor(fixture, teamId);
    if (!opponentTeamId) {
      throw new BadRequestException(
        'This event is not linked to the friendly fixture.',
      );
    }
    const [opponentTeam] = await this.databaseService.database
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.id, opponentTeamId))
      .limit(1);
    if (!opponentTeam) {
      throw new BadRequestException('Opponent team not found on Gaffer.');
    }
    return {
      ...opponentTeam,
      isHome: fixture.requesterTeamId === teamId,
    };
  }

  private async replaceOpponentSquad(matchId: string, dto: StartMatchDto) {
    await this.databaseService.database
      .delete(opponentMatchPlayers)
      .where(eq(opponentMatchPlayers.matchId, matchId));

    const players = dto.opponentSquad ?? [];
    if (players.length === 0) {
      return;
    }

    await this.databaseService.database.insert(opponentMatchPlayers).values(
      players.map((player) => ({
        matchId,
        shirtNumber: player.shirtNumber,
        name:
          dto.opponentSquadVisibility === 'full' ? (player.name ?? null) : null,
        position: player.position ?? null,
      })),
    );
  }

  /**
   * Loads the team's active athletes and validates a requested squad
   * (starters plus optional bench) against them — shared by the pre-match
   * lineup confirmation and the start-match squad write so both entry
   * points enforce identical selection rules.
   */
  private async loadSelectableTeamAthletes(
    teamId: string,
    startingAthleteIds: string[],
    benchAthleteIds?: string[],
  ) {
    const teamAthletes = await this.databaseService.database
      .select()
      .from(athletes)
      .where(and(eq(athletes.teamId, teamId), isNull(athletes.archivedAt)));

    const teamAthletesById = new Map(
      teamAthletes.map((athlete) => [athlete.id, athlete]),
    );
    const requestedIds = benchAthleteIds
      ? [...startingAthleteIds, ...benchAthleteIds]
      : startingAthleteIds;

    for (const athleteId of requestedIds) {
      const athlete = teamAthletesById.get(athleteId);
      if (!athlete) {
        throw new BadRequestException(
          benchAthleteIds
            ? 'One or more selected athletes are not on this team.'
            : 'One or more starting athletes are not on this team.',
        );
      }
      if (athlete.status === 'injured') {
        throw new BadRequestException(
          'Injured athletes cannot be selected for a match.',
        );
      }
    }

    return { teamAthletes, requestedIds };
  }

  private async resolveGeneratedFixtureOpponent(
    teamId: string,
    fixtureId: string,
    eventCompetitionId: string | null,
  ): Promise<{
    scheduleConfirmedAt: Date | null;
    ownCompetitionTeamId: string;
    homeCompetitionTeamId: string | null;
    opponent: { id: string; displayName: string } | null;
  }> {
    const [fixture] = await this.databaseService.database
      .select({
        competitionId: competitionFixtures.competitionId,
        homeCompetitionTeamId: competitionFixtures.homeCompetitionTeamId,
        awayCompetitionTeamId: competitionFixtures.awayCompetitionTeamId,
        scheduleConfirmedAt: competitionFixtures.scheduleConfirmedAt,
      })
      .from(competitionFixtures)
      .where(eq(competitionFixtures.id, fixtureId))
      .limit(1);

    if (!fixture) {
      throw new BadRequestException('Generated competition fixture not found.');
    }
    if (!eventCompetitionId || fixture.competitionId !== eventCompetitionId) {
      throw new BadRequestException(
        'Generated fixture does not match this event competition.',
      );
    }

    const [ownParticipant] = await this.databaseService.database
      .select({ id: competitionTeams.id })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.competitionId, fixture.competitionId),
          eq(competitionTeams.teamId, teamId),
        ),
      )
      .limit(1);

    if (!ownParticipant) {
      throw new BadRequestException(
        'Your team is not a participant in this generated fixture competition.',
      );
    }

    const opponentId =
      ownParticipant.id === fixture.homeCompetitionTeamId
        ? fixture.awayCompetitionTeamId
        : ownParticipant.id === fixture.awayCompetitionTeamId
          ? fixture.homeCompetitionTeamId
          : null;

    if (!opponentId) {
      return {
        scheduleConfirmedAt: fixture.scheduleConfirmedAt,
        ownCompetitionTeamId: ownParticipant.id,
        homeCompetitionTeamId: fixture.homeCompetitionTeamId,
        opponent: null,
      };
    }

    const [opponent] = await this.databaseService.database
      .select({
        id: competitionTeams.id,
        displayName: competitionTeams.displayName,
      })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.id, opponentId),
          eq(competitionTeams.competitionId, fixture.competitionId),
        ),
      )
      .limit(1);

    return {
      scheduleConfirmedAt: fixture.scheduleConfirmedAt,
      ownCompetitionTeamId: ownParticipant.id,
      homeCompetitionTeamId: fixture.homeCompetitionTeamId,
      opponent: opponent ?? null,
    };
  }

  private async requireCompetitionOpponent(
    teamId: string,
    competitionId: string,
    opponentCompetitionTeamId: string | null | undefined,
  ) {
    if (!opponentCompetitionTeamId) {
      throw new BadRequestException(
        'Choose an opponent from the participating teams in this competition.',
      );
    }

    await this.requireTeamCompetition(teamId, competitionId);

    const [participant] = await this.databaseService.database
      .select({
        id: competitionTeams.id,
        teamId: competitionTeams.teamId,
        displayName: competitionTeams.displayName,
      })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.id, opponentCompetitionTeamId),
          eq(competitionTeams.competitionId, competitionId),
        ),
      )
      .limit(1);

    if (!participant || participant.teamId === teamId) {
      throw new BadRequestException(
        'Choose another participating team as the opponent.',
      );
    }

    return participant;
  }

  private async requireTeamGamePlan(teamId: string, gamePlanId: string) {
    const [plan] = await this.databaseService.database
      .select()
      .from(gamePlans)
      .where(and(eq(gamePlans.id, gamePlanId), eq(gamePlans.teamId, teamId)))
      .limit(1);

    if (!plan) {
      throw new BadRequestException('Game plan not found.');
    }

    return plan;
  }

  private async requireTeamCompetition(teamId: string, competitionId: string) {
    const [competition] = await this.databaseService.database
      .select({
        id: competitions.id,
        playersPerSide: competitions.playersPerSide,
      })
      .from(competitionTeams)
      .innerJoin(
        competitions,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(
        and(
          eq(competitionTeams.teamId, teamId),
          eq(competitions.id, competitionId),
          ne(competitions.type, 'friendly'),
        ),
      )
      .limit(1);

    if (!competition) {
      throw new BadRequestException('Competition not found.');
    }
    return competition;
  }

  /**
   * Loads a friendly fixture by id. A missing fixture is a bad request — the
   * link is always written together with the event itself.
   */
  private async requireFriendlyFixture(fixtureId: string) {
    const [fixture] = await this.databaseService.database
      .select()
      .from(friendlyFixtures)
      .where(eq(friendlyFixtures.id, fixtureId))
      .limit(1);

    if (!fixture) {
      throw new BadRequestException('Friendly fixture not found.');
    }

    return fixture;
  }

  /** The other team on a friendly fixture, from `teamId`'s perspective. */
  private friendlyOpponentTeamIdFor(
    fixture: typeof friendlyFixtures.$inferSelect,
    teamId: string,
  ): string | null {
    if (fixture.requesterTeamId === teamId) {
      return fixture.opponentTeamId;
    }
    if (fixture.opponentTeamId === teamId) {
      return fixture.requesterTeamId;
    }
    return null;
  }

  private async requireFriendlyOpponentTeam(
    teamId: string,
    opponentTeamId: string,
  ) {
    if (opponentTeamId === teamId) {
      throw new BadRequestException(
        'You cannot select your own team as the opponent.',
      );
    }

    const [opponent] = await this.databaseService.database
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(eq(teams.id, opponentTeamId))
      .limit(1);

    if (!opponent) {
      throw new BadRequestException('Opponent team not found on Gaffer.');
    }

    return opponent;
  }

  /**
   * Side-aware friendly context for one viewer: the requester is always
   * identified so the UI can tell which side of the fixture is viewing,
   * and the opponent is always the *other* team — never the viewer itself.
   */
  private async resolveFriendlyFixtureContext(
    teamId: string,
    fixtureId: string,
  ): Promise<{
    status: (typeof friendlyFixtures.status.enumValues)[number];
    requester: { id: string; name: string } | null;
    opponent: { id: string; name: string } | null;
  }> {
    const fixture = await this.requireFriendlyFixture(fixtureId);
    const opponentTeamId = this.friendlyOpponentTeamIdFor(fixture, teamId);
    const teamIds = [
      ...new Set(
        [fixture.requesterTeamId, opponentTeamId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ];

    const teamRows = await this.databaseService.database
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, teamIds));
    const teamsById = new Map(teamRows.map((row) => [row.id, row]));

    return {
      status: fixture.status,
      requester: teamsById.get(fixture.requesterTeamId) ?? null,
      opponent: opponentTeamId ? (teamsById.get(opponentTeamId) ?? null) : null,
    };
  }

  private async requireTeam(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);
    if (!team) {
      throw new ForbiddenException('No team associated with this account.');
    }
    return team;
  }

  private async requireEvent(teamId: string, eventId: string) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(and(eq(events.id, eventId), eq(events.teamId, teamId)))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Event not found.');
    }

    return event;
  }

  private async attachMatchToSession(
    match: typeof matches.$inferSelect,
    sharedSessionId: string | null,
  ) {
    if (
      sharedSessionId &&
      match.sharedMatchId &&
      match.sharedMatchId !== sharedSessionId
    ) {
      throw new ConflictException(
        'This match sheet is linked to a different shared session and needs review.',
      );
    }
    if (!sharedSessionId) return match;

    const [event] = await this.databaseService.database
      .select({ teamId: events.teamId })
      .from(events)
      .where(eq(events.id, match.eventId))
      .limit(1);
    const [participant] = event
      ? await this.databaseService.database
          .select({ side: matchSessionParticipants.side })
          .from(matchSessionParticipants)
          .where(
            and(
              eq(matchSessionParticipants.sessionId, sharedSessionId),
              eq(matchSessionParticipants.teamId, event.teamId),
            ),
          )
          .limit(1)
      : [];
    if (!participant) {
      throw new ConflictException(
        'The fixture participant side could not be resolved safely.',
      );
    }
    if (match.sharedMatchId === sharedSessionId) {
      if (match.isHome === (participant.side === 'home')) return match;
      const [normalized] = await this.databaseService.database
        .update(matches)
        .set({ isHome: participant.side === 'home', updatedAt: new Date() })
        .where(eq(matches.id, match.id))
        .returning();
      return normalized ?? match;
    }

    const [attached] = await this.databaseService.database
      .update(matches)
      .set({
        sharedMatchId: sharedSessionId,
        isHome: participant.side === 'home',
        updatedAt: new Date(),
      })
      .where(and(eq(matches.id, match.id), isNull(matches.sharedMatchId)))
      .returning();
    if (attached) return attached;

    const [current] = await this.databaseService.database
      .select()
      .from(matches)
      .where(eq(matches.id, match.id))
      .limit(1);
    if (!current || current.sharedMatchId !== sharedSessionId) {
      throw new ConflictException(
        'This match sheet changed to a different shared session and needs review.',
      );
    }
    return current;
  }

  private isBeforeMatchDay(scheduledAt: Date) {
    const today = this.calendarDate(new Date());
    const matchDay = this.calendarDate(scheduledAt);
    return today < matchDay;
  }

  private calendarDate(date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
