import { Injectable, NotFoundException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { user } from '../database/schema';
import type { UpdateProfileDto } from './profile.schemas';

@Injectable()
export class ProfileService {
  constructor(private readonly databaseService: DatabaseService) {}

  async getProfile(userId: string) {
    const [record] = await this.databaseService.database
      .select()
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('User not found.');
    }

    return record;
  }

  async updateProfile(userId: string, input: UpdateProfileDto) {
    const [updated] = await this.databaseService.database
      .update(user)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning();

    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    return updated;
  }
}
