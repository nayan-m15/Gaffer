import request from 'supertest';
import type { App } from 'supertest/types';
import { verifyUserEmail, type TestIdentity } from './test-db';

export interface SessionUserBody {
  id: string;
  name: string;
  email: string;
}

export interface SessionTeamBody {
  id: string;
  name: string;
  role: string;
}

export interface SignUpResponseBody {
  user: SessionUserBody;
  emailVerificationRequired: boolean;
}

const PASSWORD = 'password123';

/**
 * Signs up a fresh coach and returns an authenticated Supertest agent (the
 * session cookie persists across every call made through it) plus the
 * user and the team created for them. Shared by the resource-level
 * (athletes/events/statistics) integration suites so each test gets its own
 * isolated team without repeating the boilerplate.
 *
 * Three steps, because sign-up alone no longer authenticates:
 *   1. `POST /auth/sign-up` creates the account but withholds the session
 *      until the address is verified (`requireEmailVerification`).
 *   2. The verification flag is flipped directly in the database — the real
 *      link is delivered by Brevo, which tests must not depend on.
 *   3. `POST /auth/sign-in` establishes the session, then `POST /teams`
 *      creates the team that sign-up used to create implicitly.
 */
export async function registerCoach(
  server: App,
  identity: TestIdentity,
  name = 'Test Coach',
): Promise<{
  agent: ReturnType<typeof request.agent>;
  user: SessionUserBody;
  team: SessionTeamBody;
}> {
  const agent = request.agent(server);

  const signUp = await agent
    .post('/auth/sign-up')
    .send({ name, email: identity.email, password: PASSWORD })
    .expect(201);
  const { user } = signUp.body as SignUpResponseBody;

  await verifyUserEmail(identity.email);

  await agent
    .post('/auth/sign-in')
    .send({ email: identity.email, password: PASSWORD })
    .expect(201);

  const created = await agent
    .post('/teams')
    .send({ name: identity.teamName })
    .expect(201);
  const { team } = created.body as { team: SessionTeamBody };

  if (!team) {
    throw new Error('Expected team creation to return a team.');
  }

  return { agent, user, team };
}
