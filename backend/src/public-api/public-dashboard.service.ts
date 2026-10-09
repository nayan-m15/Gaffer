import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { calculateCompetitionStandings } from '../common/competition-standings';
import {
  athleteMatchStats,
  athletes,
  competitions,
  competitionTeams,
  competitionFixtures,
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
  eventType: 'goal' | 'assist' | 'yellow_card' | 'red_card' | 'goalkeeper_save',
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

  async getPlayers(query: PublicPlayersQuery) {
    const conditions: SQL[] = [isNull(athletes.archivedAt)];
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
        started: athleteMatchStats.started,
        goals: loggedEventCount('goal'),
        assists: loggedEventCount('assist'),
        saves: loggedEventCount('goalkeeper_save'),
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
      .where(and(...matchConditions))
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
          starts: number;
          minutesPlayed: number;
          goals: number;
          assists: number;
          saves: number;
          yellowCards: number;
          redCards: number;
        };
      }
    >();

    const addPlayerStatistics = (row: (typeof rows)[number]) => {
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
            starts: 0,
            minutesPlayed: 0,
            goals: 0,
            assists: 0,
            saves: 0,
            yellowCards: 0,
            redCards: 0,
          },
        };
        byAthlete.set(row.id, player);
      }

      if (row.matchId && row.eventStatus === 'completed') {
        if (row.appeared) player.statistics.appearances += 1;
        if (row.started) player.statistics.starts += 1;
        player.statistics.minutesPlayed += row.minutesPlayed ?? 0;
        player.statistics.goals += row.goals;
        player.statistics.assists += row.assists;
        player.statistics.saves += row.saves;
        player.statistics.yellowCards += row.yellowCards;
        player.statistics.redCards += row.redCards;
      }
    };
    rows.forEach(addPlayerStatistics);

    return page.map(({ id }) => byAthlete.get(id)!);
  }

  /** Public generated fixtures, including knockout cup rounds and unlinked opponents. */
  async getCompetitionFixtures(query: PublicDashboardQuery) {
    const conditions: SQL[] = [];
    if (query.competitionId) conditions.push(eq(competitions.id, query.competitionId));
    if (query.seasonId) conditions.push(eq(competitions.seasonId, query.seasonId));
    if (query.teamId) conditions.push(sql`exists (
      select 1 from ${competitionTeams} ct
      where ct.competition_id = ${competitions.id} and ct.team_id = ${query.teamId}
    )`);
    const rows = await this.databaseService.database
      .select({
        id: competitionFixtures.id,
        competitionId: competitions.id,
        competitionName: competitions.name,
        competitionType: competitions.type,
        stage: competitionFixtures.stage,
        round: competitionFixtures.round,
        position: competitionFixtures.position,
        scheduledAt: competitionFixtures.scheduledAt,
        status: competitionFixtures.status,
        homeTeamId: competitionFixtures.homeCompetitionTeamId,
        awayTeamId: competitionFixtures.awayCompetitionTeamId,
        homeScore: competitionFixtures.homeScore,
        awayScore: competitionFixtures.awayScore,
        homePenaltyScore: competitionFixtures.homePenaltyScore,
        awayPenaltyScore: competitionFixtures.awayPenaltyScore,
        winnerTeamId: competitionFixtures.winnerCompetitionTeamId,
      })
      .from(competitionFixtures)
      .innerJoin(competitions, eq(competitionFixtures.competitionId, competitions.id))
      .where(and(...conditions))
      .orderBy(asc(competitions.name), asc(competitionFixtures.stage), asc(competitionFixtures.round), asc(competitionFixtures.position));
    const ids = [...new Set(rows.map((row) => row.competitionId))];
    if (!ids.length) return [];
    const participants = await this.databaseService.database
      .select({ id: competitionTeams.id, competitionId: competitionTeams.competitionId, name: competitionTeams.displayName })
      .from(competitionTeams)
      .where(inArray(competitionTeams.competitionId, ids));
    const names = new Map(participants.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      ...row,
      homeTeamName: row.homeTeamId ? names.get(row.homeTeamId) ?? 'TBD' : 'TBD',
      awayTeamName: row.awayTeamId ? names.get(row.awayTeamId) ?? 'TBD' : 'TBD',
      winnerTeamName: row.winnerTeamId ? names.get(row.winnerTeamId) ?? null : null,
    }));
  }

  async getTeamStatistics(query: PublicDashboardQuery) {
    const conditions: SQL[] = [];
    if (query.competitionId) conditions.push(eq(competitions.id, query.competitionId));
    if (query.seasonId) conditions.push(eq(competitions.seasonId, query.seasonId));
    if (query.teamId) conditions.push(sql`exists (
      select 1 from ${competitionTeams} ct
      where ct.competition_id = ${competitions.id} and ct.team_id = ${query.teamId}
    )`);
    const competitionRows = await this.databaseService.database
      .select({ id: competitions.id, name: competitions.name, type: competitions.type,
        format: competitions.format, pointsWin: competitions.pointsWin,
        pointsDraw: competitions.pointsDraw, pointsLoss: competitions.pointsLoss,
        teamId: teams.id, teamName: teams.name,
        seasonId: seasons.id, seasonName: seasons.name })
      .from(competitions)
      .innerJoin(teams, eq(competitions.teamId, teams.id))
      .leftJoin(seasons, eq(competitions.seasonId, seasons.id))
      .where(and(...conditions))
      .orderBy(asc(competitions.name));
    if (!competitionRows.length) return [];
    const ids = competitionRows.map((row) => row.id);
    const [participants, baseline, fixtures] = await Promise.all([
      this.databaseService.database.select({ id: competitionTeams.id,
        competitionId: competitionTeams.competitionId, teamId: competitionTeams.teamId,
        displayName: competitionTeams.displayName,
        originalDisplayName: competitionTeams.originalDisplayName })
        .from(competitionTeams).where(inArray(competitionTeams.competitionId, ids)),
      this.databaseService.database.select({ id: standings.id,
        competitionId: standings.competitionId, teamName: standings.teamName,
        played: standings.played, won: standings.won, drawn: standings.drawn,
        lost: standings.lost, goalsFor: standings.goalsFor,
        goalsAgainst: standings.goalsAgainst, points: standings.points })
        .from(standings).where(inArray(standings.competitionId, ids)),
      this.databaseService.database.select({ id: competitionFixtures.id,
        competitionId: competitionFixtures.competitionId, stage: competitionFixtures.stage,
        status: competitionFixtures.status,
        homeCompetitionTeamId: competitionFixtures.homeCompetitionTeamId,
        awayCompetitionTeamId: competitionFixtures.awayCompetitionTeamId,
        homeScore: competitionFixtures.homeScore, awayScore: competitionFixtures.awayScore })
        .from(competitionFixtures).where(inArray(competitionFixtures.competitionId, ids)),
    ]);
    return competitionRows.flatMap((competition) => {
      // Pure knockout cups have a bracket rather than a league table.
      if (competition.format === 'knockout') return [];
      const competitionFixturesRows = fixtures.filter((row) => row.competitionId === competition.id);
      const results = competitionFixturesRows
        .filter((row) => row.status === 'completed' &&
          (competition.format !== 'league_knockout' || row.stage === 'league') &&
          row.homeCompetitionTeamId && row.awayCompetitionTeamId &&
          row.homeScore !== null && row.awayScore !== null)
        .map((row) => ({ homeCompetitionTeamId: row.homeCompetitionTeamId!,
          awayCompetitionTeamId: row.awayCompetitionTeamId!,
          homeScore: row.homeScore!, awayScore: row.awayScore! }));
      return calculateCompetitionStandings(competition.id,
        participants.filter((row) => row.competitionId === competition.id),
        results, query.teamId ?? null,
        baseline.filter((row) => row.competitionId === competition.id),
        { pointsWin: competition.pointsWin, pointsDraw: competition.pointsDraw,
          pointsLoss: competition.pointsLoss }).map((row) => ({
          ...row, goalDifference: row.goalsFor - row.goalsAgainst,
          ownerTeam: { id: competition.teamId, name: competition.teamName },
          competition: { id: competition.id, name: competition.name, type: competition.type },
          season: competition.seasonId ? { id: competition.seasonId, name: competition.seasonName! } : null,
        }));
    });
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
