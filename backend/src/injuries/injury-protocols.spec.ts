import {
  injuryBodyRegion,
  injurySeverity,
  injuryType,
} from '../database/schema';
import {
  addDays,
  protocolRegionFor,
  rehabPhasesFor,
  resolveProtocol,
  returnWindowFor,
} from './injury-protocols';

describe('injury protocols', () => {
  describe('protocolRegionFor', () => {
    it('collapses sided regions onto one protocol key', () => {
      expect(protocolRegionFor('hamstring_left')).toBe('hamstring');
      expect(protocolRegionFor('hamstring_right')).toBe('hamstring');
    });

    it('passes unsided regions through unchanged', () => {
      expect(protocolRegionFor('groin')).toBe('groin');
      expect(protocolRegionFor('back_lower')).toBe('back_lower');
    });

    it('does not mistake a trailing region word for a side', () => {
      // `back_upper` and `wrist_hand_left` both end in an underscored word;
      // only `_left` / `_right` may be stripped.
      expect(protocolRegionFor('back_upper')).toBe('back_upper');
      expect(protocolRegionFor('wrist_hand_left')).toBe('wrist_hand');
    });
  });

  describe('returnWindowFor', () => {
    it('prefers the region-specific window over the type fallback', () => {
      const hamstring = returnWindowFor('hamstring_left', 'strain', 'moderate');
      const generic = returnWindowFor('chest', 'strain', 'moderate');

      expect(hamstring).toEqual({ minDays: 21, maxDays: 42 });
      expect(generic).toEqual({ minDays: 18, maxDays: 35 });
    });

    it('treats left and right as the same timeline', () => {
      expect(returnWindowFor('calf_left', 'strain', 'minor')).toEqual(
        returnWindowFor('calf_right', 'strain', 'minor'),
      );
    });

    it('falls back to the type table for an unlisted region pairing', () => {
      // No region entry exists for a chest fracture, so the type-only
      // fracture window applies.
      expect(returnWindowFor('chest', 'fracture', 'severe')).toEqual({
        minDays: 91,
        maxDays: 180,
      });
    });

    /**
     * The wizard lets a coach pick any region with any type and severity, so
     * every one of those combinations has to resolve to a usable window.
     */
    it('covers every region, type and severity combination', () => {
      for (const region of injuryBodyRegion.enumValues) {
        for (const type of injuryType.enumValues) {
          for (const severity of injurySeverity.enumValues) {
            const window = returnWindowFor(region, type, severity);

            expect(Number.isInteger(window.minDays)).toBe(true);
            expect(Number.isInteger(window.maxDays)).toBe(true);
            expect(window.minDays).toBeGreaterThan(0);
            expect(window.minDays).toBeLessThanOrEqual(window.maxDays);
          }
        }
      }
    });

    it('never estimates a shorter absence for a worse severity', () => {
      for (const region of injuryBodyRegion.enumValues) {
        for (const type of injuryType.enumValues) {
          const minor = returnWindowFor(region, type, 'minor');
          const moderate = returnWindowFor(region, type, 'moderate');
          const severe = returnWindowFor(region, type, 'severe');

          expect(moderate.maxDays).toBeGreaterThanOrEqual(minor.maxDays);
          expect(severe.maxDays).toBeGreaterThanOrEqual(moderate.maxDays);
        }
      }
    });
  });

  describe('rehabPhasesFor', () => {
    it('spans the whole window with contiguous phases', () => {
      const phases = rehabPhasesFor('strain', { minDays: 21, maxDays: 42 });

      expect(phases[0].fromDay).toBe(0);
      expect(phases.at(-1)?.toDay).toBe(42);
      phases.forEach((phase, index) => {
        if (index > 0) {
          expect(phase.fromDay).toBe(phases[index - 1].toDay);
        }
      });
    });

    it('thins the plan rather than inverting it on a short window', () => {
      // Five soft-tissue phases will not fit in three days; the plan is cut
      // down instead of producing phases that start after they end.
      const phases = rehabPhasesFor('contusion', { minDays: 3, maxDays: 3 });

      expect(phases).toHaveLength(3);
      expect(phases[0].fromDay).toBe(0);
      expect(phases.at(-1)?.toDay).toBe(3);
      for (const phase of phases) {
        expect(phase.toDay).toBeGreaterThan(phase.fromDay);
      }
    });

    it('keeps the first and last phase when thinning', () => {
      const full = rehabPhasesFor('strain', { minDays: 10, maxDays: 30 });
      const thinned = rehabPhasesFor('strain', { minDays: 2, maxDays: 2 });

      expect(thinned[0].name).toBe(full[0].name);
      expect(thinned.at(-1)?.name).toBe(full.at(-1)?.name);
    });

    it('survives a coach overriding the estimate to zero days', () => {
      const phases = rehabPhasesFor('contusion', { minDays: 0, maxDays: 0 });

      expect(phases).toHaveLength(1);
      expect(phases[0]).toMatchObject({ fromDay: 0, toDay: 0 });
    });

    it('never produces a gap or an overlap between phases', () => {
      for (const type of injuryType.enumValues) {
        for (const maxDays of [1, 2, 3, 5, 7, 14, 42, 180]) {
          const phases = rehabPhasesFor(type, { minDays: 0, maxDays });

          phases.forEach((phase, index) => {
            if (index > 0) {
              expect(phase.fromDay).toBe(phases[index - 1].toDay);
            }
          });
          expect(phases[0].fromDay).toBe(0);
          expect(phases.at(-1)?.toDay).toBe(maxDays);
        }
      }
    });

    it('uses the graduated return-to-play template for concussion', () => {
      const phases = rehabPhasesFor('concussion', {
        minDays: 6,
        maxDays: 14,
      });

      expect(phases.map((phase) => phase.name)).toEqual([
        'Relative rest',
        'Light aerobic',
        'Sport-specific',
        'Non-contact training',
        'Full contact',
      ]);
    });

    it('starts every phase untouched', () => {
      const phases = rehabPhasesFor('sprain', { minDays: 7, maxDays: 14 });

      expect(phases.every((phase) => phase.completedOn === null)).toBe(true);
    });

    it('produces a phase plan for every injury type', () => {
      for (const type of injuryType.enumValues) {
        const phases = rehabPhasesFor(type, { minDays: 10, maxDays: 30 });

        expect(phases.length).toBeGreaterThan(0);
        expect(phases.at(-1)?.toDay).toBe(30);
      }
    });
  });

  describe('addDays', () => {
    it('adds whole days in ISO date format', () => {
      expect(addDays('2026-09-12', 21)).toBe('2026-10-03');
    });

    it('crosses a month and a year boundary', () => {
      expect(addDays('2026-12-28', 7)).toBe('2027-01-04');
    });

    it('handles a leap day', () => {
      expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    });

    it('returns the same date when adding nothing', () => {
      expect(addDays('2026-09-12', 0)).toBe('2026-09-12');
    });
  });

  describe('resolveProtocol', () => {
    it('projects the window onto calendar dates from the injury date', () => {
      const resolved = resolveProtocol(
        'hamstring_right',
        'strain',
        'moderate',
        '2026-09-12',
      );

      expect(resolved.minDays).toBe(21);
      expect(resolved.maxDays).toBe(42);
      expect(resolved.estimatedReturnFrom).toBe('2026-10-03');
      expect(resolved.estimatedReturnTo).toBe('2026-10-24');
      expect(resolved.phases.at(-1)?.toDay).toBe(42);
    });
  });
});
