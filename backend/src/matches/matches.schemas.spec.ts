import { createMatchLogEventSchema } from './matches.schemas';

describe('createMatchLogEventSchema', () => {
  const goalId = '3b1c2d4e-5f67-489a-ab12-34567890abcd';
  const athleteId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  it('accepts a standalone goal event', () => {
    expect(
      createMatchLogEventSchema.parse({
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

  it('accepts an assist event linked via existing detail field', () => {
    expect(
      createMatchLogEventSchema.parse({
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
});
