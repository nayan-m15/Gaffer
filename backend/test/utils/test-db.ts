import { randomUUID } from 'node:crypto';
import { eq, or } from 'drizzle-orm';
import {
  createDatabaseClient,
  isDatabaseConnectionError,
} from '../../src/database/drizzle';
import {
  injuries,
  injuryTimelineEntries,
  playerClaimInvites,
  teamInvites,
  teams,
  user,
} from '../../src/database/schema';

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
  const [existingUser] = await testDb
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);

  if (existingUser) {
    await testDb
      .delete(injuryTimelineEntries)
      .where(eq(injuryTimelineEntries.createdByUserId, existingUser.id));
    await testDb
      .delete(injuries)
      .where(eq(injuries.createdByUserId, existingUser.id));
    await testDb
      .delete(teamInvites)
      .where(
        or(
          eq(teamInvites.usedByUserId, existingUser.id),
          eq(teamInvites.createdByUserId, existingUser.id),
        ),
      );
    await testDb
      .delete(playerClaimInvites)
      .where(
        or(
          eq(playerClaimInvites.usedByUserId, existingUser.id),
          eq(playerClaimInvites.createdByUserId, existingUser.id),
        ),
      );
  }

  await testDb.delete(teams).where(eq(teams.name, teamName));
  await testDb.delete(user).where(eq(user.email, email));
}

/**
 * Cleans up every identity a test file created.
 *
 * Specs with many `it` blocks accumulate dozens of identities, and firing
 * `cleanupUser` for all of them at once (a plain `Promise.all`) opens that
 * many concurrent HTTP connections to Neon, which intermittently trips
 * transient "fetch failed" errors that fail the whole suite's teardown.
 * Cleanup deletes are idempotent (by id/email), so it's safe to retry them
 * and to cap how many run at once.
 */
export async function cleanupUsers(
  identities: TestIdentity[],
  { concurrency = 5 }: { concurrency?: number } = {},
): Promise<void> {
  let cursor = 0;

  async function worker() {
    while (cursor < identities.length) {
      const identity = identities[cursor++];
      await cleanupUserWithRetry(identity);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, identities.length) }, worker),
  );
}

async function cleanupUserWithRetry(
  identity: TestIdentity,
  attempts = 3,
): Promise<void> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await cleanupUser(identity);
      return;
    } catch (err) {
      if (attempt === attempts || !isDatabaseConnectionError(err)) {
        throw err;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 300 * Math.pow(2, attempt - 1)),
      );
    }
  }
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
