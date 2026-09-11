import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { athletes, events, matchEvents, matches } from '../database/schema';
import { TeamsService } from '../teams/teams.service';

/**
 * Aggregates dashboard summary data for a coach's team.
 *
 * Returns active athlete count, total event count, the next five
 * upcoming events, and the five most recent completed match results
 * scoped to the team. When the user has no team, all values return
 * as empty/zero so the frontend can render a clean empty state.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  async getSummary(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);

    if (!team) {
      return {
        activeAthletesCount: 0,
        totalEventsCount: 0,
        upcomingEvents: [],
        recentForm: [],
      };
    }

    const [
      [{ value: activeAthletesCount }],
      [{ value: totalEventsCount }],
      upcomingEvents,
      recentMatches,
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
        .limit(5),
    ]);

    const recentForm = recentMatches.map((match) => {
      const result =
        match.teamScore > match.opponentScore
          ? ('W' as const)
          : match.teamScore < match.opponentScore
            ? ('L' as const)
            : ('D' as const);

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

    return {
      activeAthletesCount,
      totalEventsCount,
      upcomingEvents,
      recentForm,
    };
  }
}
