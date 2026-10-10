import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerCoach } from './utils/auth-helpers';
import {
  cleanupUsers,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface AthleteBody {
  id: string;
}

interface GamePlanBody {
  id: string;
  name: string;
  formationId: string;
  assignments: Record<string, string | null>;
  playerInstructions: Record<string, Record<string, string>>;
}

/** The 4-3-3 slots this suite assigns players to. */
const SLOT = {
  gk: '433-gk',
  leftBack: '433-lb',
  leftWing: '433-lw',
  striker: '433-st',
};

describe('Game plan player instructions (e2e)', () => {
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

  /** A coach with four athletes, one per slot this suite uses. */
  async function newCoachWithSquad() {
    const identity = uniqueTestIdentity('game-plan-instructions');
    identities.push(identity);
    const { agent, team } = await registerCoach(app.getHttpServer(), identity);

    const athletes: Record<string, string> = {};
    const squad = [
      ['gk', 'Gary', 'Keeper', 'GK'],
      ['leftBack', 'Lee', 'Back', 'LB'],
      ['leftWing', 'Wes', 'Winger', 'LW'],
      ['striker', 'Stan', 'Striker', 'ST'],
    ] as const;

    for (const [key, firstName, lastName, position] of squad) {
      const created = await agent
        .post('/athletes')
        .send({ firstName, lastName, position })
        .expect(201);
      athletes[key] = (created.body as AthleteBody).id;
    }

    return { agent, team, athletes };
  }

  it('defaults to an empty set of instructions', async () => {
    const { agent } = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({ name: 'Opening day' })
      .expect(201);

    expect((created.body as GamePlanBody).playerInstructions).toEqual({});
  });

  it('saves instructions and returns them on reload', async () => {
    const { agent, athletes } = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({
        name: 'Instructed',
        formationId: '4-3-3',
        assignments: {
          [SLOT.gk]: athletes.gk,
          [SLOT.leftWing]: athletes.leftWing,
          [SLOT.striker]: athletes.striker,
        },
      })
      .expect(201);
    const planId = (created.body as GamePlanBody).id;

    const instructions = {
      [athletes.leftWing]: {
        final_third_movement: 'cut_inside',
        width: 'come_inside',
      },
      [athletes.striker]: { attacking_runs: 'run_in_behind' },
      [athletes.gk]: { starting_position: 'sweeper_keeper' },
    };

    await agent
      .patch(`/game-plans/${planId}`)
      .send({ playerInstructions: instructions })
      .expect(200);

    // Re-read the plan the way the page does after a reload.
    const reloaded = await agent.get(`/game-plans/${planId}`).expect(200);
    expect((reloaded.body as GamePlanBody).playerInstructions).toEqual(
      instructions,
    );
  });

  it('keeps instructions for a player who is not in the starting XI', async () => {
    const { agent, athletes } = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({
        name: 'Benched',
        formationId: '4-3-3',
        assignments: {},
        substituteIds: [athletes.striker],
      })
      .expect(201);
    const planId = (created.body as GamePlanBody).id;

    await agent
      .patch(`/game-plans/${planId}`)
      .send({
        playerInstructions: {
          [athletes.striker]: { link_up_play: 'hold_up_ball' },
        },
      })
      .expect(200);

    const reloaded = await agent.get(`/game-plans/${planId}`).expect(200);
    expect(
      (reloaded.body as GamePlanBody).playerInstructions[athletes.striker],
    ).toEqual({ link_up_play: 'hold_up_ball' });
  });

  it('rejects a category the player is not asked about', async () => {
    const { agent, athletes } = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({
        name: 'Bad category',
        formationId: '4-3-3',
        assignments: { [SLOT.leftBack]: athletes.leftBack },
      })
      .expect(201);

    // Distribution is a goalkeeper's card; a left-back is never offered it.
    await agent
      .patch(`/game-plans/${(created.body as GamePlanBody).id}`)
      .send({
        playerInstructions: {
          [athletes.leftBack]: { distribution: 'go_long' },
        },
      })
      .expect(400);
  });

  it('rejects an option that belongs to another kind of player', async () => {
    const { agent, athletes } = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({
        name: 'Bad option',
        formationId: '4-3-3',
        assignments: { [SLOT.leftBack]: athletes.leftBack },
      })
      .expect(201);
    const planId = (created.body as GamePlanBody).id;

    // `come_inside` is the winger's answer to Width; a full-back inverts.
    await agent
      .patch(`/game-plans/${planId}`)
      .send({
        playerInstructions: { [athletes.leftBack]: { width: 'come_inside' } },
      })
      .expect(400);

    await agent
      .patch(`/game-plans/${planId}`)
      .send({
        playerInstructions: { [athletes.leftBack]: { width: 'invert_inside' } },
      })
      .expect(200);
  });

  it('rejects an unknown category outright', async () => {
    const { agent, athletes } = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({ name: 'Unknown', formationId: '4-3-3' })
      .expect(201);

    await agent
      .patch(`/game-plans/${(created.body as GamePlanBody).id}`)
      .send({
        playerInstructions: { [athletes.striker]: { make_tea: 'strong' } },
      })
      .expect(400);
  });

  it("rejects instructions for an athlete outside the coach's team", async () => {
    const { agent } = await newCoachWithSquad();
    const other = await newCoachWithSquad();

    const created = await agent
      .post('/game-plans')
      .send({ name: 'Someone else', formationId: '4-3-3' })
      .expect(201);

    await agent
      .patch(`/game-plans/${(created.body as GamePlanBody).id}`)
      .send({
        playerInstructions: {
          [other.athletes.striker]: { attacking_runs: 'run_in_behind' },
        },
      })
      .expect(400);
  });
});
