import {
  athleteStatusSchema,
  createAthleteSchema,
  updateAthleteSchema,
} from './athletes.schemas';

describe('athlete status validation', () => {
  it('accepts each status value', () => {
    expect(athleteStatusSchema.parse('available')).toBe('available');
    expect(athleteStatusSchema.parse('injured')).toBe('injured');
    expect(athleteStatusSchema.parse('suspended')).toBe('suspended');
  });

  it('rejects an unknown status value', () => {
    const result = athleteStatusSchema.safeParse('banned');
    expect(result.success).toBe(false);
  });

  it('allows status on create and keeps it optional', () => {
    expect(
      createAthleteSchema.parse({
        firstName: 'Alex',
        lastName: 'Morgan',
        status: 'injured',
      }),
    ).toEqual({
      firstName: 'Alex',
      lastName: 'Morgan',
      status: 'injured',
    });

    expect(
      createAthleteSchema.parse({ firstName: 'Alex', lastName: 'Morgan' }),
    ).toEqual({ firstName: 'Alex', lastName: 'Morgan' });
  });

  it('rejects an invalid status on create', () => {
    const result = createAthleteSchema.safeParse({
      firstName: 'Alex',
      lastName: 'Morgan',
      status: 'sidelined',
    });
    expect(result.success).toBe(false);
  });

  it('allows changing the status on update', () => {
    expect(updateAthleteSchema.parse({ status: 'suspended' })).toEqual({
      status: 'suspended',
    });
  });

  it('rejects an invalid status on update', () => {
    const result = updateAthleteSchema.safeParse({ status: 'banned' });
    expect(result.success).toBe(false);
  });
});
