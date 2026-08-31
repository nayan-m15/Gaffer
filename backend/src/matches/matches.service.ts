import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  competitions,
  events,
  matchEvents,
  matches,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateMatchLogEventDto,
  UpdateMatchLogEventDto,
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

    return {
      ...match,
      eventTitle: event.title,
      eventStatus: event.status,
      eventScheduledAt: event.scheduledAt,
      eventLocation: event.location,
      competitionName,
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
        eventType: matchEvents.eventType,
        minute: matchEvents.minute,
        detail: matchEvents.detail,
        loggedByUserId: matchEvents.loggedByUserId,
        manuallyAdjusted: matchEvents.manuallyAdjusted,
        createdAt: matchEvents.createdAt,
        updatedAt: matchEvents.updatedAt,
        athleteFirstName: athletes.firstName,
        athleteLastName: athletes.lastName,
        athleteSquadNumber: athletes.squadNumber,
        athletePosition: athletes.position,
      })
      .from(matchEvents)
      .leftJoin(athletes, eq(matchEvents.athleteId, athletes.id))
      .where(eq(matchEvents.matchId, matchId))
      .orderBy(desc(matchEvents.minute), desc(matchEvents.createdAt));

    return rows.map((row) => ({
      id: row.id,
      matchId: row.matchId,
      athleteId: row.athleteId,
      team: row.team,
      opponentLabel: row.opponentLabel,
      eventType: row.eventType,
      minute: row.minute,
      detail: row.detail,
      loggedByUserId: row.loggedByUserId,
      manuallyAdjusted: row.manuallyAdjusted,
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
    }));
  }

  async logEvent(userId: string, matchId: string, dto: CreateMatchLogEventDto) {
    const team = await this.requireTeam(userId);
    const { match } = await this.requireMatch(team.id, matchId);

    if (dto.athleteId) {
      await this.requireTeamAthlete(team.id, dto.athleteId);
    }

    const [created] = await this.databaseService.database
      .insert(matchEvents)
      .values({
        matchId: match.id,
        athleteId: dto.athleteId,
        team: dto.team,
        opponentLabel: dto.opponentLabel,
        eventType: dto.eventType,
        minute: dto.minute,
        detail: dto.detail,
        loggedByUserId: userId,
      })
      .returning();

    if (dto.eventType === 'goal') {
      await this.adjustScore(match.id, dto.team, 1);
    }

    return created;
  }

  async updateEvent(
    userId: string,
    matchId: string,
    eventId: string,
    dto: UpdateMatchLogEventDto,
  ) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);
    const logged = await this.requireMatchEvent(matchId, eventId);

    if (dto.athleteId) {
      await this.requireTeamAthlete(team.id, dto.athleteId);
    }

    const [updated] = await this.databaseService.database
      .update(matchEvents)
      .set({
        ...(dto.athleteId !== undefined ? { athleteId: dto.athleteId } : {}),
        ...(dto.opponentLabel !== undefined
          ? { opponentLabel: dto.opponentLabel }
          : {}),
        ...(dto.minute !== undefined ? { minute: dto.minute } : {}),
        ...(dto.eventType !== undefined ? { eventType: dto.eventType } : {}),
        ...(dto.detail !== undefined ? { detail: dto.detail } : {}),
        manuallyAdjusted: true,
        updatedAt: new Date(),
      })
      .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Match event not found.');
    }

    if (dto.eventType !== undefined && dto.eventType !== logged.eventType) {
      if (logged.eventType === 'goal') {
        await this.adjustScore(matchId, logged.team, -1);
      }
      if (dto.eventType === 'goal') {
        await this.adjustScore(matchId, logged.team, 1);
      }
    }

    return updated;
  }

  async deleteEvent(userId: string, matchId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    await this.requireMatch(team.id, matchId);
    const logged = await this.requireMatchEvent(matchId, eventId);

    if (logged.eventType === 'goal') {
      await this.adjustScore(matchId, logged.team, -1);
    }

    const [deleted] = await this.databaseService.database
      .delete(matchEvents)
      .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
      .returning();

    if (!deleted) {
      throw new NotFoundException('Match event not found.');
    }

    return deleted;
  }

  async finish(userId: string, matchId: string) {
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);

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

    return { ...match, eventTitle: updated.title, eventStatus: updated.status };
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

  private async requireTeamAthlete(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(eq(athletes.id, athleteId), eq(athletes.teamId, teamId)))
      .limit(1);

    if (!athlete) {
      throw new BadRequestException('Athlete is not on this team.');
    }
  }

  private async adjustScore(
    matchId: string,
    team: 'own' | 'opponent',
    delta: number,
  ) {
    const scoreSql =
      team === 'own'
        ? sql`GREATEST(${matches.teamScore} + ${delta}, 0)`
        : sql`GREATEST(${matches.opponentScore} + ${delta}, 0)`;

    await this.databaseService.database
      .update(matches)
      .set({
        ...(team === 'own'
          ? { teamScore: scoreSql }
          : { opponentScore: scoreSql }),
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId));
  }
}
