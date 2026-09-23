import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  competitions,
  competitionTeams,
  events,
  matchEvents,
  matches,
  seasons,
  standings,
  teams,
} from '../database/schema';
import type {
  PublicDashboardQuery,
  PublicMatchesQuery,
  PublicPlayersQuery,
} from './public-api.schemas';

function loggedEventCount(
  eventType: 'goal' | 'assist' | 'yellow_card' | 'red_card',
) {
  return sql<number>`coalesce((
    select count(*)::int from ${matchEvents}
    where ${matchEvents.matchId} = ${athleteMatchStats.matchId}
      and ${matchEvents.athleteId} = ${athleteMatchStats.athleteId}
      and ${matchEvents.team} = 'own'
      and ${matchEvents.eventType} = ${eventType}
  ), 0)`;
}

function matchGoalCount(team: 'own' | 'opponent') {
  return sql<number>`coalesce((
    select count(*)::int from ${matchEvents}
    where ${matchEvents.matchId} = ${matches.id}
      and ${matchEvents.team} = ${team}
      and ${matchEvents.eventType} = 'goal'
  ), 0)`;
}

function appearedInMatch() {
  return sql<boolean>`${athleteMatchStats.started} or exists (
    select 1 from ${matchEvents}
    where ${matchEvents.matchId} = ${athleteMatchStats.matchId}
      and ${matchEvents.team} = 'own'
      and ${matchEvents.eventType} = 'substitution'
      and ${matchEvents.detail} = ${athleteMatchStats.athleteId}::text
  )`;
}

/**
 * Read-only data source for the unauthenticated dashboard. Team sporting data
 * is public, while every query still selects an explicit allow-list so user,
 * contact, RSVP, notes, and authentication data never leave the database.
 */
@Injectable()
export class PublicDashboardService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getFilters() {
    const db = this.databaseService.database;
    const [teamRows, seasonRows, competitionRows, participantRows] =
      await Promise.all([
        db
          .select({ id: teams.id, name: teams.name })
          .from(teams)
          .orderBy(asc(teams.name)),
        db
          .select({
            id: seasons.id,
            name: seasons.name,
            teamId: seasons.teamId,
            startDate: seasons.startDate,
            endDate: seasons.endDate,
            isCurrent: seasons.isCurrent,
          })
          .from(seasons)
          .innerJoin(teams, eq(seasons.teamId, teams.id))
          .orderBy(asc(seasons.startDate), asc(seasons.name)),
        db
          .select({
            id: competitions.id,
            name: competitions.name,
            type: competitions.type,
            teamId: competitions.teamId,
            seasonId: competitions.seasonId,
          })
          .from(competitions)
          .innerJoin(teams, eq(competitions.teamId, teams.id))
          .orderBy(asc(competitions.name)),
        db
          .select({
            competitionId: competitionTeams.competitionId,
            teamId: competitionTeams.teamId,
          })
          .from(competitionTeams),
      ]);

    const teamIdsByCompetition = new Map<string, string[]>();
    for (const participant of participantRows) {
      if (!participant.teamId) continue;
      const teamIds =
        teamIdsByCompetition.get(participant.competitionId) ?? [];
      teamIds.push(participant.teamId);
      teamIdsByCompetition.set(participant.competitionId, teamIds);
    }

    return {
      teams: teamRows,
      seasons: seasonRows,
      competitions: competitionRows.map((competition) => ({
        ...competition,
        teamIds: teamIdsByCompetition.get(competition.id) ?? [
          competition.teamId,
        ],
      })),
    };
  }

  async getMatches(query: PublicMatchesQuery) {
    const conditions: SQL[] = [eq(events.type, 'match')];
    this.addCommonConditions(conditions, query);
    if (query.status) conditions.push(eq(events.status, query.status));

    return this.databaseService.database
      .select({
        id: matches.id,
        eventId: events.id,
        title: events.title,
        status: events.status,
        scheduledAt: events.scheduledAt,
        location: events.location,
        opponentName: matches.opponentName,
        isHome: matches.isHome,
        teamScore: matchGoalCount('own'),
        opponentScore: matchGoalCount('opponent'),
        team: { id: teams.id, name: teams.name },
        competition: {
          id: competitions.id,
          name: competitions.name,
          type: competitions.type,
        },
        season: { id: seasons.id, name: seasons.name },
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .innerJoin(teams, eq(events.teamId, teams.id))
      .leftJoin(competitions, eq(matches.competitionId, competitions.id))
      .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
      .where(and(...conditions))
      .orderBy(asc(events.scheduledAt))
      .limit(query.limit)
      .offset(query.offset);
  }

  async getPlayers(query: PublicPlayersQuery) {
    const conditions: SQL[] = [isNull(athletes.archivedAt)];
    this.addCommonConditions(conditions, query);

    const rows = await this.databaseService.database
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        position: athletes.position,
        squadNumber: athletes.squadNumber,
        teamId: teams.id,
        teamName: teams.name,
        matchId: athleteMatchStats.matchId,
        eventStatus: events.status,
        minutesPlayed: athleteMatchStats.minutesPlayed,
        appeared: appearedInMatch(),
        goals: loggedEventCount('goal'),
        assists: loggedEventCount('assist'),
        yellowCards: loggedEventCount('yellow_card'),
        redCards: loggedEventCount('red_card'),
      })
      .from(athletes)
      .innerJoin(teams, eq(athletes.teamId, teams.id))
      .leftJoin(athleteMatchStats, eq(athleteMatchStats.athleteId, athletes.id))
      .leftJoin(matches, eq(athleteMatchStats.matchId, matches.id))
      .leftJoin(events, eq(matches.eventId, events.id))
      .leftJoin(competitions, eq(matches.competitionId, competitions.id))
      .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
      .where(and(...conditions))
      .orderBy(
        asc(teams.name),
        asc(athletes.squadNumber),
        asc(athletes.lastName),
        asc(athletes.firstName),
      );

    const byAthlete = new Map<
      string,
      {
        id: string;
        firstName: string;
        lastName: string;
        position: string | null;
        squadNumber: number | null;
        team: { id: string; name: string };
        statistics: {
          appearances: number;
          minutesPlayed: number;
          goals: number;
          assists: number;
          yellowCards: number;
          redCards: number;
        };
      }
    >();

    for (const row of rows) {
      let player = byAthlete.get(row.id);
      if (!player) {
        player = {
          id: row.id,
          firstName: row.firstName,
          lastName: row.lastName,
          position: row.position,
          squadNumber: row.squadNumber,
          team: { id: row.teamId, name: row.teamName },
          statistics: {
            appearances: 0,
            minutesPlayed: 0,
            goals: 0,
            assists: 0,
            yellowCards: 0,
            redCards: 0,
          },
        };
        byAthlete.set(row.id, player);
      }

      if (row.matchId && row.eventStatus === 'completed') {
        if (row.appeared) player.statistics.appearances += 1;
        player.statistics.minutesPlayed += row.minutesPlayed ?? 0;
        player.statistics.goals += row.goals;
        player.statistics.assists += row.assists;
        player.statistics.yellowCards += row.yellowCards;
        player.statistics.redCards += row.redCards;
      }
    }

    return Array.from(byAthlete.values()).slice(
      query.offset,
      query.offset + query.limit,
    );
  }

  async getTeamStatistics(query: PublicDashboardQuery) {
    const conditions: SQL[] = [];
    if (query.teamId) {
      conditions.push(
        sql`exists (
          select 1 from ${competitionTeams}
          where ${competitionTeams.competitionId} = ${competitions.id}
            and ${competitionTeams.teamId} = ${query.teamId}
        )`,
      );
    }
    if (query.competitionId) {
      conditions.push(eq(competitions.id, query.competitionId));
    }
    if (query.seasonId)
      conditions.push(eq(competitions.seasonId, query.seasonId));

    const rows = await this.databaseService.database
      .select({
        id: standings.id,
        teamName: standings.teamName,
        position: standings.position,
        played: standings.played,
        won: standings.won,
        drawn: standings.drawn,
        lost: standings.lost,
        goalsFor: standings.goalsFor,
        goalsAgainst: standings.goalsAgainst,
        points: standings.points,
        isOwnTeam: query.teamId
          ? sql<boolean>`lower(${standings.teamName}) = lower(coalesce((
              select ${competitionTeams.displayName}
              from ${competitionTeams}
              where ${competitionTeams.competitionId} = ${competitions.id}
                and ${competitionTeams.teamId} = ${query.teamId}
              limit 1
            ), ''))`
          : sql<boolean>`false`,
        ownerTeam: { id: teams.id, name: teams.name },
        competition: {
          id: competitions.id,
          name: competitions.name,
          type: competitions.type,
        },
        season: { id: seasons.id, name: seasons.name },
      })
      .from(standings)
      .innerJoin(competitions, eq(standings.competitionId, competitions.id))
      .innerJoin(teams, eq(competitions.teamId, teams.id))
      .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
      .where(and(...conditions))
      .orderBy(asc(competitions.name), asc(standings.position));

    return rows.map((row) => ({
      ...row,
      goalDifference: row.goalsFor - row.goalsAgainst,
    }));
  }

  private addCommonConditions(conditions: SQL[], query: PublicDashboardQuery) {
    if (query.teamId) conditions.push(eq(teams.id, query.teamId));
    if (query.competitionId) {
      conditions.push(eq(matches.competitionId, query.competitionId));
    }
    if (query.seasonId) conditions.push(eq(seasons.id, query.seasonId));

    // Competition-to-season is the canonical public filter relationship.
    // Unassigned matches stay out of a season-specific result.
  }
}
