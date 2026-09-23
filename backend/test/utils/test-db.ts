import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDatabaseClient } from '../../src/database/drizzle';
import { teams, user } from '../../src/database/schema';

// Jest maps the separately configured TEST_DATABASE_URL to DATABASE_URL
// before application or database modules are imported.
const testDb = createDatabaseClient();

export interface TestIdentity {
  email: string;
  teamName: string;
}

/** A unique email/team-name pair for one test's sign-up call. */
export function uniqueTestIdentity(prefix = 's1-07'): TestIdentity {
  const id = randomUUID();
  return {
    email: `${prefix}-${id}@example.com`,
    teamName: `${prefix} Test Team ${id}`,
  };
}

/**
 * Deletes a test-created user and (if it created one) their team.
 *
 * The team goes first: deleting it cascades `team_members`, `athletes`,
 * `events`, `team_invites` and `injuries` (which in turn cascades
 * `injury_timeline_entries`). Those last two matter because
 * `team_invites.created_by_user_id`, `injuries.created_by_user_id` and
 * `injury_timeline_entries.created_by_user_id` all reference `user` with no
 * cascade of their own — deleting the user first would trip those FKs as
 * soon as an account has issued an invite or logged an injury. Deleting the
 * `user` row itself still cascades `session` and `account`.
 */
export async function cleanupUser({
  email,
  teamName,
}: TestIdentity): Promise<void> {
  await testDb.delete(teams).where(eq(teams.name, teamName));
  await testDb.delete(user).where(eq(user.email, email));
}

/**
 * Marks a test account's email as verified directly in the database.
 *
 * Sign-up now withholds the session until the address is confirmed, and the
 * real confirmation goes through a Brevo-delivered link. Tests flip the flag
 * themselves rather than sending live email on every sign-up.
 */
export async function verifyUserEmail(email: string): Promise<void> {
  await testDb
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.email, email));
}
