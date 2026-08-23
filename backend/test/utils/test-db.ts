import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createDatabaseClient } from '../../src/database/drizzle';
import { teams, user } from '../../src/database/schema';

// Integration tests run against the real dev database (there's no separate
// test DB yet — see S1-07 plan notes). Every identity these tests create is
// unique and gets torn down explicitly, since `teams` has no FK back to
// `user` and won't cascade-delete on its own.
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
 * Deleting the `user` row cascades to `session`, `account` and
 * `team_members` — all declared `onDelete: cascade` against `user.id` in
 * `backend/src/database/schema/index.ts`. `teams` isn't linked back to
 * `user`, so it's cleaned up separately by the name this test used, which is
 * unique per call to `uniqueTestIdentity`.
 */
export async function cleanupUser({
  email,
  teamName,
}: TestIdentity): Promise<void> {
  await testDb.delete(user).where(eq(user.email, email));
  await testDb.delete(teams).where(eq(teams.name, teamName));
}
