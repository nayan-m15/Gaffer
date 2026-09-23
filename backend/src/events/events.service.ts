import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { AthletesService } from '../athletes/athletes.service';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  competitions,
  competitionFixtures,
  competitionTeams,
  eventRsvps,
  events,
  gamePlans,
  matches,
  opponentMatchPlayers,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
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
  ) {}

  async create(userId: string, dto: CreateEventDto) {
    const team = await this.requireTeam(userId);
    const competitionId = dto.type === 'match' ? dto.competitionId : null;
    if (competitionId) {
      await this.requireTeamCompetition(team.id, competitionId);
    }

    const [event] = await this.databaseService.database
      .insert(events)
      .values({
        teamId: team.id,
        title: dto.title,
        type: dto.type,
        scheduledAt: new Date(dto.scheduledAt),
        location: dto.location,
        venueAddress: dto.venueAddress,
        weatherLocation: dto.weatherLocation,
        weatherLatitude: dto.weatherLatitude,
        weatherLongitude: dto.weatherLongitude,
        weatherTimezone: dto.weatherTimezone,
        notes: dto.notes,
        competitionId,
      })
      .returning();

    return event;
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
    const rows = await this.databaseService.database
      .select({
        event: events,
        matchId: matches.id,
        fixtureScheduleConfirmedAt: competitionFixtures.scheduleConfirmedAt,
      })
      .from(events)
      .leftJoin(matches, eq(matches.eventId, events.id))
      .leftJoin(
        competitionFixtures,
        eq(competitionFixtures.id, events.competitionFixtureId),
      )
      .where(eq(events.teamId, teamId))
      .orderBy(asc(events.scheduledAt));

    return rows.map((row) => ({
      ...row.event,
      matchId: row.matchId,
      fixtureScheduleConfirmedAt: row.fixtureScheduleConfirmedAt,
    }));
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
    if (!event.competitionFixtureId) {
      return { ...event, fixtureScheduleConfirmedAt: null };
    }
    const [fixture] = await this.databaseService.database
      .select({ scheduleConfirmedAt: competitionFixtures.scheduleConfirmedAt })
      .from(competitionFixtures)
      .where(eq(competitionFixtures.id, event.competitionFixtureId))
      .limit(1);
    return {
      ...event,
      fixtureScheduleConfirmedAt: fixture?.scheduleConfirmedAt ?? null,
    };
  }

  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const team = await this.requireTeam(userId);
    const existingEvent = await this.requireEvent(team.id, eventId);
    if (existingEvent.competitionFixtureId) {
      throw new BadRequestException(
        'Generated competition fixtures are managed from Leagues & Competitions.',
      );
    }
    const type = dto.type ?? existingEvent.type;
    const competitionId =
      type === 'match'
        ? dto.competitionId !== undefined
          ? dto.competitionId
          : existingEvent.competitionId
        : null;
    const competitionChanged = competitionId !== existingEvent.competitionId;
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

    const [event] = await this.databaseService.database
      .update(events)
      .set({
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.scheduledAt !== undefined
          ? { scheduledAt: new Date(dto.scheduledAt) }
          : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
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
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, eventId), eq(events.teamId, team.id)))
      .returning();

    await this.databaseService.database
      .update(matches)
      .set({ competitionId, updatedAt: new Date() })
      .where(eq(matches.eventId, eventId));

    return event;
  }

  async cancel(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const existingEvent = await this.requireEvent(team.id, eventId);
    if (existingEvent.competitionFixtureId) {
      throw new BadRequestException(
        'Generated competition fixtures are managed from Leagues & Competitions.',
      );
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

  async startMatch(userId: string, eventId: string, dto: StartMatchDto) {
    const team = await this.requireTeam(userId);
    const event = await this.requireEvent(team.id, eventId);

    if (event.type !== 'match') {
      throw new NotFoundException('Event not found.');
    }

    if (event.status !== 'scheduled') {
      throw new BadRequestException('Only scheduled matches can be started.');
    }

    if (event.competitionFixtureId) {
      const [fixture] = await this.databaseService.database
        .select({
          scheduleConfirmedAt: competitionFixtures.scheduleConfirmedAt,
        })
        .from(competitionFixtures)
        .where(eq(competitionFixtures.id, event.competitionFixtureId))
        .limit(1);
      if (!fixture?.scheduleConfirmedAt) {
        throw new ForbiddenException(
          'Both teams must confirm the fixture date before this match can start.',
        );
      }
    }

    if (this.isBeforeMatchDay(event.scheduledAt)) {
      throw new ForbiddenException(
        'Matches cannot be started before match day.',
      );
    }

    const competitionOpponent = event.competitionId
      ? await this.requireCompetitionOpponent(
          team.id,
          event.competitionId,
          dto.opponentCompetitionTeamId,
        )
      : null;
    const opponentName = competitionOpponent?.displayName ?? dto.opponentName;

    const gamePlan = dto.gamePlanId
      ? await this.requireTeamGamePlan(team.id, dto.gamePlanId)
      : null;

    const teamAthletes = await this.databaseService.database
      .select()
      .from(athletes)
      .where(and(eq(athletes.teamId, team.id), isNull(athletes.archivedAt)));

    const teamAthletesById = new Map(
      teamAthletes.map((athlete) => [athlete.id, athlete]),
    );
    const requestedIds = dto.benchAthleteIds
      ? [...dto.startingAthleteIds, ...dto.benchAthleteIds]
      : dto.startingAthleteIds;

    for (const athleteId of requestedIds) {
      const athlete = teamAthletesById.get(athleteId);
      if (!athlete) {
        throw new BadRequestException(
          dto.benchAthleteIds
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

    const startingIds = new Set(dto.startingAthleteIds);
    const teamColor = dto.teamColor ?? team.primaryColor ?? null;
    const matchValues = {
      opponentName,
      opponentCompetitionTeamId: competitionOpponent?.id ?? null,
      isHome: dto.isHome,
      gamePlanId: dto.gamePlanId ?? null,
      gamePlanSnapshot: gamePlan
        ? {
            name: gamePlan.name,
            formationId: gamePlan.formationId,
            assignments: gamePlan.assignments,
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
      return existingMatch;
    }

    const [match] = await this.databaseService.database
      .insert(matches)
      .values({
        eventId: event.id,
        competitionId: event.competitionId,
        opponentCompetitionTeamId: matchValues.opponentCompetitionTeamId,
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
      if (concurrentMatch) return concurrentMatch;
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
      .select({ id: competitions.id })
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
