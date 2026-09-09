import { createSeasonSchema, updateSeasonSchema } from './seasons.schemas';

describe('createSeasonSchema', () => {
  const valid = {
    name: '2025/26',
    startDate: '2025-08-01',
    endDate: '2026-05-31',
  };

  it('accepts a valid season and defaults isCurrent to false', () => {
    const parsed = createSeasonSchema.parse(valid);

    expect(parsed).toEqual({ ...valid, isCurrent: false });
  });

  it('trims the name', () => {
    expect(
      createSeasonSchema.parse({ ...valid, name: '  2025/26  ' }).name,
    ).toBe('2025/26');
  });

  it('rejects an end date on or before the start date', () => {
    expect(() =>
      createSeasonSchema.parse({ ...valid, endDate: '2025-07-31' }),
    ).toThrow('Season end date must be after the start date.');

    expect(() =>
      createSeasonSchema.parse({ ...valid, endDate: valid.startDate }),
    ).toThrow('Season end date must be after the start date.');
  });

  it('rejects a blank or over-long name', () => {
    expect(() => createSeasonSchema.parse({ ...valid, name: '   ' })).toThrow(
      'Season name is required.',
    );
    expect(() =>
      createSeasonSchema.parse({ ...valid, name: 'x'.repeat(51) }),
    ).toThrow('Season name must be 50 characters or fewer.');
  });

  it('rejects malformed dates', () => {
    expect(() =>
      createSeasonSchema.parse({ ...valid, startDate: '01/08/2025' }),
    ).toThrow('Enter a valid start date.');
    expect(() =>
      createSeasonSchema.parse({ ...valid, endDate: '2026-13-01' }),
    ).toThrow('Enter a valid end date.');
  });
});

describe('updateSeasonSchema', () => {
  it('accepts a single field', () => {
    expect(updateSeasonSchema.parse({ name: 'Renamed' })).toEqual({
      name: 'Renamed',
    });
    expect(updateSeasonSchema.parse({ isCurrent: true })).toEqual({
      isCurrent: true,
    });
  });

  it('rejects an empty payload', () => {
    expect(() => updateSeasonSchema.parse({})).toThrow(
      'At least one field is required.',
    );
  });

  it('checks ordering when both dates are supplied', () => {
    expect(() =>
      updateSeasonSchema.parse({
        startDate: '2026-01-01',
        endDate: '2025-01-01',
      }),
    ).toThrow('Season end date must be after the start date.');
  });

  it('allows moving one end alone — the service re-checks against the stored row', () => {
    expect(updateSeasonSchema.parse({ endDate: '2026-06-30' })).toEqual({
      endDate: '2026-06-30',
    });
  });
});
