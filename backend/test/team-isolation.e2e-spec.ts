import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerAssistant, registerCoach } from './utils/auth-helpers';
import {
  cleanupUsers,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface SessionBody {
  user: { id: string; name: string; email: string };
  team: {
    id: string;
    name: string;
    role: string;
    primaryColor: string | null;
  } | null;
}

interface CompetitionBody {
  id: string;
  participants?: { teamId: string | null; displayName: string }[];
}

// Proves the team boundary at the session level: registration gives each coach
// their own team, and `GET /auth/session` never leaks another user's. Team
// updates stay coach-only: an assistant PATCH /teams gets 403 with no database
// changes. Isolation of individual resources (athletes, events, statistics,
// seasons) is covered by those modules' own suites.
describe('Team isolation (e2e)', () => {
  let app: INestApplication<App>;
  const identities: TestIdentity[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await cleanupUsers(identities);
    await app.close();
  });

  async function newCoach(name: string) {
    const identity = uniqueTestIdentity();
    identities.push(identity);
    const registered = await registerCoach(app.getHttpServer(), identity, name);
    return { ...registered, identity };
  }

  it('gives each newly registered coach a distinct team', async () => {
    // Sequential rather than parallel: registration now spans sign-up,
    // verification and team creation, and two interleaved flows against the
    // shared dev database make failures hard to read.
    const coachA = await newCoach('Coach A');
    const coachB = await newCoach('Coach B');

    expect(coachA.team.id).not.toEqual(coachB.team.id);
    expect(coachA.team.name).toEqual(coachA.identity.teamName);
    expect(coachB.team.name).toEqual(coachB.identity.teamName);
  });

  it('rejects a second team for the same coach', async () => {
    const coach = await newCoach('Coach A');

    await coach.agent
      .post('/teams')
      .send({ name: `${coach.identity.teamName} Reserves` })
      .expect(409);
  });

  it("never returns another user's team from /auth/session", async () => {
    const coachA = await newCoach('Coach A');
    const coachB = await newCoach('Coach B');

    const sessionA = await coachA.agent.get('/auth/session').expect(200);
    const sessionB = await coachB.agent.get('/auth/session').expect(200);
    const bodyA = sessionA.body as SessionBody;
    const bodyB = sessionB.body as SessionBody;

    expect(bodyA.team?.name).toEqual(coachA.identity.teamName);
    expect(bodyA.team?.name).not.toEqual(coachB.identity.teamName);
    expect(bodyB.team?.name).toEqual(coachB.identity.teamName);
    expect(bodyB.team?.name).not.toEqual(coachA.identity.teamName);
    expect(bodyA.user.email).toEqual(coachA.identity.email);
    expect(bodyB.user.email).toEqual(coachB.identity.email);
  });

  it('lets a coach update the team name and colour, syncing competition labels', async () => {
    const coach = await newCoach('Team Update Coach');
    const renamed = `${coach.identity.teamName} Renamed`;

    // Creating a competition auto-inserts the coach's team as a participant,
    // so the participant display name tracks the registered team name.
    const competition = await coach.agent
      .post('/competitions')
      .send({
        name: `Team Update League ${randomUUID().slice(0, 8)}`,
        type: 'league',
      })
      .expect(201);

    const updated = await coach.agent
      .patch('/teams')
      .send({ name: renamed, primaryColor: '#1A2B3C' })
      .expect(200);
    expect((updated.body as SessionBody).team).toEqual({
      id: coach.team.id,
      name: renamed,
      role: 'coach',
      primaryColor: '#1A2B3C',
    });

    // The session is served from the live teams row, so this proves the
    // update actually persisted.
    const session = await coach.agent.get('/auth/session').expect(200);
    expect((session.body as SessionBody).team).toEqual({
      id: coach.team.id,
      name: renamed,
      role: 'coach',
      primaryColor: '#1A2B3C',
    });

    const detail = await coach.agent
      .get(`/competitions/${(competition.body as CompetitionBody).id}`)
      .expect(200);
    expect(
      (detail.body as CompetitionBody).participants?.find(
        (participant) => participant.teamId === coach.team.id,
      )?.displayName,
    ).toBe(renamed);

    // Restore the registered name so the shared cleanup, which deletes teams
    // by name, still removes this team and its competition.
    await coach.agent
      .patch('/teams')
      .send({ name: coach.identity.teamName })
      .expect(200);
  });

  it('rejects an assistant team update with 403 and leaves the team untouched', async () => {
    const coachIdentity = uniqueTestIdentity('s1-07-update-coach');
    const assistantIdentity = uniqueTestIdentity('s1-07-update-assistant');
    identities.push(coachIdentity, assistantIdentity);
    const coach = await registerCoach(
      app.getHttpServer(),
      coachIdentity,
      'Team Update Coach',
    );
    const { agent: assistantAgent } = await registerAssistant(
      app.getHttpServer(),
      coach.agent,
      assistantIdentity,
    );

    // The competition participant's display name tracks the registered team
    // name — an unauthorized rename must not rewrite it.
    const competition = await coach.agent
      .post('/competitions')
      .send({
        name: `Assistant Guard League ${randomUUID().slice(0, 8)}`,
        type: 'league',
      })
      .expect(201);

    await assistantAgent
      .patch('/teams')
      .send({ name: 'Hijacked FC', primaryColor: '#FF0000' })
      .expect(403);

    // No database changes: the session is served from the live teams row and
    // still reports the original team identity.
    const session = await coach.agent.get('/auth/session').expect(200);
    expect((session.body as SessionBody).team).toEqual({
      id: coach.team.id,
      name: coach.team.name,
      role: 'coach',
      primaryColor: null,
    });

    // Competition-team display names remain the registered ones.
    const detail = await coach.agent
      .get(`/competitions/${(competition.body as CompetitionBody).id}`)
      .expect(200);
    expect(
      (detail.body as CompetitionBody).participants?.find(
        (participant) => participant.teamId === coach.team.id,
      )?.displayName,
    ).toBe(coach.team.name);

    // Coaches keep full update access after the rejected attempt.
    const coachUpdate = await coach.agent
      .patch('/teams')
      .send({ primaryColor: '#00FF00' })
      .expect(200);
    expect((coachUpdate.body as SessionBody).team).toMatchObject({
      id: coach.team.id,
      primaryColor: '#00FF00',
    });
  });
});
