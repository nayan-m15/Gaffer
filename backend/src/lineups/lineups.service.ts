import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { lineups } from '../database/schema';
import type { CreateLineupDto, UpdateLineupDto } from './lineups.schemas';

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
export class LineupsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Lists all lineups saved for a team, most recently updated first. */
  async findAll(teamId: string) {
    return this.databaseService.database
      .select()
      .from(lineups)
      .where(eq(lineups.teamId, teamId))
      .orderBy(desc(lineups.updatedAt));
  }

  async findOne(teamId: string, lineupId: string) {
    const [lineup] = await this.databaseService.database
      .select()
      .from(lineups)
      .where(and(eq(lineups.id, lineupId), eq(lineups.teamId, teamId)))
      .limit(1);

    if (!lineup) {
      throw new NotFoundException('Lineup not found.');
    }

    return lineup;
  }

  async create(teamId: string, input: CreateLineupDto) {
    try {
      const [lineup] = await this.databaseService.database
        .insert(lineups)
        .values({ teamId, ...input })
        .returning();

      return lineup;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A lineup with this name already exists.');
      }
      throw error;
    }
  }

  async update(teamId: string, lineupId: string, input: UpdateLineupDto) {
    let updated: typeof lineups.$inferSelect | undefined;
    try {
      [updated] = await this.databaseService.database
        .update(lineups)
        .set({ ...input, updatedAt: new Date() })
        .where(and(eq(lineups.id, lineupId), eq(lineups.teamId, teamId)))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('A lineup with this name already exists.');
      }
      throw error;
    }

    if (!updated) {
      throw new NotFoundException('Lineup not found.');
    }

    return updated;
  }

  async remove(teamId: string, lineupId: string) {
    const [lineup] = await this.databaseService.database
      .delete(lineups)
      .where(and(eq(lineups.id, lineupId), eq(lineups.teamId, teamId)))
      .returning();

    if (!lineup) {
      throw new NotFoundException('Lineup not found.');
    }

    return lineup;
  }
}
