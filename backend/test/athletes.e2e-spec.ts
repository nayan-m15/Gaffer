import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface AthleteBody {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
  status: string;
  archivedAt: string | null;
}

interface ErrorResponseBody {
  message: string;
}

describe('Athletes (e2e)', () => {
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
    await Promise.all(identities.map(cleanupUser));
    await app.close();
  });

  /** Registers a fresh coach (and their team) and returns their auth'd agent. */
  async function newCoach() {
    const identity = uniqueTestIdentity('s1-07-athletes');
    identities.push(identity);
    return registerCoach(app.getHttpServer(), identity);
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/athletes').expect(401);
  });

  it("creates an athlete on the coach's team", async () => {
    const { agent, team } = await newCoach();

    const response = await agent
      .post('/athletes')
      .send({
        firstName: 'Alex',
        lastName: 'Morgan',
        position: 'ST',
        squadNumber: 13,
      })
      .expect(201);
    const athlete = response.body as AthleteBody;

    expect(athlete).toMatchObject({
      teamId: team.id,
      firstName: 'Alex',
      lastName: 'Morgan',
      position: 'ST',
      squadNumber: 13,
    });
    expect(athlete.archivedAt).toBeNull();
  });

  it('rejects a payload missing required fields', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/athletes')
      .send({ firstName: '', lastName: '' })
      .expect(400);
    const body = response.body as ErrorResponseBody;

    expect(body.message).toEqual(expect.any(String));
  });

  it('defaults a new athlete to available status', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/athletes')
      .send({ firstName: 'Default', lastName: 'Status' })
      .expect(201);
    const athlete = response.body as AthleteBody;

    expect(athlete.status).toBe('available');
  });

  it('creates an athlete with injured status', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/athletes')
      .send({ firstName: 'Injured', lastName: 'Player', status: 'injured' })
      .expect(201);
    const athlete = response.body as AthleteBody;

    expect(athlete.status).toBe('injured');
  });

  it('creates an athlete with suspended status', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/athletes')
      .send({ firstName: 'Suspended', lastName: 'Player', status: 'suspended' })
      .expect(201);
    const athlete = response.body as AthleteBody;

    expect(athlete.status).toBe('suspended');
  });

  it('rejects an invalid status value', async () => {
    const { agent } = await newCoach();

    const response = await agent
      .post('/athletes')
      .send({ firstName: 'Invalid', lastName: 'Status', status: 'banned' })
      .expect(400);
    const body = response.body as ErrorResponseBody;

    expect(body.message).toEqual(expect.any(String));
  });

  it('lists only active (non-archived) athletes for the team', async () => {
    const { agent } = await newCoach();

    await agent
      .post('/athletes')
      .send({ firstName: 'Alex', lastName: 'Morgan' })
      .expect(201);

    const list = await agent.get('/athletes').expect(200);
    const athletes = list.body as AthleteBody[];

    expect(athletes).toHaveLength(1);
    expect(athletes[0]).toMatchObject({
      firstName: 'Alex',
      lastName: 'Morgan',
    });
  });

  it('fetches a single athlete by id and 404s for an unknown one', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/athletes')
      .send({ firstName: 'Sam', lastName: 'Kerr' })
      .expect(201);
    const { id } = created.body as AthleteBody;

    await agent.get(`/athletes/${id}`).expect(200);
    await agent.get(`/athletes/${randomUUID()}`).expect(404);
  });

  it('updates an athlete', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/athletes')
      .send({ firstName: 'Sam', lastName: 'Kerr', squadNumber: 9 })
      .expect(201);
    const { id } = created.body as AthleteBody;

    const response = await agent
      .patch(`/athletes/${id}`)
      .send({ squadNumber: 20 })
      .expect(200);
    const athlete = response.body as AthleteBody;

    expect(athlete).toMatchObject({
      firstName: 'Sam',
      lastName: 'Kerr',
      squadNumber: 20,
    });
  });

  it('archives an athlete, hiding it from the active list and surfacing it in /athletes/archived, then restores it', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/athletes')
      .send({ firstName: 'Megan', lastName: 'Rapinoe' })
      .expect(201);
    const { id } = created.body as AthleteBody;

    await agent.delete(`/athletes/${id}`).expect(200);

    const activeAfterArchive = await agent.get('/athletes').expect(200);
    expect(activeAfterArchive.body as AthleteBody[]).toHaveLength(0);

    const archived = await agent.get('/athletes/archived').expect(200);
    const archivedAthletes = archived.body as AthleteBody[];
    expect(archivedAthletes).toHaveLength(1);
    expect(archivedAthletes[0].archivedAt).not.toBeNull();

    await agent.patch(`/athletes/${id}/restore`).expect(200);

    const activeAfterRestore = await agent.get('/athletes').expect(200);
    expect(activeAfterRestore.body as AthleteBody[]).toHaveLength(1);
  });

  it('updates an athlete status and persists it', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/athletes')
      .send({ firstName: 'Sam', lastName: 'Kerr', status: 'injured' })
      .expect(201);
    const { id } = created.body as AthleteBody;

    const response = await agent
      .patch(`/athletes/${id}`)
      .send({ status: 'suspended' })
      .expect(200);
    const athlete = response.body as AthleteBody;

    expect(athlete.status).toBe('suspended');

    const refetched = await agent.get(`/athletes/${id}`).expect(200);
    expect((refetched.body as AthleteBody).status).toBe('suspended');

    const restored = await agent
      .patch(`/athletes/${id}`)
      .send({ status: 'available' })
      .expect(200);
    expect((restored.body as AthleteBody).status).toBe('available');
  });

  it('rejects an invalid status value on update', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/athletes')
      .send({ firstName: 'Invalid', lastName: 'Update' })
      .expect(201);
    const { id } = created.body as AthleteBody;

    const response = await agent
      .patch(`/athletes/${id}`)
      .send({ status: 'sidelined' })
      .expect(400);
    const body = response.body as ErrorResponseBody;

    expect(body.message).toEqual(expect.any(String));
  });

  it('keeps the athlete status through archive and restore', async () => {
    const { agent } = await newCoach();

    const created = await agent
      .post('/athletes')
      .send({ firstName: 'Megan', lastName: 'Rapinoe', status: 'injured' })
      .expect(201);
    const { id } = created.body as AthleteBody;

    await agent.delete(`/athletes/${id}`).expect(200);

    const archived = await agent.get('/athletes/archived').expect(200);
    const archivedAthletes = archived.body as AthleteBody[];
    expect(archivedAthletes).toHaveLength(1);
    expect(archivedAthletes[0].status).toBe('injured');

    await agent.patch(`/athletes/${id}/restore`).expect(200);

    const activeAfterRestore = await agent.get('/athletes').expect(200);
    const activeAthletes = activeAfterRestore.body as AthleteBody[];
    expect(activeAthletes).toHaveLength(1);
    expect(activeAthletes[0].status).toBe('injured');
  });

  it("never exposes one team's athlete to another team", async () => {
    const teamA = await newCoach();
    const teamB = await newCoach();

    const created = await teamA.agent
      .post('/athletes')
      .send({ firstName: 'Alex', lastName: 'Morgan' })
      .expect(201);
    const { id } = created.body as AthleteBody;

    await teamB.agent.get(`/athletes/${id}`).expect(404);
    await teamB.agent
      .patch(`/athletes/${id}`)
      .send({ firstName: 'Hacked' })
      .expect(404);
    await teamB.agent.delete(`/athletes/${id}`).expect(404);
    await expect(
      teamB.agent.get('/athletes').expect(200),
    ).resolves.toMatchObject({ body: [] });
  });
});
