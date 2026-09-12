import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
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
import { SeasonsService } from '../seasons/seasons.service';
import type { SeasonWindow } from '../seasons/season-window';
import { TeamsService } from '../teams/teams.service';
import type {
  CompareAthletesDto,
  CreateCompetitionDto,
  CreateStandingDto,
  UpdateCompetitionDto,
  UpdateStandingDto,
} from './statistics.schemas';
import {
  buildTrends,
  matchResult,
  per90,
  perAppearance,
  summariseMatches,
} from './statistics.trends';
import { createStandingSchema } from './statistics.schemas';

/** Filters accepted by the team overview. */
export interface OverviewFilters {
  seasonId?: string;
  competitionId?: string;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

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
 * Grouped counterpart to `loggedEventCount`, for queries that already left-join
 * `match_events` and can count with a FILTER clause instead of a correlated
 * subquery per row.
 */
function countEvents(
  eventType: 'goal' | 'assist' | 'yellow_card' | 'red_card',
  onlyWithMinutes = false,
) {
  const minutesClause = onlyWithMinutes
    ? sql` and ${athleteMatchStats.minutesPlayed} is not null`
    : sql``;

  return sql<number>`count(*) filter (
    where ${matchEvents.eventType} = ${eventType}${minutesClause}
  )::int`;
}

/**
 * Season date-range predicates on the match's event. Bound as Date values so
 * the window is explicit and independent of the database session timezone.
 */
function windowConditions(window: SeasonWindow) {
  return [
    gte(events.scheduledAt, window.start),
    lte(events.scheduledAt, window.end),
  ];
}

function toSeasonSummary(season: {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}) {
  return {
    id: season.id,
    name: season.name,
    startDate: season.startDate,
    endDate: season.endDate,
    isCurrent: season.isCurrent,
  };
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
    private readonly seasonsService: SeasonsService,
  ) {}

  /* ── Read endpoints ─────────────────────────────────────────────────────── */

  /**
   * Team-wide overview plus season trends.
   *
   * `seasonId` narrows every aggregate to matches played inside that season's
   * date range; `competitionId` narrows to a single competition. Both are
   * optional and combine. With neither, the overview covers the team's whole
   * history — the default is deliberately unchanged so the player module and
   * existing clients keep their current behaviour.
   */
  async getOverview(userId: string, filters: OverviewFilters = {}) {
    const { seasonId, competitionId } = filters;
    const team = await this.requireTeam(userId);

    // Resolved only when asked for, so the unfiltered path issues exactly the
    // same queries in the same order as before.
    const resolved = seasonId
      ? await this.seasonsService.resolveSeasonWindow(team.id, seasonId)
      : null;

    const matchConditions = [
      eq(events.teamId, team.id),
      eq(events.status, 'completed'),
    ];
    if (competitionId) {
      matchConditions.push(eq(matches.competitionId, competitionId));
    }
    if (resolved) {
      matchConditions.push(...windowConditions(resolved.window));
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

    const { totals, entries: trends } = summariseMatches(teamMatches);
    const trendAnalysis = buildTrends(trends);

    // Player-level aggregation across the same set of matches
    const playerConditions = [
      eq(athletes.teamId, team.id),
      eq(events.status, 'completed'),
    ];
    if (competitionId) {
      playerConditions.push(eq(matches.competitionId, competitionId));
    }
    if (resolved) {
      playerConditions.push(...windowConditions(resolved.window));
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
      ...totals,
      trends,
      players,
      // Additive fields — everything above keeps the shape existing clients read.
      season: resolved ? toSeasonSummary(resolved.season) : null,
      rollingWindow: trendAnalysis.rollingWindow,
      form: trendAnalysis.form,
      periods: trendAnalysis.periods,
    };
  }

  /**
   * Side-by-side season stat lines for two or three athletes on the coach's team.
   *
   * Uses two grouped queries rather than the per-row `loggedEventCount`
   * subqueries: the appearance/minutes aggregate has to run over
   * `athlete_match_stats` alone, because joining `match_events` fans each match
   * out into one row per logged event and would multiply any minutes total.
   */
  async compareAthletes(userId: string, dto: CompareAthletesDto) {
    const team = await this.requireTeam(userId);

    const resolved = dto.seasonId
      ? await this.seasonsService.resolveSeasonWindow(team.id, dto.seasonId)
      : null;

    const athleteRows = await this.databaseService.database
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
          inArray(athletes.id, dto.athleteIds),
          eq(athletes.teamId, team.id),
          isNull(athletes.archivedAt),
        ),
      );

    // Doubles as the cross-team gate: an athlete on another team simply
    // does not come back.
    if (athleteRows.length !== dto.athleteIds.length) {
      throw new NotFoundException('One or more athletes were not found.');
    }

    const conditions = [
      inArray(athleteMatchStats.athleteId, dto.athleteIds),
      eq(events.status, 'completed'),
    ];
    if (resolved) {
      conditions.push(...windowConditions(resolved.window));
    }

    const appearanceRows = await this.databaseService.database
      .select({
        athleteId: athleteMatchStats.athleteId,
        appearances: sql<number>`count(*)::int`,
        starts: sql<number>`count(*) filter (where ${athleteMatchStats.started})::int`,
        minutesPlayed: sql<number>`coalesce(sum(${athleteMatchStats.minutesPlayed}), 0)::int`,
        matchesWithMinutes: sql<number>`count(*) filter (where ${athleteMatchStats.minutesPlayed} is not null)::int`,
      })
      .from(athleteMatchStats)
      .innerJoin(matches, eq(athleteMatchStats.matchId, matches.id))
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(and(...conditions))
      .groupBy(athleteMatchStats.athleteId);

    const eventRows = await this.databaseService.database
      .select({
        athleteId: athleteMatchStats.athleteId,
        goals: countEvents('goal'),
        assists: countEvents('assist'),
        yellowCards: countEvents('yellow_card'),
        redCards: countEvents('red_card'),
        // Restricted to matches with recorded minutes so the per-90 numerator
        // and denominator cover the same matches.
        goalsInTimed: countEvents('goal', true),
        assistsInTimed: countEvents('assist', true),
      })
      .from(athleteMatchStats)
      .innerJoin(matches, eq(athleteMatchStats.matchId, matches.id))
      .innerJoin(events, eq(matches.eventId, events.id))
      .leftJoin(
        matchEvents,
        and(
          eq(matchEvents.matchId, athleteMatchStats.matchId),
          eq(matchEvents.athleteId, athleteMatchStats.athleteId),
          eq(matchEvents.team, 'own'),
        ),
      )
      .where(and(...conditions))
      .groupBy(athleteMatchStats.athleteId);

    const appearancesById = new Map(
      appearanceRows.map((r) => [r.athleteId, r]),
    );
    const eventsById = new Map(eventRows.map((r) => [r.athleteId, r]));

    // Preserve the order the coach selected the athletes in.
    const lines = dto.athleteIds.map((athleteId) => {
      const athlete = athleteRows.find((a) => a.id === athleteId)!;
      const played = appearancesById.get(athleteId);
      const logged = eventsById.get(athleteId);

      const appearances = played?.appearances ?? 0;
      const minutesPlayed = played?.minutesPlayed ?? 0;
      const goals = logged?.goals ?? 0;
      const assists = logged?.assists ?? 0;
      const goalContributions = goals + assists;
      const goalsInTimed = logged?.goalsInTimed ?? 0;
      const assistsInTimed = logged?.assistsInTimed ?? 0;

      const goalsPer90 = per90(goalsInTimed, minutesPlayed);

      return {
        athleteId,
        name: `${athlete.firstName} ${athlete.lastName}`,
        position: athlete.position,
        squadNumber: athlete.squadNumber,
        appearances,
        starts: played?.starts ?? 0,
        minutesPlayed,
        matchesWithMinutes: played?.matchesWithMinutes ?? 0,
        goals,
        assists,
        yellowCards: logged?.yellowCards ?? 0,
        redCards: logged?.redCards ?? 0,
        goalContributions,
        perAppearance: {
          goals: perAppearance(goals, appearances),
          assists: perAppearance(assists, appearances),
          goalContributions: perAppearance(goalContributions, appearances),
        },
        // Null unless enough minutes were recorded to make the rate meaningful.
        // The live match logger does not record minutes yet, so this is
        // normally null and the UI leads with `perAppearance` instead.
        per90:
          goalsPer90 === null
            ? null
            : {
                goals: goalsPer90,
                assists: per90(assistsInTimed, minutesPlayed)!,
                goalContributions: per90(
                  goalsInTimed + assistsInTimed,
                  minutesPlayed,
                )!,
              },
      };
    });

    return {
      season: resolved ? toSeasonSummary(resolved.season) : null,
      athletes: lines,
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
      const result = matchResult(gf, ga);

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

    const existingConflict = await this.databaseService.database
      .select({
        position: standings.position,
        teamName: standings.teamName,
      })
      .from(standings)
      .where(
        and(
          eq(standings.competitionId, competitionId),
          sql`(${standings.position} = ${dto.position} or ${standings.teamName} = ${dto.teamName})`,
        ),
      )
      .limit(1);

    if (existingConflict.length > 0) {
      if (existingConflict[0].position === dto.position) {
        throw new ConflictException(
          `A standing entry for position ${dto.position} already exists in this competition.`,
        );
      }
      throw new ConflictException(
        `A standing entry for team "${dto.teamName}" already exists in this competition.`,
      );
    }

    try {
      const [standing] = await this.databaseService.database
        .insert(standings)
        .values({ competitionId, ...dto })
        .returning();

      return standing;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A standing entry with this position or team name already exists in this competition.',
        );
      }
      throw error;
    }
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

    const newPosition = dto.position ?? existing.position;
    const newTeamName = dto.teamName ?? existing.teamName;

    if (
      newPosition !== existing.position ||
      newTeamName !== existing.teamName
    ) {
      const [conflict] = await this.databaseService.database
        .select({
          position: standings.position,
          teamName: standings.teamName,
        })
        .from(standings)
        .where(
          and(
            eq(standings.competitionId, existing.competitionId),
            sql`${standings.id} != ${standingId}`,
            sql`(${standings.position} = ${newPosition} or ${standings.teamName} = ${newTeamName})`,
          ),
        )
        .limit(1);

      if (conflict) {
        if (conflict.position === newPosition) {
          throw new ConflictException(
            `A standing entry for position ${newPosition} already exists in this competition.`,
          );
        }
        throw new ConflictException(
          `A standing entry for team "${newTeamName}" already exists in this competition.`,
        );
      }
    }

    try {
      const [standing] = await this.databaseService.database
        .update(standings)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(standings.id, standingId))
        .returning();

      return standing;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A standing entry with this position or team name already exists in this competition.',
        );
      }
      throw error;
    }
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
        competitionId: standings.competitionId,
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
