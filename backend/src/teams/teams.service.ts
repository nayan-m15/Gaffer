import { ConflictException, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { teamMembers, teams } from '../database/schema';

export interface TeamSummary {
  id: string;
  name: string;
  role: (typeof teamMembers.role.enumValues)[number];
}

/**
 * Resolves and creates the single team a coach owns.
 *
 * Sprint 1 only supports one team per user (created during registration), so
 * `findTeamForUser` returns at most one row even though the underlying
 * `team_members` table is many-to-many for future sprints.
 */
@Injectable()
export class TeamsService {
  constructor(private readonly databaseService: DatabaseService) {}

  async findTeamForUser(userId: string): Promise<TeamSummary | null> {
    const [row] = await this.databaseService.database
      .select({
        id: teams.id,
        name: teams.name,
        role: teamMembers.role,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    return row ?? null;
  }

  async createTeamForUser(
    userId: string,
    teamName: string,
  ): Promise<TeamSummary> {
    const existing = await this.findTeamForUser(userId);
    if (existing) {
      throw new ConflictException('This account already has a team.');
    }

    // neon-http does not support interactive transactions, so these two
    // inserts run sequentially. A failure between them would leave an
    // unlinked team row, which is an acceptable risk for Sprint 1 scope.
    const [team] = await this.databaseService.database
      .insert(teams)
      .values({ name: teamName })
      .returning();

    await this.databaseService.database.insert(teamMembers).values({
      teamId: team.id,
      userId,
      role: 'coach',
    });

    return { id: team.id, name: team.name, role: 'coach' };
  }
}
