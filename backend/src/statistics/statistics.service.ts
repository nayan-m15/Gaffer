import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { zodValidate } from '../common/zod-validate';
import {
  athletes,
  athleteMatchStats,
  competitions,
  events,
  matchEvents,
  matches,
  standings,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateCompetitionDto,
  CreateStandingDto,
  UpdateCompetitionDto,
  UpdateStandingDto,
} from './statistics.schemas';
import { createStandingSchema } from './statistics.schemas';

/** Points awarded per match result. Centralised so the scoring system is easy to change. */
const WIN_POINTS = 3;
const DRAW_POINTS = 1;
const LOSS_POINTS = 0;

function loggedEventCount(
  eventType: 'goal' | 'assist' | 'yellow_card' | 'red_card',
) {
  return sql<number>`coalesce((
    select count(*)::int
    from ${matchEvents}
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
 * Read-only match analytics plus manual standings CRUD for a coach's team.
 *
 * Every query is scoped to the team resolved from `TeamsService.findTeamForUser`.
 * `matches` and `athleteMatchStats` are written by a separate live match-logging
 * feature — this service only reads from them. `standings` is manually entered
 * by the coach because the app has no way to track other teams' results.
 */
@Injectable()
export class StatisticsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  /* ── Read endpoints ─────────────────────────────────────────────────────── */

  /**
   * Team-wide season overview. When `competitionId` is provided every
   * aggregate is scoped to that single competition instead of the whole season.
   */
  async getOverview(userId: string, competitionId?: string) {
    const team = await this.requireTeam(userId);

    const matchConditions = [
      eq(events.teamId, team.id),
      eq(events.status, 'completed'),
    ];
    if (competitionId) {
      matchConditions.push(eq(matches.competitionId, competitionId));
    }

    const teamMatches = await this.databaseService.database
      .select({
        matchId: matches.id,
        eventId: matches.eventId,
        date: events.scheduledAt,
        opponent: matches.opponentName,
        isHome: matches.isHome,
        teamScore: matchGoalCount('own'),
        opponentScore: matchGoalCount('opponent'),
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(and(...matchConditions))
      .orderBy(asc(events.scheduledAt));

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;
    let points = 0;

    const trends = teamMatches.map((m) => {
      const gf = m.teamScore;
      const ga = m.opponentScore;
      let result: 'W' | 'D' | 'L';
      let matchPoints: number;

      if (gf > ga) {
        result = 'W';
        wins += 1;
        matchPoints = WIN_POINTS;
      } else if (gf === ga) {
        result = 'D';
        draws += 1;
        matchPoints = DRAW_POINTS;
      } else {
        result = 'L';
        losses += 1;
        matchPoints = LOSS_POINTS;
      }

      goalsFor += gf;
      goalsAgainst += ga;
      if (ga === 0) cleanSheets += 1;
      points += matchPoints;

      return {
        matchId: m.matchId,
        eventId: m.eventId,
        date: m.date.toISOString(),
        opponent: m.opponent,
        isHome: m.isHome,
        result,
        goalsFor: gf,
        goalsAgainst: ga,
        points: matchPoints,
      };
    });

    const matchesPlayed = teamMatches.length;

    // Player-level aggregation across the same set of matches
    const playerConditions = [
      eq(athletes.teamId, team.id),
      eq(events.status, 'completed'),
    ];
    if (competitionId) {
      playerConditions.push(eq(matches.competitionId, competitionId));
    }

    const statsRows = await this.databaseService.database
      .select({
        athleteId: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        goals: loggedEventCount('goal'),
        assists: loggedEventCount('assist'),
        yellowCards: loggedEventCount('yellow_card'),
        redCards: loggedEventCount('red_card'),
        appeared: appearedInMatch(),
      })
      .from(athleteMatchStats)
      .innerJoin(matches, eq(athleteMatchStats.matchId, matches.id))
      .innerJoin(events, eq(matches.eventId, events.id))
      .innerJoin(athletes, eq(athleteMatchStats.athleteId, athletes.id))
      .where(and(...playerConditions));

    const playerMap = new Map<
      string,
      {
        athleteId: string;
        name: string;
        appearances: number;
        goals: number;
        assists: number;
        yellowCards: number;
        redCards: number;
      }
    >();

    for (const row of statsRows) {
      let entry = playerMap.get(row.athleteId);
      if (!entry) {
        entry = {
          athleteId: row.athleteId,
          name: `${row.firstName} ${row.lastName}`,
          appearances: 0,
          goals: 0,
          assists: 0,
          yellowCards: 0,
          redCards: 0,
        };
        playerMap.set(row.athleteId, entry);
      }
      if (row.appeared) entry.appearances += 1;
      entry.goals += row.goals;
      entry.assists += row.assists;
      entry.yellowCards += row.yellowCards;
      entry.redCards += row.redCards;
    }

    const players = Array.from(playerMap.values()).sort(
      (a, b) =>
        b.goals - a.goals ||
        b.assists - a.assists ||
        a.name.localeCompare(b.name),
    );

    return {
      matchesPlayed,
      wins,
      draws,
      losses,
      winRate: matchesPlayed > 0 ? wins / matchesPlayed : 0,
      goalsFor,
      goalsAgainst,
      goalDifference: goalsFor - goalsAgainst,
      cleanSheets,
      points,
      avgGoalsFor: matchesPlayed > 0 ? goalsFor / matchesPlayed : 0,
      avgGoalsAgainst: matchesPlayed > 0 ? goalsAgainst / matchesPlayed : 0,
      trends,
      players,
    };
  }

  /** Season totals and match-by-match breakdown for a single athlete. */
  async getAthleteStatistics(userId: string, athleteId: string) {
    const team = await this.requireTeam(userId);

    const [athlete] = await this.databaseService.database
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        position: athletes.position,
        squadNumber: athletes.squadNumber,
      })
      .from(athletes)
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, team.id),
          isNull(athletes.archivedAt),
        ),
      )
      .limit(1);

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return this.aggregateAthleteStatistics(athlete);
  }

  /**
   * Season totals and match-by-match breakdown for an already-verified
   * athlete row. Shared with the player module, which verifies access via
   * the athlete claim instead of a coach's team.
   */
  async aggregateAthleteStatistics(athlete: {
    id: string;
    firstName: string;
    lastName: string;
    position: string | null;
    squadNumber: number | null;
  }) {
    const athleteId = athlete.id;

    const statsRows = await this.databaseService.database
      .select({
        matchId: matches.id,
        eventId: matches.eventId,
        opponentName: matches.opponentName,
        teamScore: matchGoalCount('own'),
        opponentScore: matchGoalCount('opponent'),
        date: events.scheduledAt,
        started: athleteMatchStats.started,
        appeared: appearedInMatch(),
        minutesPlayed: athleteMatchStats.minutesPlayed,
        goals: loggedEventCount('goal'),
        assists: loggedEventCount('assist'),
        yellowCards: loggedEventCount('yellow_card'),
        redCards: loggedEventCount('red_card'),
      })
      .from(athleteMatchStats)
      .innerJoin(matches, eq(athleteMatchStats.matchId, matches.id))
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(
        and(
          eq(athleteMatchStats.athleteId, athleteId),
          eq(events.status, 'completed'),
        ),
      )
      .orderBy(asc(events.scheduledAt));

    let appearances = 0;
    let starts = 0;
    let goals = 0;
    let assists = 0;
    let yellowCards = 0;
    let redCards = 0;

    const matchesBreakdown = statsRows.map((row) => {
      if (row.appeared) appearances += 1;
      if (row.started) starts += 1;
      goals += row.goals;
      assists += row.assists;
      yellowCards += row.yellowCards;
      redCards += row.redCards;

      const gf = row.teamScore;
      const ga = row.opponentScore;
      let result: 'W' | 'D' | 'L';
      if (gf > ga) result = 'W';
      else if (gf === ga) result = 'D';
      else result = 'L';

      return {
        matchId: row.matchId,
        eventId: row.eventId,
        date: row.date.toISOString(),
        opponent: row.opponentName,
        result,
        teamScore: gf,
        opponentScore: ga,
        started: row.started,
        minutesPlayed: row.minutesPlayed,
        goals: row.goals,
        assists: row.assists,
        yellowCards: row.yellowCards,
        redCards: row.redCards,
      };
    });

    return {
      athleteId: athlete.id,
      name: `${athlete.firstName} ${athlete.lastName}`,
      position: athlete.position,
      squadNumber: athlete.squadNumber,
      appearances,
      starts,
      goals,
      assists,
      yellowCards,
      redCards,
      matches: matchesBreakdown,
    };
  }
  /** All competitions for the team, each with its standings rows attached. */
  async getCompetitions(userId: string) {
    const team = await this.requireTeam(userId);
    return this.getCompetitionsForTeam(team.id);
  }

  /**
   * Competitions and their standings for an already-resolved team — shared
   * with the player module, which scopes by the claimed athlete's team
   * instead of a coach's owned team.
   */
  async getCompetitionsForTeam(teamId: string) {
    const teamCompetitions = await this.databaseService.database
      .select()
      .from(competitions)
      .where(eq(competitions.teamId, teamId))
      .orderBy(asc(competitions.name));

    if (teamCompetitions.length === 0) {
      return [];
    }

    const competitionIds = teamCompetitions.map((c) => c.id);
    const teamStandings = await this.databaseService.database
      .select()
      .from(standings)
      .where(inArray(standings.competitionId, competitionIds))
      .orderBy(asc(standings.position));

    return teamCompetitions.map((competition) => ({
      ...competition,
      standings: teamStandings.filter(
        (s) => s.competitionId === competition.id,
      ),
    }));
  }

  /* ── Standings / competitions CRUD ──────────────────────────────────────── */

  async createCompetition(userId: string, dto: CreateCompetitionDto) {
    const team = await this.requireTeam(userId);

    const [competition] = await this.databaseService.database
      .insert(competitions)
      .values({ teamId: team.id, ...dto })
      .returning();

    return competition;
  }

  async updateCompetition(
    userId: string,
    competitionId: string,
    dto: UpdateCompetitionDto,
  ) {
    const team = await this.requireTeam(userId);
    await this.requireCompetition(team.id, competitionId);

    const [competition] = await this.databaseService.database
      .update(competitions)
      .set({ ...dto, updatedAt: new Date() })
      .where(
        and(
          eq(competitions.id, competitionId),
          eq(competitions.teamId, team.id),
        ),
      )
      .returning();

    return competition;
  }

  async deleteCompetition(userId: string, competitionId: string) {
    const team = await this.requireTeam(userId);
    await this.requireCompetition(team.id, competitionId);

    await this.databaseService.database
      .delete(competitions)
      .where(
        and(
          eq(competitions.id, competitionId),
          eq(competitions.teamId, team.id),
        ),
      );

    return { success: true };
  }

  async createStanding(
    userId: string,
    competitionId: string,
    dto: CreateStandingDto,
  ) {
    const team = await this.requireTeam(userId);
    await this.requireCompetition(team.id, competitionId);

    const [standing] = await this.databaseService.database
      .insert(standings)
      .values({ competitionId, ...dto })
      .returning();

    return standing;
  }

  async updateStanding(
    userId: string,
    standingId: string,
    dto: UpdateStandingDto,
  ) {
    const team = await this.requireTeam(userId);
    const existing = await this.requireStanding(team.id, standingId);

    zodValidate(createStandingSchema, {
      teamName: dto.teamName ?? existing.teamName,
      position: dto.position ?? existing.position,
      played: dto.played ?? existing.played,
      won: dto.won ?? existing.won,
      drawn: dto.drawn ?? existing.drawn,
      lost: dto.lost ?? existing.lost,
      goalsFor: dto.goalsFor ?? existing.goalsFor,
      goalsAgainst: dto.goalsAgainst ?? existing.goalsAgainst,
      points: dto.points ?? existing.points,
      isOwnTeam: dto.isOwnTeam ?? existing.isOwnTeam,
    });

    const [standing] = await this.databaseService.database
      .update(standings)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(standings.id, standingId))
      .returning();

    return standing;
  }

  async deleteStanding(userId: string, standingId: string) {
    const team = await this.requireTeam(userId);
    await this.requireStanding(team.id, standingId);

    await this.databaseService.database
      .delete(standings)
      .where(eq(standings.id, standingId));

    return { success: true };
  }

  /* ── Private helpers ───────────────────────────────────────────────────── */

  private async requireTeam(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);
    if (!team) {
      throw new ForbiddenException('No team associated with this account.');
    }
    return team;
  }

  private async requireCompetition(teamId: string, competitionId: string) {
    const [competition] = await this.databaseService.database
      .select()
      .from(competitions)
      .where(
        and(
          eq(competitions.id, competitionId),
          eq(competitions.teamId, teamId),
        ),
      )
      .limit(1);

    if (!competition) {
      throw new NotFoundException('Competition not found.');
    }

    return competition;
  }

  /**
   * Verifies a standing belongs to a competition owned by the coach's team
   * before any update or delete. Returns silently — callers re-query by ID
   * for the actual mutation so the team check is enforced once here.
   */
  private async requireStanding(teamId: string, standingId: string) {
    const [row] = await this.databaseService.database
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
        isOwnTeam: standings.isOwnTeam,
      })
      .from(standings)
      .innerJoin(competitions, eq(standings.competitionId, competitions.id))
      .where(and(eq(standings.id, standingId), eq(competitions.teamId, teamId)))
      .limit(1);

    if (!row) {
      throw new NotFoundException('Standing not found.');
    }

    return row;
  }
}
