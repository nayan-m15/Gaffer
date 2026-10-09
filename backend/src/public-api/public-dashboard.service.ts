import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
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
      const teamIds = teamIdsByCompetition.get(participant.competitionId) ?? [];
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
      .orderBy(asc(events.scheduledAt), asc(matches.id))
      .limit(query.limit)
      .offset(query.offset);
  }

  async getMatchSummary(query: Omit<PublicMatchesQuery, 'limit' | 'offset'>) {
    const conditions: SQL[] = [eq(events.type, 'match')];
    this.addCommonConditions(conditions, query);
    if (query.status) conditions.push(eq(events.status, query.status));
    const [summary] = await this.databaseService.database
      .select({
        total: sql<number>`count(*)::int`,
        cleanSheets: sql<number>`count(*) filter (where ${events.status} = 'completed' and not exists (
          select 1 from ${matchEvents} where ${matchEvents.matchId} = ${matches.id}
            and ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal'
        ))::int`,
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .innerJoin(teams, eq(events.teamId, teams.id))
      .leftJoin(competitions, eq(matches.competitionId, competitions.id))
      .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
      .where(and(...conditions));
    return summary;
  }

  async getPlayers(query: PublicPlayersQuery) {
    const conditions: SQL[] = [isNull(athletes.archivedAt)];
    if (query.search) {
      conditions.push(
        sql`strpos(lower(${athletes.firstName} || ' ' || ${athletes.lastName}), lower(${query.search})) > 0`,
      );
    }
    const positionPatterns = {
      FWD: '(FW|ST|ATT|FORWARD)',
      MID: '(MID|CAM|CDM|CM)',
      DEF: '(DEF|CB|LB|RB)',
      GK: '(GK|KEEP|GOAL)',
    };
    if (query.position && query.position !== 'ALL') {
      conditions.push(
        sql`upper(coalesce(${athletes.position}, '')) ~ ${positionPatterns[query.position]}`,
      );
    }
    if (query.teamId) conditions.push(eq(athletes.teamId, query.teamId));
    if (query.competitionId || query.seasonId) {
      conditions.push(sql`exists (
        select 1 from ${athleteMatchStats}
        inner join ${matches} on ${athleteMatchStats.matchId} = ${matches.id}
        left join ${competitions} on ${matches.competitionId} = ${competitions.id}
        where ${athleteMatchStats.athleteId} = ${athletes.id}
          ${query.competitionId ? sql`and ${matches.competitionId} = ${query.competitionId}` : sql``}
          ${query.seasonId ? sql`and ${competitions.seasonId} = ${query.seasonId}` : sql``}
      )`);
    }

    const page = await this.databaseService.database
      .select({ id: athletes.id })
      .from(athletes)
      .innerJoin(teams, eq(athletes.teamId, teams.id))
      .where(and(...conditions))
      .orderBy(
        asc(teams.name),
        asc(athletes.squadNumber),
        asc(athletes.lastName),
        asc(athletes.firstName),
        asc(athletes.id),
      )
      .limit(query.limit)
      .offset(query.offset);
    if (page.length === 0) return [];

    const matchConditions: SQL[] = [
      inArray(
        athletes.id,
        page.map((athlete) => athlete.id),
      ),
    ];
    if (query.competitionId) {
      matchConditions.push(eq(matches.competitionId, query.competitionId));
    }
    if (query.seasonId) matchConditions.push(eq(seasons.id, query.seasonId));

    const eventTotals = this.databaseService.database
      .select({
        matchId: matchEvents.matchId,
        athleteId: matchEvents.athleteId,
        goals:
          sql<number>`count(*) filter (where ${matchEvents.eventType} = 'goal')::int`.as(
            'goals',
          ),
        assists:
          sql<number>`count(*) filter (where ${matchEvents.eventType} = 'assist')::int`.as(
            'assists',
          ),
        yellowCards:
          sql<number>`count(*) filter (where ${matchEvents.eventType} = 'yellow_card')::int`.as(
            'yellow_cards',
          ),
        redCards:
          sql<number>`count(*) filter (where ${matchEvents.eventType} = 'red_card')::int`.as(
            'red_cards',
          ),
      })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.team, 'own'),
          inArray(
            matchEvents.athleteId,
            page.map(({ id }) => id),
          ),
        ),
      )
      .groupBy(matchEvents.matchId, matchEvents.athleteId)
      .as('event_totals');
    const completedSum = (
      value: SQL | typeof athleteMatchStats.minutesPlayed,
    ) =>
      sql<number>`coalesce(sum(case when ${events.status} = 'completed' then coalesce(${value}, 0) else 0 end), 0)::int`;
    const rows = await this.databaseService.database
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        position: athletes.position,
        squadNumber: athletes.squadNumber,
        teamId: teams.id,
        teamName: teams.name,
        appearances: completedSum(
          sql`case when ${appearedInMatch()} then 1 else 0 end`,
        ),
        minutesPlayed: completedSum(athleteMatchStats.minutesPlayed),
        // Drizzle renders SQL.Aliased fields without their subquery qualifier
        // inside select expressions. Legacy athlete_match_stats columns share
        // these names, so keep the event aggregate references explicit.
        goals: completedSum(sql`"event_totals"."goals"`),
        assists: completedSum(sql`"event_totals"."assists"`),
        yellowCards: completedSum(sql`"event_totals"."yellow_cards"`),
        redCards: completedSum(sql`"event_totals"."red_cards"`),
      })
      .from(athletes)
      .innerJoin(teams, eq(athletes.teamId, teams.id))
      .leftJoin(athleteMatchStats, eq(athleteMatchStats.athleteId, athletes.id))
      .leftJoin(matches, eq(athleteMatchStats.matchId, matches.id))
      .leftJoin(events, eq(matches.eventId, events.id))
      .leftJoin(competitions, eq(matches.competitionId, competitions.id))
      .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
      .leftJoin(
        eventTotals,
        and(
          eq(eventTotals.matchId, athleteMatchStats.matchId),
          eq(eventTotals.athleteId, athletes.id),
        ),
      )
      .where(and(...matchConditions))
      .groupBy(athletes.id, teams.id)
      .orderBy(
        asc(teams.name),
        asc(athletes.squadNumber),
        asc(athletes.lastName),
        asc(athletes.firstName),
        asc(athletes.id),
      );

    return rows.map((row) => ({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      position: row.position,
      squadNumber: row.squadNumber,
      team: { id: row.teamId, name: row.teamName },
      statistics: {
        appearances: row.appearances,
        minutesPlayed: row.minutesPlayed,
        goals: row.goals,
        assists: row.assists,
        yellowCards: row.yellowCards,
        redCards: row.redCards,
      },
    }));
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
