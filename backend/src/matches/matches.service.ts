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
  opponentMatchPlayers,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateMatchLogEventDto,
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
    const [score] = await this.databaseService.database
      .select({
        teamScore: sql<number>`count(*) filter (where ${matchEvents.team} = 'own' and ${matchEvents.eventType} = 'goal')::int`,
        opponentScore: sql<number>`count(*) filter (where ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal')::int`,
      })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, match.id));

    return {
      ...match,
      teamScore: score?.teamScore ?? 0,
      opponentScore: score?.opponentScore ?? 0,
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
      .where(eq(matchEvents.matchId, matchId))
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
    const team = await this.requireTeam(userId);
    const { match, event } = await this.requireMatch(team.id, matchId);
    this.assertLive(event.status);

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

    const [created] = await this.databaseService.database
      .insert(matchEvents)
      .values({
        matchId: match.id,
        athleteId: dto.athleteId,
        team: dto.team,
        opponentLabel: attribution.opponentLabel ?? dto.opponentLabel,
        opponentPlayerId: attribution.opponentPlayerId,
        eventType: dto.eventType,
        minute: dto.minute,
        detail: dto.detail,
        loggedByUserId: userId,
        clientRequestId: dto.clientRequestId,
      })
      .onConflictDoNothing({
        target: [matchEvents.matchId, matchEvents.clientRequestId],
        where: sql`${matchEvents.clientRequestId} is not null`,
      })
      .returning();

    if (!created) {
      const [existing] = await this.databaseService.database
        .select()
        .from(matchEvents)
        .where(
          and(
            eq(matchEvents.matchId, match.id),
            eq(matchEvents.clientRequestId, dto.clientRequestId),
          ),
        )
        .limit(1);
      return existing;
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
        manuallyAdjusted: true,
        updatedAt: new Date(),
      })
      .where(and(eq(matchEvents.id, eventId), eq(matchEvents.matchId, matchId)))
      .returning();

    if (!updated) {
      throw new NotFoundException('Match event not found.');
    }

    return updated;
  }

  async deleteEvent(userId: string, matchId: string, eventId: string) {
    const team = await this.requireTeam(userId);
    const { event } = await this.requireMatch(team.id, matchId);
    this.assertEditable(event.status);

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
    const { event } = await this.requireMatch(team.id, matchId);
    this.assertLive(event.status);
    const [updated] = await this.databaseService.database
      .update(matches)
      .set({
        clockPeriod: dto.period,
        clockElapsedMs: dto.elapsedMs,
        clockStartedAt: dto.running ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(matches.id, matchId))
      .returning();
    return updated;
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
      if (team === 'opponent' && !opponentPlayerId) {
        throw new BadRequestException(
          'An outgoing opponent player is required.',
        );
      }
    }
  }
}
