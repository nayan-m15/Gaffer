import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { athletes, events } from '../database/schema';
import { TeamsService } from '../teams/teams.service';

/**
 * Aggregates dashboard summary data for a coach's team.
 *
 * Returns active athlete count, total event count, and the next five
 * upcoming events scoped to the team. When the user has no team (e.g.
 * registration was not completed), all values return as empty/zero so
 * the frontend can render a clean empty state.
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
      };
    }

    const [
      [{ value: activeAthletesCount }],
      [{ value: totalEventsCount }],
      upcomingEvents,
    ] = await Promise.all([
      this.databaseService.database
        .select({ value: count() })
        .from(athletes)
        .where(
          and(eq(athletes.teamId, team.id), isNull(athletes.archivedAt)),
        ),

      this.databaseService.database
        .select({ value: count() })
        .from(events)
        .where(eq(events.teamId, team.id)),

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
    ]);

    return {
      activeAthletesCount,
      totalEventsCount,
      upcomingEvents,
    };
  }
}
