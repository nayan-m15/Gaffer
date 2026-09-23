import { injuryBodyRegion } from '../database/schema';
import {
  RECOVERY_GROUP_ORDER,
  daysBetween,
  daysOut,
  isOpenInjuryStatus,
  markRecurrences,
  recoveryGroupFor,
  recoveryPercentFor,
  recoveryReadings,
  returnVarianceDays,
  type DerivableInjury,
} from './injury-derivations';

function injury(overrides: Partial<DerivableInjury> = {}): DerivableInjury {
  return {
    id: 'injury-1',
    athleteId: 'athlete-1',
    bodyRegion: 'hamstring_right',
    severity: 'moderate',
    status: 'rehab',
    occurredOn: '2026-09-12',
    estimatedReturnTo: '2026-10-24',
    actualReturnOn: null,
    ...overrides,
  };
}

describe('injury derivations', () => {
  describe('isOpenInjuryStatus', () => {
    it('treats a season-ending injury as still open', () => {
      // The athlete is unavailable until they actually return, which is what
      // keeps their roster status correct.
      expect(isOpenInjuryStatus('season_ending')).toBe(true);
    });

    it('treats only a return as closed', () => {
      expect(isOpenInjuryStatus('returned')).toBe(false);
      expect(isOpenInjuryStatus('reported')).toBe(true);
      expect(isOpenInjuryStatus('assessment')).toBe(true);
      expect(isOpenInjuryStatus('rehab')).toBe(true);
      expect(isOpenInjuryStatus('return_to_training')).toBe(true);
    });
  });

  describe('daysBetween', () => {
    it('counts whole days forward', () => {
      expect(daysBetween('2026-09-12', '2026-09-19')).toBe(7);
    });

    it('is negative when the range runs backwards', () => {
      expect(daysBetween('2026-09-19', '2026-09-12')).toBe(-7);
    });

    /**
     * Dates are parsed as UTC deliberately: a local-time parse would return
     * 6 or 8 days across a daylight-saving boundary.
     */
    it('is unaffected by daylight-saving transitions', () => {
      expect(daysBetween('2026-03-27', '2026-04-03')).toBe(7);
      expect(daysBetween('2026-10-23', '2026-10-30')).toBe(7);
    });
  });

  describe('daysOut', () => {
    it('counts to today while the injury is open', () => {
      expect(daysOut(injury(), '2026-09-20')).toBe(8);
    });

    it('counts to the return date once closed', () => {
      expect(
        daysOut(
          injury({ status: 'returned', actualReturnOn: '2026-10-20' }),
          '2026-12-01',
        ),
      ).toBe(38);
    });

    it('never reports a negative absence', () => {
      expect(daysOut(injury({ occurredOn: '2026-09-20' }), '2026-09-12')).toBe(
        0,
      );
    });
  });

  describe('returnVarianceDays', () => {
    it('is null while the injury is open', () => {
      expect(returnVarianceDays(injury())).toBeNull();
    });

    it('is positive when the return ran later than projected', () => {
      expect(returnVarianceDays(injury({ actualReturnOn: '2026-10-31' }))).toBe(
        7,
      );
    });

    it('is negative when the athlete beat the projection', () => {
      expect(returnVarianceDays(injury({ actualReturnOn: '2026-10-17' }))).toBe(
        -7,
      );
    });

    it('is zero when the return landed on the projected date', () => {
      expect(returnVarianceDays(injury({ actualReturnOn: '2026-10-24' }))).toBe(
        0,
      );
    });
  });

  describe('markRecurrences', () => {
    it('flags a re-injury to the same region inside the window', () => {
      const result = markRecurrences([
        injury({
          id: 'first',
          status: 'returned',
          occurredOn: '2026-05-01',
          actualReturnOn: '2026-06-01',
        }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.find((row) => row.id === 'second')?.isRecurrence).toBe(
        true,
      );
    });

    it('does not flag the original injury', () => {
      const result = markRecurrences([
        injury({
          id: 'first',
          status: 'returned',
          occurredOn: '2026-05-01',
          actualReturnOn: '2026-06-01',
        }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.find((row) => row.id === 'first')?.isRecurrence).toBe(
        false,
      );
    });

    it('does not flag a re-injury beyond the recurrence window', () => {
      const result = markRecurrences([
        injury({
          id: 'first',
          status: 'returned',
          occurredOn: '2025-01-01',
          actualReturnOn: '2025-02-01',
        }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.find((row) => row.id === 'second')?.isRecurrence).toBe(
        false,
      );
    });

    it('does not flag a different region', () => {
      const result = markRecurrences([
        injury({
          id: 'first',
          bodyRegion: 'calf_left',
          status: 'returned',
          occurredOn: '2026-05-01',
          actualReturnOn: '2026-06-01',
        }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.find((row) => row.id === 'second')?.isRecurrence).toBe(
        false,
      );
    });

    it('treats the other side of the body as a different region', () => {
      const result = markRecurrences([
        injury({
          id: 'first',
          bodyRegion: 'hamstring_left',
          status: 'returned',
          occurredOn: '2026-05-01',
          actualReturnOn: '2026-06-01',
        }),
        injury({
          id: 'second',
          bodyRegion: 'hamstring_right',
          occurredOn: '2026-07-01',
        }),
      ]);

      expect(result.find((row) => row.id === 'second')?.isRecurrence).toBe(
        false,
      );
    });

    it('does not flag another athlete', () => {
      const result = markRecurrences([
        injury({
          id: 'first',
          athleteId: 'athlete-2',
          status: 'returned',
          occurredOn: '2026-05-01',
          actualReturnOn: '2026-06-01',
        }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.find((row) => row.id === 'second')?.isRecurrence).toBe(
        false,
      );
    });

    it('measures from the injury date when the earlier record is still open', () => {
      const result = markRecurrences([
        injury({ id: 'first', occurredOn: '2026-06-20' }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.find((row) => row.id === 'second')?.isRecurrence).toBe(
        true,
      );
    });

    it('flags neither row of a same-day duplicate', () => {
      // Two records logged for one incident must not each mark the other as
      // a recurrence.
      const result = markRecurrences([
        injury({ id: 'first', occurredOn: '2026-07-01' }),
        injury({ id: 'second', occurredOn: '2026-07-01' }),
      ]);

      expect(result.every((row) => !row.isRecurrence)).toBe(true);
    });
  });

  describe('recoveryGroupFor', () => {
    it('maps every body region to a displayed group', () => {
      for (const region of injuryBodyRegion.enumValues) {
        const group = recoveryGroupFor(region);

        expect(RECOVERY_GROUP_ORDER).toContain(group);
      }
    });

    it('groups both sides of a limb together', () => {
      expect(recoveryGroupFor('hamstring_left')).toBe(
        recoveryGroupFor('hamstring_right'),
      );
    });

    it('keeps head and neck out of the torso groups', () => {
      expect(recoveryGroupFor('head')).toBe('head_neck');
      expect(recoveryGroupFor('neck')).toBe('head_neck');
    });
  });

  describe('recoveryPercentFor', () => {
    it('starts at the severity floor on the day of injury', () => {
      expect(recoveryPercentFor(injury(), '2026-09-12')).toBe(35);
      expect(
        recoveryPercentFor(injury({ severity: 'minor' }), '2026-09-12'),
      ).toBe(55);
      expect(
        recoveryPercentFor(injury({ severity: 'severe' }), '2026-09-12'),
      ).toBe(15);
    });

    it('reaches 100% at the projected end of the window', () => {
      expect(recoveryPercentFor(injury(), '2026-10-24')).toBe(100);
    });

    it('climbs monotonically through the window', () => {
      const dates = [
        '2026-09-12',
        '2026-09-20',
        '2026-10-01',
        '2026-10-15',
        '2026-10-24',
      ];
      const scores = dates.map(
        (date) => recoveryPercentFor(injury(), date) ?? 0,
      );

      for (let index = 1; index < scores.length; index += 1) {
        expect(scores[index]).toBeGreaterThanOrEqual(scores[index - 1]);
      }
    });

    it('does not exceed 100% past the projected return', () => {
      expect(recoveryPercentFor(injury(), '2026-12-01')).toBe(100);
    });

    it('ramps back up over a fortnight after an actual return', () => {
      const returned = injury({
        status: 'returned',
        actualReturnOn: '2026-10-20',
      });

      expect(recoveryPercentFor(returned, '2026-10-20')).toBe(80);
      expect(recoveryPercentFor(returned, '2026-10-27')).toBe(90);
    });

    it('stops counting a return older than the ramp', () => {
      const returned = injury({
        status: 'returned',
        actualReturnOn: '2026-10-20',
      });

      expect(recoveryPercentFor(returned, '2026-11-20')).toBeNull();
    });

    it('survives a zero-length estimate window', () => {
      // A coach overriding the estimate to the day of injury must not divide
      // by zero.
      expect(
        recoveryPercentFor(
          injury({ estimatedReturnTo: '2026-09-12' }),
          '2026-09-12',
        ),
      ).toBe(100);
    });
  });

  describe('recoveryReadings', () => {
    it('reads 100% for every group when nothing is injured', () => {
      const readings = recoveryReadings([], '2026-09-20');

      expect(readings).toHaveLength(RECOVERY_GROUP_ORDER.length);
      expect(readings.every((reading) => reading.percent === 100)).toBe(true);
      expect(
        readings.every((reading) => reading.affectedRegions.length === 0),
      ).toBe(true);
    });

    it('lowers only the group containing the injury', () => {
      const readings = recoveryReadings([injury()], '2026-09-20');
      const legs = readings.find((reading) => reading.group === 'legs');
      const back = readings.find((reading) => reading.group === 'back');

      expect(legs?.percent).toBeLessThan(100);
      expect(legs?.affectedRegions).toEqual(['hamstring_right']);
      expect(back?.percent).toBe(100);
    });

    it('takes the worst region in a group', () => {
      const readings = recoveryReadings(
        [
          injury({ id: 'a', bodyRegion: 'calf_left', severity: 'minor' }),
          injury({ id: 'b', bodyRegion: 'knee_right', severity: 'severe' }),
        ],
        '2026-09-12',
      );
      const legs = readings.find((reading) => reading.group === 'legs');

      expect(legs?.percent).toBe(15);
      expect(legs?.affectedRegions).toEqual(['calf_left', 'knee_right']);
    });

    it('ignores injuries that are long resolved', () => {
      const readings = recoveryReadings(
        [
          injury({
            status: 'returned',
            actualReturnOn: '2026-01-10',
          }),
        ],
        '2026-09-20',
      );

      expect(readings.every((reading) => reading.percent === 100)).toBe(true);
    });

    it('returns groups in the display order the page renders', () => {
      const readings = recoveryReadings([], '2026-09-20');

      expect(readings.map((reading) => reading.group)).toEqual([
        ...RECOVERY_GROUP_ORDER,
      ]);
    });
  });
});
