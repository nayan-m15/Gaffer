import {
  DEFAULT_FORMATION_ID,
  FORMATION_IDS,
  getFormationPlayerCount,
} from './formations';

describe('formation metadata', () => {
  it('keeps 11-a-side as the default', () => {
    expect(DEFAULT_FORMATION_ID).toBe('4-3-3');
    expect(getFormationPlayerCount(DEFAULT_FORMATION_ID)).toBe(11);
  });

  it('supports the configured 5-, 7-, and 11-a-side formations', () => {
    expect(FORMATION_IDS).toHaveLength(17);
    expect(getFormationPlayerCount('5v5-1-2-1')).toBe(5);
    expect(getFormationPlayerCount('5v5-2-1-1')).toBe(5);
    expect(getFormationPlayerCount('5v5-1-1-2')).toBe(5);
    expect(getFormationPlayerCount('custom-5')).toBe(5);
    expect(getFormationPlayerCount('7v7-2-3-1')).toBe(7);
    expect(getFormationPlayerCount('7v7-3-2-1')).toBe(7);
    expect(getFormationPlayerCount('7v7-2-2-2')).toBe(7);
    expect(getFormationPlayerCount('custom-7')).toBe(7);
    expect(getFormationPlayerCount('custom-11')).toBe(11);
  });

  it('returns null for unsupported formations', () => {
    expect(getFormationPlayerCount('does-not-exist')).toBeNull();
  });
});
