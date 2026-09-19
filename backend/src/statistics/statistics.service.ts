import {
  BadRequestException,
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
  competitionTeams,
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
  // Drizzle wraps driver errors in a DrizzleQueryError, so the 23505 code may
  // sit on `cause` rather than on the error itself.
  const candidates = [error, (error as { cause?: unknown })?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'code' in candidate &&
      (candidate as { code?: unknown }).code === '23505',
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
      and ${matchEvents.lifecycleStatus} <> 'voided'
  ), 0)`;
}

function matchGoalCount(team: 'own' | 'opponent') {
  return sql<number>`coalesce((
    select count(*)::int from ${matchEvents}
    where ${matchEvents.matchId} = ${matches.id}
      and ${matchEvents.team} = ${team}
      and ${matchEvents.eventType} = 'goal'
      and ${matchEvents.lifecycleStatus} <> 'voided'
  ), 0)`;
}

function appearedInMatch() {
  return sql<boolean>`${athleteMatchStats.started} or exists (
    select 1 from ${matchEvents}
    where ${matchEvents.matchId} = ${athleteMatchStats.matchId}
      and ${matchEvents.team} = 'own'
      and ${matchEvents.eventType} = 'substitution'
      and ${matchEvents.detail} = ${athleteMatchStats.athleteId}::text
      and ${matchEvents.lifecycleStatus} <> 'voided'
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
    where ${matchEvents.eventType} = ${eventType}
      and ${matchEvents.lifecycleStatus} <> 'voided'${minutesClause}
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
        appearances: sql<number>`count(*) filter (where ${appearedInMatch()})::int`,
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
    return this.getCompetitionsForTeam(
      team.id,
      team.role === 'coach' ? userId : undefined,
    );
  }

  /**
   * Competitions and their standings for an already-resolved team — shared
   * with the player module, which scopes by the claimed athlete's team
   * instead of a coach's owned team.
   *
   * `competition_teams` is the membership source of truth for both which
   * competitions appear and which rows belong in each table. Missing manual
   * standings rows are synthesized with zero stats, matching the dedicated
   * Leagues & Competitions detail view.
   */
  async getCompetitionsForTeam(teamId: string, userId?: string) {
    const teamCompetitions = await this.databaseService.database
      .select({ competition: competitions })
      .from(competitionTeams)
      .innerJoin(
        competitions,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(eq(competitionTeams.teamId, teamId))
      .orderBy(asc(competitions.name));

    if (teamCompetitions.length === 0) {
      return [];
    }

    const competitionIds = teamCompetitions.map((row) => row.competition.id);
    const participants = await this.databaseService.database
      .select({
        id: competitionTeams.id,
        competitionId: competitionTeams.competitionId,
        teamId: competitionTeams.teamId,
        displayName: competitionTeams.displayName,
      })
      .from(competitionTeams)
      .where(inArray(competitionTeams.competitionId, competitionIds));

    const teamStandings = await this.databaseService.database
      .select()
      .from(standings)
      .where(inArray(standings.competitionId, competitionIds));

    return teamCompetitions.map(({ competition }) => {
      const competitionParticipants = participants.filter(
        (participant) => participant.competitionId === competition.id,
      );
      const storedStandings = teamStandings.filter(
        (standing) => standing.competitionId === competition.id,
      );
      const byTeamName = new Map(
        storedStandings.map((standing) => [
          standing.teamName.trim().toLocaleLowerCase(),
          standing,
        ]),
      );

      const mergedStandings = competitionParticipants.map((participant) => {
        const stored = byTeamName.get(
          participant.displayName.trim().toLocaleLowerCase(),
        );
        const isOwnTeam = participant.teamId === teamId;

        if (stored) {
          return { ...stored, isOwnTeam };
        }

        return {
          id: `participant:${participant.id}`,
          competitionId: competition.id,
          teamName: participant.displayName,
          position: 0,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goalsFor: 0,
          goalsAgainst: 0,
          points: 0,
          isOwnTeam,
        };
      });

      const orderedStandings = mergedStandings.sort((a, b) => {
        if (a.position === 0 && b.position === 0) {
          return a.teamName.localeCompare(b.teamName, undefined, {
            sensitivity: 'base',
          });
        }
        if (a.position === 0) return 1;
        if (b.position === 0) return -1;
        const positionDifference = a.position - b.position;
        if (positionDifference !== 0) return positionDifference;
        return a.teamName.localeCompare(b.teamName, undefined, {
          sensitivity: 'base',
        });
      });

      let nextFallbackPosition =
        orderedStandings.reduce(
          (max, standing) => Math.max(max, standing.position),
          0,
        ) + 1;

      return {
        ...competition,
        isAdmin:
          competition.type !== 'friendly' &&
          userId !== undefined &&
          (competition.adminUserId === userId ||
            (competition.adminUserId === null &&
              competition.teamId === teamId)),
        standings: orderedStandings.map((standing) => {
          if (standing.position !== 0) return standing;
          return { ...standing, position: nextFallbackPosition++ };
        }),
      };
    });
  }

  /* ── Standings / competitions CRUD ──────────────────────────────────────── */

  async createCompetition(userId: string, dto: CreateCompetitionDto) {
    const team = await this.requireTeam(userId);
    if (dto.type === 'friendly') {
      throw new BadRequestException(
        'Friendly matches should be created without a competition.',
      );
    }

    // Legacy create path (competition management is moving to the dedicated
    // /competitions module). New shared-competition invariants still hold:
    // the creating user becomes the admin, the team is inserted as the first
    // participant, and the global case-insensitive name uniqueness maps to
    // the same friendly conflict the /competitions module returns.
    let competition: typeof competitions.$inferSelect | undefined;
    try {
      [competition] = await this.databaseService.database
        .insert(competitions)
        .values({ teamId: team.id, adminUserId: userId, ...dto })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A competition with this name already exists.',
        );
      }
      throw error;
    }

    try {
      await this.databaseService.database.insert(competitionTeams).values({
        competitionId: competition.id,
        teamId: team.id,
        displayName: team.name,
      });
    } catch (error) {
      // Mirror the new module's cleanup: never leave a competition without
      // its founding participant row.
      await this.databaseService.database
        .delete(competitions)
        .where(eq(competitions.id, competition.id));
      throw error;
    }

    return competition;
  }

  async updateCompetition(
    userId: string,
    competitionId: string,
    dto: UpdateCompetitionDto,
  ) {
    const team = await this.requireTeam(userId);
    await this.requireCompetitionAdmin(userId, team.id, competitionId);
    if (dto.type === 'friendly') {
      throw new BadRequestException(
        'Friendly matches should be created without a competition.',
      );
    }

    let competition: typeof competitions.$inferSelect | undefined;
    try {
      [competition] = await this.databaseService.database
        .update(competitions)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(competitions.id, competitionId))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A competition with this name already exists.',
        );
      }
      throw error;
    }

    return competition;
  }

  async deleteCompetition(userId: string, competitionId: string) {
    const team = await this.requireTeam(userId);
    await this.requireCompetitionAdmin(userId, team.id, competitionId);

    await this.databaseService.database
      .delete(competitions)
      .where(eq(competitions.id, competitionId));

    return { success: true };
  }

  async createStanding(
    userId: string,
    competitionId: string,
    dto: CreateStandingDto,
  ) {
    const team = await this.requireTeam(userId);
    await this.requireCompetitionAdmin(userId, team.id, competitionId);

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
        .values({ competitionId, ...dto, isOwnTeam: false })
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
    const existing = await this.requireStandingAdmin(userId, team.id, standingId);

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
        .set({ ...dto, isOwnTeam: false, updatedAt: new Date() })
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
    await this.requireStandingAdmin(userId, team.id, standingId);

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

  private async requireCompetitionMember(
    teamId: string,
    competitionId: string,
  ) {
    const [competition] = await this.databaseService.database
      .select({ competition: competitions })
      .from(competitionTeams)
      .innerJoin(
        competitions,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(
        and(
          eq(competitionTeams.teamId, teamId),
          eq(competitions.id, competitionId),
        ),
      )
      .limit(1);

    if (!competition) {
      throw new NotFoundException('Competition not found.');
    }

    return competition.competition;
  }

  /**
   * Shared competition mutations are controlled by `adminUserId`, not by the
   * legacy creator-team foreign key. Legacy rows whose admin could not be
   * backfilled remain manageable by the founding team coach.
   */
  private async requireCompetitionAdmin(
    userId: string,
    teamId: string,
    competitionId: string,
  ) {
    const competition = await this.requireCompetitionMember(
      teamId,
      competitionId,
    );

    const isLegacyOwner =
      competition.adminUserId === null && competition.teamId === teamId;

    if (competition.adminUserId !== userId && !isLegacyOwner) {
      throw new ForbiddenException(
        'Only the competition admin can perform this action.',
      );
    }

    return competition;
  }

  private async requireStandingAdmin(
    userId: string,
    teamId: string,
    standingId: string,
  ) {
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
        competitionAdminUserId: competitions.adminUserId,
        legacyOwnerTeamId: competitions.teamId,
      })
      .from(standings)
      .innerJoin(competitions, eq(standings.competitionId, competitions.id))
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(
        and(
          eq(standings.id, standingId),
          eq(competitionTeams.teamId, teamId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException('Standing not found.');
    }

    const isLegacyOwner =
      row.competitionAdminUserId === null && row.legacyOwnerTeamId === teamId;

    if (row.competitionAdminUserId !== userId && !isLegacyOwner) {
      throw new ForbiddenException(
        'Only the competition admin can perform this action.',
      );
    }

    return row;
  }

}
