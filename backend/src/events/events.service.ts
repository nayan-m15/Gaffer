import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNull, notInArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  events,
  lineups,
  matches,
  opponentMatchPlayers,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateEventDto,
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
  ) {}

  async create(userId: string, dto: CreateEventDto) {
    const team = await this.requireTeam(userId);

    const [event] = await this.databaseService.database
      .insert(events)
      .values({
        teamId: team.id,
        title: dto.title,
        type: dto.type,
        scheduledAt: new Date(dto.scheduledAt),
        location: dto.location,
        notes: dto.notes,
      })
      .returning();

    return event;
  }

  async list(userId: string) {
    const team = await this.requireTeam(userId);

    const rows = await this.databaseService.database
      .select({
        event: events,
        matchId: matches.id,
      })
      .from(events)
      .leftJoin(matches, eq(matches.eventId, events.id))
      .where(eq(events.teamId, team.id))
      .orderBy(asc(events.scheduledAt));

    return rows.map((row) => ({
      ...row.event,
      matchId: row.matchId,
    }));
  }

  async findOne(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    return this.requireEvent(team.id, eventId);
  }

  async update(userId: string, eventId: string, dto: UpdateEventDto) {
    const team = await this.requireTeam(userId);
    await this.requireEvent(team.id, eventId);

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
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, eventId), eq(events.teamId, team.id)))
      .returning();

    return event;
  }

  async cancel(userId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    await this.requireEvent(team.id, eventId);

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

    if (this.isBeforeMatchDay(event.scheduledAt)) {
      throw new ForbiddenException(
        'Matches cannot be started before match day.',
      );
    }

    if (dto.lineupId) {
      await this.requireTeamLineup(team.id, dto.lineupId);
    }

    const teamAthletes = await this.databaseService.database
      .select()
      .from(athletes)
      .where(and(eq(athletes.teamId, team.id), isNull(athletes.archivedAt)));

    const teamAthleteIds = new Set(teamAthletes.map((athlete) => athlete.id));
    const requestedIds = dto.benchAthleteIds
      ? [...dto.startingAthleteIds, ...dto.benchAthleteIds]
      : dto.startingAthleteIds;

    for (const athleteId of requestedIds) {
      if (!teamAthleteIds.has(athleteId)) {
        throw new BadRequestException(
          dto.benchAthleteIds
            ? 'One or more selected athletes are not on this team.'
            : 'One or more starting athletes are not on this team.',
        );
      }
    }

    const startingIds = new Set(dto.startingAthleteIds);
    const teamColor = dto.teamColor ?? team.primaryColor ?? null;
    const matchValues = {
      opponentName: dto.opponentName,
      isHome: dto.isHome,
      lineupId: dto.lineupId ?? null,
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

    let match = existingMatch;
    if (match) {
      const [updated] = await this.databaseService.database
        .update(matches)
        .set(matchValues)
        .where(eq(matches.id, match.id))
        .returning();
      match = updated;
    } else {
      const [created] = await this.databaseService.database
        .insert(matches)
        .values({
          eventId: event.id,
          opponentName: matchValues.opponentName,
          isHome: matchValues.isHome,
          lineupId: matchValues.lineupId,
          opponentSquadVisibility: matchValues.opponentSquadVisibility,
          teamColor: matchValues.teamColor,
          opponentColor: matchValues.opponentColor,
        })
        .returning();
      match = created;
    }

    if (!match) {
      throw new NotFoundException('Event not found.');
    }

    const squadAthletes = dto.benchAthleteIds
      ? teamAthletes.filter((athlete) => requestedIds.includes(athlete.id))
      : teamAthletes;

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
      })),
    );
  }

  private async requireTeamLineup(teamId: string, lineupId: string) {
    const [lineup] = await this.databaseService.database
      .select({ id: lineups.id })
      .from(lineups)
      .where(and(eq(lineups.id, lineupId), eq(lineups.teamId, teamId)))
      .limit(1);

    if (!lineup) {
      throw new BadRequestException('Lineup not found.');
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
