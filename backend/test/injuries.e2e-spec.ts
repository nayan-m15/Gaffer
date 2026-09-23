import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { registerAssistant, registerCoach } from './utils/auth-helpers';
import {
  cleanupUser,
  uniqueTestIdentity,
  type TestIdentity,
} from './utils/test-db';

interface AthleteBody {
  id: string;
  status: string;
}

interface TimelineEntryBody {
  id: string;
  kind: string;
  occurredOn: string;
  title: string;
  detail: string | null;
}

interface InjuryBody {
  id: string;
  teamId: string;
  athleteId: string;
  bodyRegion: string;
  injuryType: string;
  severity: string;
  status: string;
  context: string;
  occurredOn: string;
  estimatedReturnMinDays: number;
  estimatedReturnMaxDays: number;
  estimatedReturnFrom: string;
  estimatedReturnTo: string;
  actualReturnOn: string | null;
  diagnosedBy: string | null;
  rehabPhases: { name: string; fromDay: number; toDay: number }[] | null;
  daysOut: number;
  returnVarianceDays: number | null;
  isOpen: boolean;
  isRecurrence?: boolean;
  timeline?: TimelineEntryBody[];
}

interface RecoveryReadingBody {
  group: string;
  label: string;
  percent: number;
  affectedRegions: string[];
}

interface ErrorResponseBody {
  message: string;
}

/** A date safely in the past, so the not-in-the-future contract always holds. */
function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);

  return date.toISOString().slice(0, 10);
}

describe('Injuries (e2e)', () => {
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

  async function newCoach() {
    const identity = uniqueTestIdentity('s1-21-injuries');
    identities.push(identity);

    return registerCoach(app.getHttpServer(), identity);
  }

  /** A coach with one athlete on their roster, ready to be injured. */
  async function newCoachWithAthlete() {
    const coach = await newCoach();
    const created = await coach.agent
      .post('/athletes')
      .send({ firstName: 'Alex', lastName: 'Morgan', squadNumber: 9 })
      .expect(201);

    return { ...coach, athlete: created.body as AthleteBody };
  }

  async function newAssistantFor(coachAgent: ReturnType<typeof request.agent>) {
    const identity = uniqueTestIdentity('s1-21-assistant');
    identities.push(identity);

    return registerAssistant(app.getHttpServer(), coachAgent, identity);
  }

  function logInjury(
    agent: ReturnType<typeof request.agent>,
    athleteId: string,
    overrides: Record<string, unknown> = {},
  ) {
    return agent.post('/injuries').send({
      athleteId,
      bodyRegion: 'hamstring_right',
      injuryType: 'strain',
      severity: 'moderate',
      occurredOn: daysAgo(5),
      context: 'training',
      ...overrides,
    });
  }

  it('requires authentication', async () => {
    await request(app.getHttpServer()).get('/injuries').expect(401);
    await request(app.getHttpServer()).post('/injuries').expect(401);
  });

  describe('logging an injury', () => {
    it('seeds the estimate from the protocol table', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      const response = await logInjury(agent, athlete.id).expect(201);
      const injury = response.body as InjuryBody;

      // A moderate hamstring strain is 21-42 days of guidance.
      expect(injury.estimatedReturnMinDays).toBe(21);
      expect(injury.estimatedReturnMaxDays).toBe(42);
      expect(injury.status).toBe('reported');
      expect(injury.isOpen).toBe(true);
      expect(injury.actualReturnOn).toBeNull();
    });

    it('projects the estimate onto calendar dates', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const occurredOn = daysAgo(5);

      const response = await logInjury(agent, athlete.id, {
        occurredOn,
      }).expect(201);
      const injury = response.body as InjuryBody;

      expect(injury.occurredOn).toBe(occurredOn);
      expect(injury.estimatedReturnFrom > occurredOn).toBe(true);
      expect(injury.estimatedReturnTo > injury.estimatedReturnFrom).toBe(true);
    });

    it('seeds the timeline with what happened and what is expected', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      const created = await logInjury(agent, athlete.id).expect(201);
      const detail = await agent
        .get(`/injuries/${(created.body as InjuryBody).id}`)
        .expect(200);
      const injury = detail.body as InjuryBody;

      expect(injury.timeline).toHaveLength(2);
      expect(injury.timeline?.[0]).toMatchObject({
        kind: 'sustained',
        title: 'Injury sustained',
        detail: 'Occurred during training',
      });
      expect(injury.timeline?.[1]).toMatchObject({
        kind: 'estimated_return',
        title: 'Estimated return',
      });
    });

    it('snapshots a rehab phase plan', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      const response = await logInjury(agent, athlete.id).expect(201);
      const injury = response.body as InjuryBody;

      expect(injury.rehabPhases?.length).toBeGreaterThan(0);
      expect(injury.rehabPhases?.at(-1)?.toDay).toBe(42);
    });

    it('marks the athlete injured on the roster', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      await logInjury(agent, athlete.id).expect(201);

      const roster = await agent.get('/athletes').expect(200);
      const updated = (roster.body as AthleteBody[]).find(
        (row) => row.id === athlete.id,
      );
      expect(updated?.status).toBe('injured');
    });

    it('lets a coach override the guidance window', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      const response = await logInjury(agent, athlete.id, {
        estimatedReturnMinDays: 7,
        estimatedReturnMaxDays: 10,
      }).expect(201);
      const injury = response.body as InjuryBody;

      expect(injury.estimatedReturnMinDays).toBe(7);
      expect(injury.estimatedReturnMaxDays).toBe(10);
      // The phase plan is rebuilt so it cannot contradict the window.
      expect(injury.rehabPhases?.at(-1)?.toDay).toBe(10);
    });

    it('rejects an athlete on another team', async () => {
      const [{ agent }, other] = await Promise.all([
        newCoach(),
        newCoachWithAthlete(),
      ]);

      const response = await logInjury(agent, other.athlete.id).expect(404);

      expect((response.body as ErrorResponseBody).message).toBe(
        'Athlete not found.',
      );
    });

    it('rejects an injury dated in the future', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      await logInjury(agent, athlete.id, { occurredOn: daysAgo(-1) }).expect(
        400,
      );
    });
  });

  /**
   * Reporting is member-level on purpose — assistants run the live logger —
   * while amending the clinical record stays coach-only.
   */
  describe('assistant access', () => {
    it('lets an assistant log an injury', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const assistant = await newAssistantFor(agent);

      const response = await logInjury(assistant.agent, athlete.id).expect(201);

      expect((response.body as InjuryBody).athleteId).toBe(athlete.id);
    });

    it('lets an assistant read the record', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const assistant = await newAssistantFor(agent);
      await logInjury(agent, athlete.id).expect(201);

      const response = await assistant.agent.get('/injuries').expect(200);

      expect(response.body as InjuryBody[]).toHaveLength(1);
    });

    it('stops an assistant editing a record', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const assistant = await newAssistantFor(agent);
      const created = await logInjury(agent, athlete.id).expect(201);

      await assistant.agent
        .patch(`/injuries/${(created.body as InjuryBody).id}`)
        .send({ severity: 'minor' })
        .expect(403);
    });

    it('stops an assistant closing a record', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const assistant = await newAssistantFor(agent);
      const created = await logInjury(agent, athlete.id).expect(201);

      await assistant.agent
        .patch(`/injuries/${(created.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(1) })
        .expect(403);
    });

    it('stops an assistant deleting a record', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const assistant = await newAssistantFor(agent);
      const created = await logInjury(agent, athlete.id).expect(201);

      await assistant.agent
        .delete(`/injuries/${(created.body as InjuryBody).id}`)
        .expect(403);
    });
  });

  describe('editing a record', () => {
    it('re-projects the estimate when the diagnosis worsens', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);

      const response = await agent
        .patch(`/injuries/${(created.body as InjuryBody).id}`)
        .send({ severity: 'severe' })
        .expect(200);
      const injury = response.body as InjuryBody;

      // A severe hamstring strain is 84-168 days, not 21-42.
      expect(injury.estimatedReturnMinDays).toBe(84);
      expect(injury.estimatedReturnMaxDays).toBe(168);
    });

    it('records a status change on the timeline', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);

      const response = await agent
        .patch(`/injuries/${(created.body as InjuryBody).id}`)
        .send({ status: 'rehab' })
        .expect(200);
      const injury = response.body as InjuryBody;

      expect(
        injury.timeline?.some((entry) => entry.kind === 'rehab_started'),
      ).toBe(true);
    });

    it('accepts a coach-added timeline entry', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);
      const injuryId = (created.body as InjuryBody).id;

      await agent
        .post(`/injuries/${injuryId}/timeline`)
        .send({
          kind: 'reassessment',
          occurredOn: daysAgo(1),
          title: 'Progress evaluation with physio',
          detail: 'Cleared for straight-line running',
        })
        .expect(201);

      const detail = await agent.get(`/injuries/${injuryId}`).expect(200);
      expect((detail.body as InjuryBody).timeline).toHaveLength(3);
    });

    it('rejects an empty edit', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);

      await agent
        .patch(`/injuries/${(created.body as InjuryBody).id}`)
        .send({})
        .expect(400);
    });
  });

  describe('closing a record', () => {
    it('returns the athlete to available', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);

      const response = await agent
        .patch(`/injuries/${(created.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(1) })
        .expect(200);
      const injury = response.body as InjuryBody;

      expect(injury.status).toBe('returned');
      expect(injury.actualReturnOn).toBe(daysAgo(1));
      expect(injury.isOpen).toBe(false);

      const roster = await agent.get('/athletes').expect(200);
      const updated = (roster.body as AthleteBody[]).find(
        (row) => row.id === athlete.id,
      );
      expect(updated?.status).toBe('available');
    });

    it('keeps the athlete injured while another injury is open', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const first = await logInjury(agent, athlete.id).expect(201);
      await logInjury(agent, athlete.id, {
        bodyRegion: 'calf_left',
        occurredOn: daysAgo(2),
      }).expect(201);

      await agent
        .patch(`/injuries/${(first.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(1) })
        .expect(200);

      const roster = await agent.get('/athletes').expect(200);
      const updated = (roster.body as AthleteBody[]).find(
        (row) => row.id === athlete.id,
      );
      expect(updated?.status).toBe('injured');
    });

    it('records how the return compared with the projection', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);

      const response = await agent
        .patch(`/injuries/${(created.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(1) })
        .expect(200);
      const injury = response.body as InjuryBody;

      // Returning well inside a 21-42 day window is an early return.
      expect(injury.returnVarianceDays).toBeLessThan(0);
      expect(injury.timeline?.some((entry) => entry.kind === 'returned')).toBe(
        true,
      );
    });

    it('rejects a return before the date of injury', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id, {
        occurredOn: daysAgo(3),
      }).expect(201);

      await agent
        .patch(`/injuries/${(created.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(10) })
        .expect(409);
    });
  });

  describe('the record', () => {
    it('filters to open injuries', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const closed = await logInjury(agent, athlete.id).expect(201);
      await logInjury(agent, athlete.id, {
        bodyRegion: 'calf_left',
        occurredOn: daysAgo(2),
      }).expect(201);
      await agent
        .patch(`/injuries/${(closed.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(1) })
        .expect(200);

      const open = await agent.get('/injuries?status=open').expect(200);
      const done = await agent.get('/injuries?status=closed').expect(200);

      expect(open.body as InjuryBody[]).toHaveLength(1);
      expect((open.body as InjuryBody[])[0].bodyRegion).toBe('calf_left');
      expect(done.body as InjuryBody[]).toHaveLength(1);
    });

    it('flags a re-injury to the same region', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const first = await logInjury(agent, athlete.id, {
        occurredOn: daysAgo(40),
      }).expect(201);
      await agent
        .patch(`/injuries/${(first.body as InjuryBody).id}/close`)
        .send({ actualReturnOn: daysAgo(20) })
        .expect(200);
      await logInjury(agent, athlete.id, { occurredOn: daysAgo(3) }).expect(
        201,
      );

      const response = await agent.get('/injuries').expect(200);
      const rows = response.body as InjuryBody[];
      const recurrence = rows.find((row) => row.occurredOn === daysAgo(3));

      expect(recurrence?.isRecurrence).toBe(true);
      expect(
        rows.find((row) => row.occurredOn === daysAgo(40))?.isRecurrence,
      ).toBe(false);
    });

    it('filters by athlete', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const second = await agent
        .post('/athletes')
        .send({ firstName: 'Sam', lastName: 'Kerr', squadNumber: 20 })
        .expect(201);
      await logInjury(agent, athlete.id).expect(201);
      await logInjury(agent, (second.body as AthleteBody).id, {
        bodyRegion: 'ankle_left',
      }).expect(201);

      const response = await agent
        .get(`/injuries?athleteId=${athlete.id}`)
        .expect(200);

      expect(response.body as InjuryBody[]).toHaveLength(1);
    });

    it('counts the days an open injury has cost', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      const response = await logInjury(agent, athlete.id, {
        occurredOn: daysAgo(5),
      }).expect(201);

      expect((response.body as InjuryBody).daysOut).toBe(5);
    });
  });

  describe('return guidance', () => {
    it('previews a window without creating a record', async () => {
      const { agent } = await newCoach();

      const response = await agent
        .get(
          '/injuries/protocol?bodyRegion=calf_left&injuryType=strain&severity=minor',
        )
        .expect(200);

      expect(response.body).toMatchObject({ minDays: 7, maxDays: 14 });
      await agent
        .get('/injuries')
        .expect(200)
        .expect((res) => expect(res.body as InjuryBody[]).toHaveLength(0));
    });

    it('rejects an unknown region', async () => {
      const { agent } = await newCoach();

      await agent
        .get(
          '/injuries/protocol?bodyRegion=left_ear&injuryType=strain&severity=minor',
        )
        .expect(400);
    });
  });

  describe('recovery readings', () => {
    it('reads 100% across the body with no injuries', async () => {
      const { agent, athlete } = await newCoachWithAthlete();

      const response = await agent
        .get(`/injuries/recovery/${athlete.id}`)
        .expect(200);
      const readings = response.body as RecoveryReadingBody[];

      expect(readings.length).toBeGreaterThan(0);
      expect(readings.every((reading) => reading.percent === 100)).toBe(true);
    });

    it('lowers only the group holding the injury', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      await logInjury(agent, athlete.id).expect(201);

      const response = await agent
        .get(`/injuries/recovery/${athlete.id}`)
        .expect(200);
      const readings = response.body as RecoveryReadingBody[];
      const legs = readings.find((reading) => reading.group === 'legs');
      const chest = readings.find((reading) => reading.group === 'chest');

      expect(legs?.percent).toBeLessThan(100);
      expect(legs?.affectedRegions).toEqual(['hamstring_right']);
      expect(chest?.percent).toBe(100);
    });

    it('rejects an athlete on another team', async () => {
      const [{ agent }, other] = await Promise.all([
        newCoach(),
        newCoachWithAthlete(),
      ]);

      await agent.get(`/injuries/recovery/${other.athlete.id}`).expect(404);
    });
  });

  describe('team isolation', () => {
    it("hides another team's injuries from the list", async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      await logInjury(agent, athlete.id).expect(201);
      const other = await newCoach();

      const response = await other.agent.get('/injuries').expect(200);

      expect(response.body as InjuryBody[]).toHaveLength(0);
    });

    it("refuses to read another team's injury", async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);
      const other = await newCoach();

      await other.agent
        .get(`/injuries/${(created.body as InjuryBody).id}`)
        .expect(404);
    });

    it("refuses to edit another team's injury", async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);
      const other = await newCoach();

      await other.agent
        .patch(`/injuries/${(created.body as InjuryBody).id}`)
        .send({ severity: 'minor' })
        .expect(404);
    });

    it("refuses to delete another team's injury", async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);
      const other = await newCoach();

      await other.agent
        .delete(`/injuries/${(created.body as InjuryBody).id}`)
        .expect(404);
    });
  });

  describe('deleting a record', () => {
    it('removes it and frees the athlete', async () => {
      const { agent, athlete } = await newCoachWithAthlete();
      const created = await logInjury(agent, athlete.id).expect(201);

      await agent
        .delete(`/injuries/${(created.body as InjuryBody).id}`)
        .expect(200);

      await agent
        .get('/injuries')
        .expect(200)
        .expect((res) => expect(res.body as InjuryBody[]).toHaveLength(0));
      const roster = await agent.get('/athletes').expect(200);
      expect(
        (roster.body as AthleteBody[]).find((row) => row.id === athlete.id)
          ?.status,
      ).toBe('available');
    });
  });
});
