import {
  closeInjurySchema,
  createInjurySchema,
  createInjuryTimelineEntrySchema,
  injuryProtocolQuerySchema,
  listInjuriesQuerySchema,
  updateInjurySchema,
} from './injuries.schemas';

const ATHLETE_ID = '11111111-1111-4111-8111-111111111111';
const MATCH_ID = '22222222-2222-4222-8222-222222222222';
const MATCH_EVENT_ID = '33333333-3333-4333-8333-333333333333';

/** Yesterday in UTC, so the not-in-the-future rules never race the clock. */
function yesterday(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);

  return date.toISOString().slice(0, 10);
}

function tomorrow(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
}

function validCreateInput(overrides: Record<string, unknown> = {}) {
  return {
    athleteId: ATHLETE_ID,
    bodyRegion: 'hamstring_right',
    injuryType: 'strain',
    severity: 'moderate',
    occurredOn: yesterday(),
    ...overrides,
  };
}

describe('injuries schemas', () => {
  describe('createInjurySchema', () => {
    it('accepts the minimum a live-logger report needs', () => {
      const result = createInjurySchema.safeParse(validCreateInput());

      expect(result.success).toBe(true);
    });

    it('accepts full live-logger provenance', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({
          matchId: MATCH_ID,
          matchEventId: MATCH_EVENT_ID,
          minute: 34,
          context: 'match',
        }),
      );

      expect(result.success).toBe(true);
    });

    it('rejects an injury dated in the future', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({ occurredOn: tomorrow() }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'Date of injury cannot be in the future.',
      );
    });

    it('rejects an unknown body region', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({ bodyRegion: 'left_ear' }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'Select the injured body region.',
      );
    });

    it('rejects a minute without a match', () => {
      // A minute with no match cannot be rendered and means nothing.
      const result = createInjurySchema.safeParse(
        validCreateInput({ minute: 34 }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'A match is required when logging the minute of an injury.',
      );
    });

    it('rejects half an estimate override', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({ estimatedReturnMinDays: 10 }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'Provide both the earliest and latest estimated return, or neither.',
      );
    });

    it('rejects an inverted estimate override', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({
          estimatedReturnMinDays: 40,
          estimatedReturnMaxDays: 10,
        }),
      );

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'The earliest estimated return cannot be after the latest.',
      );
    });

    it('accepts an estimate override with equal bounds', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({
          estimatedReturnMinDays: 14,
          estimatedReturnMaxDays: 14,
        }),
      );

      expect(result.success).toBe(true);
    });

    it('trims free text', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({ diagnosedBy: '  Club Physio  ' }),
      );

      expect(result.success).toBe(true);
      expect(result.success && result.data.diagnosedBy).toBe('Club Physio');
    });

    it('rejects a description beyond the column limit', () => {
      const result = createInjurySchema.safeParse(
        validCreateInput({ description: 'x'.repeat(1001) }),
      );

      expect(result.success).toBe(false);
    });
  });

  describe('updateInjurySchema', () => {
    it('accepts a single field', () => {
      const result = updateInjurySchema.safeParse({ severity: 'severe' });

      expect(result.success).toBe(true);
    });

    it('rejects an empty body', () => {
      const result = updateInjurySchema.safeParse({});

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'At least one field is required.',
      );
    });

    it('allows clearing optional free text', () => {
      const result = updateInjurySchema.safeParse({
        diagnosedBy: null,
        notes: null,
      });

      expect(result.success).toBe(true);
    });

    it('rejects an inverted estimate override', () => {
      const result = updateInjurySchema.safeParse({
        estimatedReturnMinDays: 60,
        estimatedReturnMaxDays: 30,
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'The earliest estimated return cannot be after the latest.',
      );
    });

    it('rejects an unknown status', () => {
      const result = updateInjurySchema.safeParse({ status: 'nearly_fit' });

      expect(result.success).toBe(false);
    });

    it('does not accept an athlete reassignment', () => {
      // A record belongs to the athlete it was logged against; moving it
      // would silently rewrite two athletes' histories.
      const result = updateInjurySchema.safeParse({
        severity: 'minor',
        athleteId: ATHLETE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.success && 'athleteId' in result.data).toBe(false);
    });
  });

  describe('closeInjurySchema', () => {
    it('accepts a return date', () => {
      const result = closeInjurySchema.safeParse({
        actualReturnOn: yesterday(),
      });

      expect(result.success).toBe(true);
    });

    it('rejects a return date in the future', () => {
      const result = closeInjurySchema.safeParse({
        actualReturnOn: tomorrow(),
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(
        'Return date cannot be in the future.',
      );
    });

    it('requires the return date', () => {
      const result = closeInjurySchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('createInjuryTimelineEntrySchema', () => {
    it('accepts an entry', () => {
      const result = createInjuryTimelineEntrySchema.safeParse({
        kind: 'reassessment',
        occurredOn: '2026-10-03',
        title: 'Progress evaluation with physio',
      });

      expect(result.success).toBe(true);
    });

    it('allows a future date for a planned milestone', () => {
      // Re-assessments and planned returns are deliberately schedulable.
      const result = createInjuryTimelineEntrySchema.safeParse({
        kind: 'reassessment',
        occurredOn: tomorrow(),
        title: 'Scheduled re-assessment',
      });

      expect(result.success).toBe(true);
    });

    it('requires a title', () => {
      const result = createInjuryTimelineEntrySchema.safeParse({
        kind: 'note',
        occurredOn: '2026-10-03',
        title: '   ',
      });

      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe('Title is required.');
    });
  });

  describe('injuryProtocolQuerySchema', () => {
    it('accepts a full guidance query', () => {
      const result = injuryProtocolQuerySchema.safeParse({
        bodyRegion: 'calf_left',
        injuryType: 'strain',
        severity: 'minor',
      });

      expect(result.success).toBe(true);
    });

    it('requires all three selectors', () => {
      const result = injuryProtocolQuerySchema.safeParse({
        bodyRegion: 'calf_left',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('listInjuriesQuerySchema', () => {
    it('accepts an empty query', () => {
      expect(listInjuriesQuerySchema.safeParse({}).success).toBe(true);
    });

    it('accepts the supported status filters', () => {
      for (const status of ['open', 'closed', 'all']) {
        expect(listInjuriesQuerySchema.safeParse({ status }).success).toBe(
          true,
        );
      }
    });

    it('rejects an unsupported status filter', () => {
      expect(
        listInjuriesQuerySchema.safeParse({ status: 'rehab' }).success,
      ).toBe(false);
    });
  });
});
