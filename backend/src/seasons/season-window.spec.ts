import { isWithinWindow, seasonWindow } from './season-window';

describe('seasonWindow', () => {
  it('anchors the start at UTC midnight and the end at the last millisecond', () => {
    const window = seasonWindow('2025-08-01', '2026-05-31');

    expect(window.start.toISOString()).toBe('2025-08-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });

  it('covers a single-day season', () => {
    const window = seasonWindow('2025-08-01', '2025-08-01');

    expect(window.start.toISOString()).toBe('2025-08-01T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2025-08-01T23:59:59.999Z');
    expect(window.end.getTime()).toBeGreaterThan(window.start.getTime());
  });

  it('handles a leap day', () => {
    const window = seasonWindow('2024-02-29', '2024-02-29');

    expect(window.start.toISOString()).toBe('2024-02-29T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2024-02-29T23:59:59.999Z');
  });

  it('handles an end-of-month boundary', () => {
    const window = seasonWindow('2025-01-31', '2025-12-31');

    expect(window.start.toISOString()).toBe('2025-01-31T00:00:00.000Z');
    expect(window.end.toISOString()).toBe('2025-12-31T23:59:59.999Z');
  });
});

describe('isWithinWindow', () => {
  const window = seasonWindow('2025-08-01', '2026-05-31');

  it('includes both bounds', () => {
    expect(isWithinWindow('2025-08-01T00:00:00.000Z', window)).toBe(true);
    expect(isWithinWindow('2026-05-31T23:59:59.999Z', window)).toBe(true);
  });

  it('includes instants inside the range', () => {
    expect(isWithinWindow('2025-12-25T18:30:00.000Z', window)).toBe(true);
  });

  it('excludes instants just outside either bound', () => {
    expect(isWithinWindow('2025-07-31T23:59:59.999Z', window)).toBe(false);
    expect(isWithinWindow('2026-06-01T00:00:00.000Z', window)).toBe(false);
  });

  it('excludes a late kick-off on the day after the season ends', () => {
    expect(isWithinWindow('2026-06-01T19:00:00.000Z', window)).toBe(false);
  });
});
