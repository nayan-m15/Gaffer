import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { athletes, gamePlans } from '../database/schema';
import {
  DEFAULT_FORMATION_ID,
  getFormationPlayerCount,
  isCustomFormationId,
} from '../common/formations';
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
      formationId: input.formationId ?? DEFAULT_FORMATION_ID,
      assignments: input.assignments ?? {},
      customPositions: input.customPositions ?? null,
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
      formationId: string;
      assignments: Record<string, string | null>;
      customPositions: Array<{
        id: string;
        label: string;
        role: 'GK' | 'DEF' | 'MID' | 'FWD';
        x: number;
        y: number;
      }> | null;
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
    const starterLimit = getFormationPlayerCount(plan.formationId);
    if (!starterLimit) {
      throw new BadRequestException('Formation is not supported.');
    }

    if (isCustomFormationId(plan.formationId)) {
      const positions = plan.customPositions;
      if (!positions || positions.length !== starterLimit) {
        throw new BadRequestException(
          `Custom ${starterLimit}-a-side formations require exactly ${starterLimit} position slots.`,
        );
      }
      const ids = positions.map((position) => position.id);
      if (new Set(ids).size !== ids.length) {
        throw new BadRequestException(
          'Custom formation position IDs must be unique.',
        );
      }
      const expectedIds = new Set([
        `custom-${starterLimit}-gk`,
        ...Array.from(
          { length: starterLimit - 1 },
          (_, index) => `custom-${starterLimit}-${index + 1}`,
        ),
      ]);
      if (ids.some((id) => !expectedIds.has(id))) {
        throw new BadRequestException(
          'Custom formation position IDs do not match the selected format.',
        );
      }
      const goalkeeperSlots = positions.filter(
        (position) => position.role === 'GK',
      );
      if (goalkeeperSlots.length !== 1) {
        throw new BadRequestException(
          'A custom formation must contain exactly one goalkeeper slot.',
        );
      }
      const goalkeeper = goalkeeperSlots[0];
      if (goalkeeper.x !== 50 || goalkeeper.y !== 94) {
        throw new BadRequestException(
          'The goalkeeper position is fixed in custom formations.',
        );
      }
      if (
        positions.some(
          (position) =>
            position.role !== 'GK' &&
            (position.x < 7 ||
              position.x > 93 ||
              position.y < 8 ||
              position.y > 86),
        )
      ) {
        throw new BadRequestException(
          'Custom outfield positions must stay within the editable pitch area.',
        );
      }
      const hasInvalidRole = positions.some((position) => {
        if (position.role === 'GK') return position.label !== 'GK';
        const inferredRole =
          position.y >= 63 ? 'DEF' : position.y >= 34 ? 'MID' : 'FWD';
        return (
          position.role !== inferredRole || position.label !== inferredRole
        );
      });
      if (hasInvalidRole) {
        throw new BadRequestException(
          'Custom formation roles must match their position on the pitch.',
        );
      }
      const validSlotIds = new Set(ids);
      if (
        Object.keys(plan.assignments).some(
          (slotId) => !validSlotIds.has(slotId),
        )
      ) {
        throw new BadRequestException(
          'Starting-lineup assignments must use slots from the custom formation.',
        );
      }
    } else if (plan.customPositions && plan.customPositions.length > 0) {
      throw new BadRequestException(
        'Custom position coordinates can only be saved with a custom formation.',
      );
    }

    if (starters.length > starterLimit) {
      throw new BadRequestException(
        `This formation allows at most ${starterLimit} starting athletes.`,
      );
    }
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
