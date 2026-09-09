import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { teamMembers, teams } from '../database/schema';
import type { UpdateTeamDto } from './teams.schemas';

export interface TeamSummary {
  id: string;
  name: string;
  role: (typeof teamMembers.role.enumValues)[number];
  primaryColor: string | null;
}

/** Postgres unique-constraint violation — the race-condition backstop for
 * membership inserts when two requests pass the one-team check concurrently. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
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
        primaryColor: teams.primaryColor,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId))
      .limit(1);

    return row ?? null;
  }

  /**
   * Resolves the caller's team and rejects unless they are a coach on it.
   * Team-less users and assistants both get 403 — the single server-side
   * gate every coach-only operation (roster mutations, assistant-invite
   * management) routes through.
   */
  async requireCoachTeam(userId: string): Promise<TeamSummary> {
    const team = await this.findTeamForUser(userId);

    if (!team) {
      throw new ForbiddenException('No team associated with this account.');
    }

    if (team.role !== 'coach') {
      throw new ForbiddenException('Only coaches can perform this action.');
    }

    return team;
  }

  /**
   * Inserts the invited user's team membership with the role hardcoded to
   * `assistant` — the only write path that creates an assistant, so no
   * request payload can ever influence which role is stored.
   */
  async addAssistantMember(teamId: string, userId: string): Promise<void> {
    try {
      await this.databaseService.database
        .insert(teamMembers)
        .values({ teamId, userId, role: 'assistant' });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('This account already belongs to a team.');
      }
      throw error;
    }
  }

  async createTeamForUser(
    userId: string,
    teamName: string,
    primaryColor?: string,
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
      .values({ name: teamName, primaryColor })
      .returning();

    await this.databaseService.database.insert(teamMembers).values({
      teamId: team.id,
      userId,
      role: 'coach',
    });

    return {
      id: team.id,
      name: team.name,
      role: 'coach',
      primaryColor: team.primaryColor,
    };
  }

  async updateTeamForUser(
    userId: string,
    input: UpdateTeamDto,
  ): Promise<TeamSummary> {
    const existing = await this.findTeamForUser(userId);
    if (!existing) {
      throw new NotFoundException('Team not found.');
    }

    const [team] = await this.databaseService.database
      .update(teams)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.primaryColor !== undefined
          ? { primaryColor: input.primaryColor }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(teams.id, existing.id))
      .returning();

    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    return {
      id: team.id,
      name: team.name,
      role: existing.role,
      primaryColor: team.primaryColor,
    };
  }
}
