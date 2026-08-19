import request from 'supertest';
import type { App } from 'supertest/types';
import type { TestIdentity } from './test-db';

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

export interface AuthResponseBody {
  user: SessionUserBody;
  team: SessionTeamBody | null;
}

const PASSWORD = 'password123';

/**
 * Signs up a fresh coach and returns an authenticated Supertest agent (the
 * session cookie persists across every call made through it) plus the
 * user/team Better Auth + `TeamsService` created for them. Shared by the
 * resource-level (athletes/events) integration suites so each test gets its
 * own isolated team without repeating the sign-up boilerplate.
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
  const response = await agent
    .post('/auth/sign-up')
    .send({
      name,
      email: identity.email,
      password: PASSWORD,
      teamName: identity.teamName,
    })
    .expect(201);
  const body = response.body as AuthResponseBody;

  if (!body.team) {
    throw new Error('Expected sign-up to create a team.');
  }

  return { agent, user: body.user, team: body.team };
}
