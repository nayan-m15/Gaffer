import { Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
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

  /**
   * Deletes the account from the user's point of view without destroying
   * historical team/match records that legitimately reference the actor who
   * created or logged them.
   *
   * Several audit/history tables have non-null user foreign keys. Deleting the
   * Better Auth `user` row outright would therefore either fail or require
   * cascading away match history. Instead, one atomic PostgreSQL statement:
   *   - unclaims athlete records;
   *   - removes team membership;
   *   - deletes all Better Auth sessions and provider/credential accounts;
   *   - erases personal profile data and replaces it with an anonymous
   *     tombstone used only by historical foreign-key references.
   *
   * With the `account` rows gone, neither password nor Google sign-in can
   * recover this user. The original email is also released for a future new
   * account.
   */
  async deleteProfile(userId: string) {
    const [record] = await this.databaseService.database
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!record) {
      throw new NotFoundException('User not found.');
    }

    const anonymousEmail = `deleted+${userId}@deleted.invalid`;

    const result = await this.databaseService.database.execute(sql`
      with
      unclaim_athletes as (
        update athletes
        set user_id = null, updated_at = now()
        where user_id = ${userId}
      ),
      remove_team_membership as (
        delete from team_members
        where user_id = ${userId}
      ),
      remove_sessions as (
        delete from session
        where user_id = ${userId}
      ),
      remove_auth_accounts as (
        delete from account
        where user_id = ${userId}
      ),
      anonymised_user as (
        update "user"
        set
          name = 'Deleted User',
          email = ${anonymousEmail},
          email_verified = false,
          image = null,
          phone_number = null,
          sex = null,
          date_of_birth = null,
          updated_at = now()
        where id = ${userId}
        returning id
      )
      select id from anonymised_user
    `);

    if (result.rows.length === 0) {
      throw new NotFoundException('User not found.');
    }

    return { status: true as const };
  }
}
