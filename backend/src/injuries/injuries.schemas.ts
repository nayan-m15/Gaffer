import { z } from 'zod';
import {
  injuryBodyRegion,
  injuryContext,
  injurySeverity,
  injuryStatus,
  injuryTimelineKind,
  injuryType,
} from '../database/schema';

export const injuryBodyRegionSchema = z.enum(injuryBodyRegion.enumValues, {
  error: 'Select the injured body region.',
});
export const injuryTypeSchema = z.enum(injuryType.enumValues, {
  error: 'Select the kind of injury.',
});
export const injurySeveritySchema = z.enum(injurySeverity.enumValues, {
  error: 'Severity must be one of: minor, moderate, severe.',
});
export const injuryStatusSchema = z.enum(injuryStatus.enumValues, {
  error:
    'Status must be one of: reported, assessment, rehab, return_to_training, returned, season_ending.',
});
export const injuryContextSchema = z.enum(injuryContext.enumValues, {
  error: 'Context must be one of: match, training, other.',
});
export const injuryTimelineKindSchema = z.enum(injuryTimelineKind.enumValues, {
  error: 'Select a valid timeline entry type.',
});

/** Today in UTC, as `yyyy-mm-dd`, for the not-in-the-future checks. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const pastOrTodayDateSchema = (label: string) =>
  z
    .string()
    .date(`${label} must be a valid date.`)
    .refine(
      (value) => value <= todayIso(),
      `${label} cannot be in the future.`,
    );

const descriptionSchema = z
  .string()
  .trim()
  .max(1000, 'Description must be 1000 characters or fewer.');

const notesSchema = z
  .string()
  .trim()
  .max(2000, 'Notes must be 2000 characters or fewer.');

const diagnosedBySchema = z
  .string()
  .trim()
  .max(120, 'Diagnosed by must be 120 characters or fewer.');

/**
 * Optional override of the guidance window resolved from the protocol table.
 * Both bounds travel together: half an override would leave the record with
 * a window that no longer means anything.
 */
const estimateOverrideSchema = z.object({
  estimatedReturnMinDays: z
    .number()
    .int('Estimated return must be a whole number of days.')
    .min(0, 'Estimated return cannot be negative.')
    .max(730, 'Estimated return must be 730 days or fewer.'),
  estimatedReturnMaxDays: z
    .number()
    .int('Estimated return must be a whole number of days.')
    .min(0, 'Estimated return cannot be negative.')
    .max(730, 'Estimated return must be 730 days or fewer.'),
});

function estimateBoundsOrdered(value: {
  estimatedReturnMinDays?: number;
  estimatedReturnMaxDays?: number;
}) {
  if (
    value.estimatedReturnMinDays === undefined ||
    value.estimatedReturnMaxDays === undefined
  ) {
    return true;
  }

  return value.estimatedReturnMinDays <= value.estimatedReturnMaxDays;
}

const ESTIMATE_ORDER_MESSAGE =
  'The earliest estimated return cannot be after the latest.';

const createInjuryBaseSchema = z.object({
  athleteId: z.uuid('Select the injured athlete.'),
  bodyRegion: injuryBodyRegionSchema,
  injuryType: injuryTypeSchema,
  severity: injurySeveritySchema,
  occurredOn: pastOrTodayDateSchema('Date of injury'),
  context: injuryContextSchema.optional(),
  status: injuryStatusSchema.optional(),
  /**
   * Live-logger provenance. The service still verifies both belong to the
   * caller's team, so a client cannot attach a record to another team's match.
   */
  matchId: z.uuid().optional(),
  matchEventId: z.uuid().optional(),
  minute: z
    .number()
    .int('Minute must be a whole number.')
    .min(0, 'Minute cannot be negative.')
    .max(200, 'Minute must be 200 or fewer.')
    .optional(),
  diagnosedBy: diagnosedBySchema.optional(),
  description: descriptionSchema.optional(),
  notes: notesSchema.optional(),
  estimatedReturnMinDays:
    estimateOverrideSchema.shape.estimatedReturnMinDays.optional(),
  estimatedReturnMaxDays:
    estimateOverrideSchema.shape.estimatedReturnMaxDays.optional(),
});

export const createInjurySchema = createInjuryBaseSchema
  .refine(estimateBoundsOrdered, { message: ESTIMATE_ORDER_MESSAGE })
  .refine(
    (value) =>
      (value.estimatedReturnMinDays === undefined) ===
      (value.estimatedReturnMaxDays === undefined),
    {
      message:
        'Provide both the earliest and latest estimated return, or neither.',
    },
  )
  // A minute without a match is meaningless, and the Injury & Recovery page
  // renders "34'" only for match-context records.
  .refine(
    (value) => value.minute === undefined || value.matchId !== undefined,
    {
      message: 'A match is required when logging the minute of an injury.',
    },
  );

export type CreateInjuryDto = z.infer<typeof createInjurySchema>;

/**
 * Coach edit. `athleteId` and the live-logger provenance fields are
 * deliberately not editable: a record belongs to the athlete and the
 * incident it was logged against, and moving it would silently rewrite two
 * athletes' histories.
 */
export const updateInjurySchema = createInjuryBaseSchema
  .pick({
    bodyRegion: true,
    injuryType: true,
    severity: true,
    status: true,
    diagnosedBy: true,
    description: true,
    notes: true,
    estimatedReturnMinDays: true,
    estimatedReturnMaxDays: true,
  })
  .partial()
  .extend({
    occurredOn: pastOrTodayDateSchema('Date of injury').optional(),
    diagnosedBy: diagnosedBySchema.nullable().optional(),
    description: descriptionSchema.nullable().optional(),
    notes: notesSchema.nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    { message: 'At least one field is required.' },
  )
  .refine(estimateBoundsOrdered, { message: ESTIMATE_ORDER_MESSAGE });

export type UpdateInjuryDto = z.infer<typeof updateInjurySchema>;

export const closeInjurySchema = z.object({
  actualReturnOn: pastOrTodayDateSchema('Return date'),
  notes: notesSchema.optional(),
});

export type CloseInjuryDto = z.infer<typeof closeInjurySchema>;

export const createInjuryTimelineEntrySchema = z.object({
  kind: injuryTimelineKindSchema,
  occurredOn: z.string().date('Enter a valid date.'),
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(150, 'Title must be 150 characters or fewer.'),
  detail: z
    .string()
    .trim()
    .max(500, 'Detail must be 500 characters or fewer.')
    .optional(),
});

export type CreateInjuryTimelineEntryDto = z.infer<
  typeof createInjuryTimelineEntrySchema
>;

/**
 * Query contract for the estimate preview the live-logger wizard shows while
 * the coach is still choosing. Keeping the protocol table server-side means
 * the preview and the persisted estimate can never drift apart.
 */
export const injuryProtocolQuerySchema = z.object({
  bodyRegion: injuryBodyRegionSchema,
  injuryType: injuryTypeSchema,
  severity: injurySeveritySchema,
  occurredOn: z.string().date('Enter a valid date.').optional(),
});

export type InjuryProtocolQueryDto = z.infer<typeof injuryProtocolQuerySchema>;

export const listInjuriesQuerySchema = z.object({
  /** `open` excludes returned and closed records; the default is `all`. */
  status: z.enum(['open', 'closed', 'all']).optional(),
  athleteId: z.uuid('Select a valid athlete.').optional(),
});

export type ListInjuriesQueryDto = z.infer<typeof listInjuriesQuerySchema>;
