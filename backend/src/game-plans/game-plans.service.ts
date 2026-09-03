import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { gamePlans } from '../database/schema';
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
}
