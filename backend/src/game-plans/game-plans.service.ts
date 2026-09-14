import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { athletes, gamePlans } from '../database/schema';
import type {
  CreateGamePlanDto,
  UpdateGamePlanDto,
} from './game-plans.schemas';

/** True when `error` is a Postgres unique-violation (SQLSTATE 23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

@Injectable()
export class GamePlansService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Lists all game plans saved for a team, most recently updated first. */
  async findAll(teamId: string) {
    return this.databaseService.database
      .select()
      .from(gamePlans)
      .where(eq(gamePlans.teamId, teamId))
      .orderBy(desc(gamePlans.updatedAt));
  }

  async findOne(teamId: string, gamePlanId: string) {
    const [plan] = await this.databaseService.database
      .select()
      .from(gamePlans)
      .where(and(eq(gamePlans.id, gamePlanId), eq(gamePlans.teamId, teamId)))
      .limit(1);

    if (!plan) {
      throw new NotFoundException('Game plan not found.');
    }

    return plan;
  }

  async create(teamId: string, input: CreateGamePlanDto) {
    await this.validatePlan(teamId, {
      assignments: input.assignments ?? {},
      substituteIds: input.substituteIds ?? [],
      captainId: input.captainId ?? null,
      freeKickTakerId: input.freeKickTakerId ?? null,
      penaltyTakerId: input.penaltyTakerId ?? null,
      cornerTakerId: input.cornerTakerId ?? null,
    });
    try {
      const [plan] = await this.databaseService.database
        .insert(gamePlans)
        .values({ teamId, ...input })
        .returning();

      return plan;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A game plan with this name already exists.',
        );
      }
      throw error;
    }
  }

  async update(teamId: string, gamePlanId: string, input: UpdateGamePlanDto) {
    const existing = await this.findOne(teamId, gamePlanId);
    await this.validatePlan(teamId, { ...existing, ...input });
    let updated: typeof gamePlans.$inferSelect | undefined;
    try {
      [updated] = await this.databaseService.database
        .update(gamePlans)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(gamePlans.id, gamePlanId), eq(gamePlans.teamId, teamId)))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A game plan with this name already exists.',
        );
      }
      throw error;
    }

    if (!updated) {
      throw new NotFoundException('Game plan not found.');
    }

    return updated;
  }

  async remove(teamId: string, gamePlanId: string) {
    const [plan] = await this.databaseService.database
      .delete(gamePlans)
      .where(and(eq(gamePlans.id, gamePlanId), eq(gamePlans.teamId, teamId)))
      .returning();

    if (!plan) {
      throw new NotFoundException('Game plan not found.');
    }

    return plan;
  }

  private async validatePlan(
    teamId: string,
    plan: {
      assignments: Record<string, string | null>;
      substituteIds: string[];
      captainId: string | null;
      freeKickTakerId: string | null;
      penaltyTakerId: string | null;
      cornerTakerId: string | null;
    },
  ) {
    const starters = Object.values(plan.assignments).filter(
      (id): id is string => id !== null,
    );
    if (new Set(starters).size !== starters.length) {
      throw new BadRequestException('Starting athletes must be unique.');
    }
    if (plan.substituteIds.some((id) => starters.includes(id))) {
      throw new BadRequestException(
        'An athlete cannot be both a starter and a substitute.',
      );
    }

    const referencedIds = [
      ...starters,
      ...plan.substituteIds,
      plan.captainId,
      plan.freeKickTakerId,
      plan.penaltyTakerId,
      plan.cornerTakerId,
    ].filter((id): id is string => id !== null);
    const uniqueIds = [...new Set(referencedIds)];
    if (uniqueIds.length === 0) return;

    const valid = await this.databaseService.database
      .select({ id: athletes.id, status: athletes.status })
      .from(athletes)
      .where(and(eq(athletes.teamId, teamId), inArray(athletes.id, uniqueIds)));
    if (valid.length !== uniqueIds.length) {
      throw new BadRequestException(
        'Every referenced athlete must belong to this team.',
      );
    }

    const starterIds = new Set(starters);
    if (
      valid.some(
        (athlete) => starterIds.has(athlete.id) && athlete.status === 'injured',
      )
    ) {
      throw new BadRequestException(
        'Injured athletes cannot be placed in the starting lineup.',
      );
    }
  }
}
