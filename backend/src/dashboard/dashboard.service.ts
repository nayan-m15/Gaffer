import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athletes,
  events,
  matchEvents,
  matches,
  seasons,
} from '../database/schema';
import { StatisticsService } from '../statistics/statistics.service';
import { matchResult } from '../statistics/statistics.trends';
import { TeamsService } from '../teams/teams.service';

/**
 * Aggregates dashboard summary data for a coach's team.
 *
 * Returns active athlete count, total event count, the next five
 * upcoming events, the ten most recent completed match results, the
 * current season's win/draw/loss record, and a handful of rate stats
 * over those same recent matches — all scoped to the team. When the
 * user has no team, all values return as empty/zero so the frontend
 * can render a clean empty state.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
    private readonly statisticsService: StatisticsService,
  ) {}

  async getSummary(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);

    if (!team) {
      return {
        activeAthletesCount: 0,
        totalEventsCount: 0,
        upcomingEvents: [],
        liveMatch: null,
        recentForm: [],
        seasonSummary: null,
        recentStats: [],
      };
    }

    const [
      [{ value: activeAthletesCount }],
      [{ value: totalEventsCount }],
      upcomingEvents,
      activeMatches,
      recentMatches,
      currentSeason,
    ] = await Promise.all([
      // Active athletes
      this.databaseService.database
        .select({ value: count() })
        .from(athletes)
        .where(and(eq(athletes.teamId, team.id), isNull(athletes.archivedAt))),

      // Total events
      this.databaseService.database
        .select({ value: count() })
        .from(events)
        .where(eq(events.teamId, team.id)),

      // Upcoming events
      this.databaseService.database
        .select()
        .from(events)
        .where(
          and(
            eq(events.teamId, team.id),
            eq(events.status, 'scheduled'),
            gte(events.scheduledAt, new Date()),
          ),
        )
        .orderBy(asc(events.scheduledAt))
        .limit(5),

      // Treat a recently scheduled match with a started, unfinished clock as
      // active. The recency guard prevents abandoned clocks from appearing as
      // live on the dashboard indefinitely.
      this.databaseService.database
        .select({
          id: matches.id,
          eventTitle: events.title,
          opponent: matches.opponentName,
          isHome: matches.isHome,
          teamScore: sql<number>`coalesce((select count(*)::int from ${matchEvents} where ${matchEvents.matchId} = ${matches.id} and ${matchEvents.team} = 'own' and ${matchEvents.eventType} = 'goal'), 0)`,
          opponentScore: sql<number>`coalesce((select count(*)::int from ${matchEvents} where ${matchEvents.matchId} = ${matches.id} and ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal'), 0)`,
          clockElapsedMs: matches.clockElapsedMs,
          clockStartedAt: matches.clockStartedAt,
        })
        .from(matches)
        .innerJoin(events, eq(matches.eventId, events.id))
        .where(
          and(
            eq(events.teamId, team.id),
            eq(events.status, 'scheduled'),
            gte(events.scheduledAt, sql<Date>`now() - interval '24 hours'`),
            ne(matches.clockPeriod, 'not_started'),
            ne(matches.clockPeriod, 'full_time'),
          ),
        )
        .orderBy(desc(matches.updatedAt))
        .limit(1),

      // Recent completed matches
      this.databaseService.database
        .select({
          id: matches.id,
          opponent: matches.opponentName,
          isHome: matches.isHome,
          teamScore: sql<number>`coalesce((select count(*)::int from ${matchEvents} where ${matchEvents.matchId} = ${matches.id} and ${matchEvents.team} = 'own' and ${matchEvents.eventType} = 'goal'), 0)`,
          opponentScore: sql<number>`coalesce((select count(*)::int from ${matchEvents} where ${matchEvents.matchId} = ${matches.id} and ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal'), 0)`,
          date: events.scheduledAt,
        })
        .from(matches)
        .innerJoin(events, eq(matches.eventId, events.id))
        .where(and(eq(events.teamId, team.id), eq(events.status, 'completed')))
        .orderBy(desc(events.scheduledAt))
        .limit(10),

      // The team's current season, if one is flagged. Falls back to the
      // team's whole history below when there isn't one yet.
      this.databaseService.database
        .select({ id: seasons.id })
        .from(seasons)
        .where(and(eq(seasons.teamId, team.id), eq(seasons.isCurrent, true)))
        .limit(1),
    ]);

    const activeMatch = activeMatches[0];
    const liveMatch = activeMatch
      ? {
          id: activeMatch.id,
          eventTitle: activeMatch.eventTitle,
          homeTeam: activeMatch.isHome ? team.name : activeMatch.opponent,
          awayTeam: activeMatch.isHome ? activeMatch.opponent : team.name,
          homeScore: activeMatch.isHome
            ? activeMatch.teamScore
            : activeMatch.opponentScore,
          awayScore: activeMatch.isHome
            ? activeMatch.opponentScore
            : activeMatch.teamScore,
          clockElapsedMs: activeMatch.clockElapsedMs,
          clockStartedAt: activeMatch.clockStartedAt?.toISOString() ?? null,
          elapsedMinutes: Math.floor(
            (activeMatch.clockElapsedMs +
              (activeMatch.clockStartedAt
                ? Math.max(0, Date.now() - activeMatch.clockStartedAt.getTime())
                : 0)) /
              60_000,
          ),
        }
      : null;

    const recentForm = recentMatches.map((match) => {
      // Shared with the statistics module so the two never disagree on what
      // counts as a win.
      const result = matchResult(match.teamScore, match.opponentScore);

      return {
        id: match.id,
        opponent: match.opponent,
        isHome: match.isHome,
        result,
        score: match.isHome
          ? `${match.teamScore}-${match.opponentScore}`
          : `${match.opponentScore}-${match.teamScore}`,
        date: match.date.toISOString(),
      };
    });

    // Shared with the statistics module so the dashboard's record never
    // drifts from the full statistics page's — this recomputes the same
    // totals `StatisticsService.getOverview` derives from the season's
    // matches rather than keeping a second aggregation in sync by hand.
    const overview = await this.statisticsService.getOverview(userId, {
      seasonId: currentSeason[0]?.id,
    });
    const seasonSummary =
      overview.matchesPlayed > 0
        ? {
            played: overview.matchesPlayed,
            won: overview.wins,
            drawn: overview.draws,
            lost: overview.losses,
            goalsFor: overview.goalsFor,
            goalsAgainst: overview.goalsAgainst,
          }
        : null;

    // Rate stats over the same recent matches shown in "Recent Form" — kept
    // as 0-100 percentages so they read sensibly on the dashboard's bar chart.
    const recentStats =
      recentMatches.length > 0
        ? [
            {
              label: 'Win Rate',
              value: Math.round(
                (recentForm.filter((match) => match.result === 'W').length /
                  recentMatches.length) *
                  100,
              ),
            },
            {
              label: 'Clean Sheets',
              value: Math.round(
                (recentMatches.filter((match) => match.opponentScore === 0)
                  .length /
                  recentMatches.length) *
                  100,
              ),
            },
            {
              label: 'Scoring Rate',
              value: Math.round(
                (recentMatches.filter((match) => match.teamScore > 0).length /
                  recentMatches.length) *
                  100,
              ),
            },
          ]
        : [];

    return {
      activeAthletesCount,
      totalEventsCount,
      upcomingEvents,
      liveMatch,
      recentForm,
      seasonSummary,
      recentStats,
    };
  }
}
