import { createMatchLogEventSchema } from './matches.schemas';

describe('createMatchLogEventSchema', () => {
  const goalId = '3b1c2d4e-5f67-489a-ab12-34567890abcd';
  const athleteId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const clientRequestId = '11111111-2222-4333-8444-555555555555';

  it('accepts a standalone goal event', () => {
    expect(
      createMatchLogEventSchema.parse({
        clientRequestId,
        team: 'own',
        eventType: 'goal',
        athleteId,
        minute: 12,
      }),
    ).toMatchObject({
      team: 'own',
      eventType: 'goal',
      athleteId,
      minute: 12,
    });
  });

  it('accepts precise offline observation metadata', () => {
    expect(
      createMatchLogEventSchema.parse({
        clientRequestId,
        deviceId: '22222222-3333-4444-8555-666666666666',
        clientCreatedAt: '2026-09-17T12:34:56.000Z',
        period: 'first_half',
        matchElapsedMs: 754321,
        team: 'own',
        eventType: 'goal',
        athleteId,
        minute: 12,
      }),
    ).toMatchObject({
      period: 'first_half',
      matchElapsedMs: 754321,
    });
  });

  it('rejects impossible offline match clock values', () => {
    expect(() =>
      createMatchLogEventSchema.parse({
        clientRequestId,
        period: 'first_half',
        matchElapsedMs: -1,
        team: 'own',
        eventType: 'goal',
        athleteId,
        minute: 12,
      }),
    ).toThrow();
  });

  it('accepts an assist event linked via existing detail field', () => {
    expect(
      createMatchLogEventSchema.parse({
        clientRequestId,
        team: 'own',
        eventType: 'assist',
        athleteId,
        minute: 12,
        detail: goalId,
      }),
    ).toMatchObject({
      eventType: 'assist',
      athleteId,
      minute: 12,
      detail: goalId,
    });
  });

  it('accepts a generic opponent substitution without squad data', () => {
    expect(
      createMatchLogEventSchema.parse({
        clientRequestId,
        team: 'opponent',
        eventType: 'substitution',
        opponentLabel: 'Rivals',
        minute: 30,
      }),
    ).toMatchObject({
      team: 'opponent',
      eventType: 'substitution',
      opponentLabel: 'Rivals',
    });
  });

  it('stores a scored penalty as a goal with Penalty detail', () => {
    expect(
      createMatchLogEventSchema.parse({
        clientRequestId,
        team: 'own',
        eventType: 'goal',
        athleteId,
        minute: 19,
        detail: 'Penalty',
      }),
    ).toMatchObject({
      eventType: 'goal',
      detail: 'Penalty',
    });
  });

  it('rejects a scored-penalty detail on a penalty event type', () => {
    expect(() =>
      createMatchLogEventSchema.parse({
        clientRequestId,
        team: 'own',
        eventType: 'penalty',
        athleteId,
        minute: 19,
        detail: 'Penalty',
      }),
    ).toThrow(/scored penalty must be saved as a goal/i);
  });
});
