import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, getTableColumns, isNull, isNotNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { athletes, playerClaimInvites } from '../database/schema';
import type { CreateAthleteDto, UpdateAthleteDto } from './athletes.schemas';

export type ClaimStatus = 'unclaimed' | 'invited' | 'claimed';

// Computed in the same query as the athlete rows via a left join on pending
// invites — never a per-row lookup. 'claimed' wins over 'invited': a stray
// pending invite alongside an attached userId is irrelevant.
const claimStatus = sql<ClaimStatus>`case
  when ${athletes.userId} is not null then 'claimed'
  when count(${playerClaimInvites.id}) > 0 then 'invited'
  else 'unclaimed'
end`;

@Injectable()
export class AthletesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(teamId: string, input: CreateAthleteDto) {
    const [athlete] = await this.databaseService.database
      .insert(athletes)
      .values({
        teamId,
        ...input,
      })
      .returning();

    return athlete;
  }

  async findAll(teamId: string) {
    return this.databaseService.database
      .select({
        ...getTableColumns(athletes),
        claimStatus,
      })
      .from(athletes)
      .leftJoin(
        playerClaimInvites,
        and(
          eq(playerClaimInvites.athleteId, athletes.id),
          eq(playerClaimInvites.status, 'pending'),
        ),
      )
      .where(and(eq(athletes.teamId, teamId), isNull(athletes.archivedAt)))
      .groupBy(athletes.id);
  }

  async findArchived(teamId: string) {
    return this.databaseService.database
      .select()
      .from(athletes)
      .where(and(eq(athletes.teamId, teamId), isNotNull(athletes.archivedAt)));
  }

  async findOne(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .select({
        ...getTableColumns(athletes),
        claimStatus,
      })
      .from(athletes)
      .leftJoin(
        playerClaimInvites,
        and(
          eq(playerClaimInvites.athleteId, athletes.id),
          eq(playerClaimInvites.status, 'pending'),
        ),
      )
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, teamId),
          isNull(athletes.archivedAt),
        ),
      )
      .groupBy(athletes.id)
      .limit(1);

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }

  async update(teamId: string, athleteId: string, input: UpdateAthleteDto) {
    const [athlete] = await this.databaseService.database
      .update(athletes)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, teamId),
          isNull(athletes.archivedAt),
        ),
      )
      .returning();

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }

  async archive(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .update(athletes)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, teamId),
          isNull(athletes.archivedAt),
        ),
      )
      .returning();

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }

  async restore(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .update(athletes)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(athletes.id, athleteId), eq(athletes.teamId, teamId)))
      .returning();

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }
}
