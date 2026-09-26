import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { z } from 'zod';
import {
  eventStatus,
  eventType,
  opponentSquadVisibility,
  PLAYER_POSITIONS,
  rsvpStatus,
} from '../database/schema';

export const eventTypeSchema = z.enum(eventType.enumValues);
export const eventStatusSchema = z.enum(eventStatus.enumValues);
export const opponentSquadVisibilitySchema = z.enum(
  opponentSquadVisibility.enumValues,
);

const hexColorSchema = z
  .string()
  .regex(
    /^#[0-9A-Fa-f]{6}$/,
    'Colour must be a 6-digit hex value such as #1A2B3C.',
  );

const timezoneSchema = z
  .string()
  .trim()
  .max(100)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value }).format();
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Enter a valid IANA timezone such as Africa/Johannesburg.' },
  );

const venueFieldsSchema = z.object({
  venueAddress: z.string().trim().max(300).nullable().optional(),
  weatherLocation: z.string().trim().max(300).nullable().optional(),
  weatherLatitude: z.number().min(-90).max(90).nullable().optional(),
  weatherLongitude: z.number().min(-180).max(180).nullable().optional(),
  weatherTimezone: timezoneSchema.nullable().optional(),
});

function coordinatesArePaired(value: {
  weatherLatitude?: number | null;
  weatherLongitude?: number | null;
}) {
  return (value.weatherLatitude == null) === (value.weatherLongitude == null);
}

const createEventBaseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(150, 'Title must be 150 characters or fewer.'),
  type: eventTypeSchema,
  scheduledAt: z.iso.datetime({
    offset: true,
    error: 'Enter a valid date and time.',
  }),
  location: z
    .string()
    .trim()
    .min(1, 'Location is required.')
    .max(200, 'Location must be 200 characters or fewer.'),
  notes: z
    .string()
    .trim()
    .max(2000, 'Notes must be 2000 characters or fewer.')
    .optional(),
  competitionId: z.uuid().nullable().optional(),
  ...venueFieldsSchema.shape,
});

export const createEventSchema = createEventBaseSchema.refine(
  coordinatesArePaired,
  {
    message: 'Latitude and longitude must be provided together.',
    path: ['weatherLatitude'],
  },
);
export type CreateEventDto = z.infer<typeof createEventSchema>;

export const updateEventSchema = createEventBaseSchema
  .partial()
  .extend({
    status: eventStatusSchema.optional(),
    notes: z
      .string()
      .trim()
      .max(2000, 'Notes must be 2000 characters or fewer.')
      .nullable()
      .optional(),
  })
  .refine(coordinatesArePaired, {
    message: 'Latitude and longitude must be provided together.',
    path: ['weatherLatitude'],
  })
  .refine(
    (value) => Object.values(value).some((field) => field !== undefined),
    {
      message: 'At least one field is required.',
    },
  );
export type UpdateEventDto = z.infer<typeof updateEventSchema>;

export const playerPositionSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value.toUpperCase()))
  .pipe(
    z.union([
      z.null(),
      z.enum(PLAYER_POSITIONS, {
        error:
          'Position must be a valid abbreviation such as GK, CB, CM, or ST.',
      }),
    ]),
  );

const opponentSquadPlayerSchema = z.object({
  shirtNumber: z
    .number()
    .int('Shirt number must be a whole number.')
    .min(1, 'Shirt number must be between 1 and 99.')
    .max(99, 'Shirt number must be between 1 and 99.'),
  name: z
    .string()
    .trim()
    .min(1, 'Opponent name is required.')
    .max(80, 'Opponent name must be 80 characters or fewer.')
    .optional(),
  position: playerPositionSchema.optional(),
});

export const startMatchSchema = z
  .object({
    opponentName: z
      .string()
      .trim()
      .min(1, 'Opponent name is required.')
      .max(100, 'Opponent name must be 100 characters or fewer.'),
    opponentCompetitionTeamId: z.uuid().nullable().optional(),
    isHome: z.boolean(),
    startingAthleteIds: z
      .array(z.uuid())
      .length(11, 'A starting XI must contain exactly 11 athletes.')
      .refine((ids) => new Set(ids).size === 11, {
        message: 'Starting athletes must be unique.',
      }),
    // Final match-day bench after on-the-day swaps. When omitted, every
    // other non-archived team athlete is treated as bench (legacy confirm-squad).
    benchAthleteIds: z
      .array(z.uuid())
      .max(20, 'A match bench cannot exceed 20 athletes.')
      .refine((ids) => new Set(ids).size === ids.length, {
        message: 'Bench athletes must be unique.',
      })
      .optional(),
    gamePlanId: z.uuid().optional(),
    opponentSquadVisibility: opponentSquadVisibilitySchema.default('none'),
    opponentSquad: z.array(opponentSquadPlayerSchema).max(30).optional(),
    teamColor: hexColorSchema.optional(),
    opponentColor: hexColorSchema.optional(),
  })
  .refine(
    (value) => {
      if (!value.benchAthleteIds) {
        return true;
      }
      const starters = new Set(value.startingAthleteIds);
      return !value.benchAthleteIds.some((id) => starters.has(id));
    },
    {
      message: 'An athlete cannot be both a starter and on the bench.',
      path: ['benchAthleteIds'],
    },
  )
  .superRefine((value, ctx) => {
    const squad = value.opponentSquad ?? [];
    const numbers = squad.map((player) => player.shirtNumber);
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'Opponent shirt numbers must be unique.',
        path: ['opponentSquad'],
      });
    }

    if (value.opponentSquadVisibility === 'none' && squad.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'Opponent squad cannot be sent when visibility is none.',
        path: ['opponentSquad'],
      });
    }

    if (value.opponentSquadVisibility === 'numbers') {
      if (squad.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter at least one opponent shirt number.',
          path: ['opponentSquad'],
        });
      }
      for (const [index, player] of squad.entries()) {
        if (player.name) {
          ctx.addIssue({
            code: 'custom',
            message: 'Names are not stored in numbers-only mode.',
            path: ['opponentSquad', index, 'name'],
          });
        }
      }
    }

    if (value.opponentSquadVisibility === 'full') {
      if (squad.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter at least one opponent player.',
          path: ['opponentSquad'],
        });
      }
      for (const [index, player] of squad.entries()) {
        if (!player.name) {
          ctx.addIssue({
            code: 'custom',
            message: 'Opponent name is required in full mode.',
            path: ['opponentSquad', index, 'name'],
          });
        }
      }
    }
  });
export type StartMatchDto = z.infer<typeof startMatchSchema>;

/**
 * Swagger/OpenAPI body shape for POST /events/:eventId/start-match.
 * Runtime validation still goes through `startMatchSchema`.
 */
export class OpponentSquadPlayerBodyDto {
  @ApiProperty({ example: 9, minimum: 1, maximum: 99 })
  shirtNumber!: number;

  @ApiPropertyOptional({ example: 'Smith' })
  name?: string;

  @ApiPropertyOptional({ enum: PLAYER_POSITIONS, example: 'ST' })
  position?: (typeof PLAYER_POSITIONS)[number] | null;
}

export class StartMatchBodyDto {
  @ApiProperty({ example: 'Riverside FC' })
  opponentName!: string;

  @ApiPropertyOptional({
    format: 'uuid',
    description:
      'Required for shared league/cup matches; identifies the selected competition participant.',
  })
  opponentCompetitionTeamId?: string | null;

  @ApiProperty({ example: true })
  isHome!: boolean;

  @ApiProperty({
    type: [String],
    format: 'uuid',
    minItems: 11,
    maxItems: 11,
  })
  startingAthleteIds!: string[];

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  benchAthleteIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  gamePlanId?: string;

  @ApiPropertyOptional({
    enum: opponentSquadVisibility.enumValues,
    default: 'none',
  })
  opponentSquadVisibility?: (typeof opponentSquadVisibility.enumValues)[number];

  @ApiPropertyOptional({ type: [OpponentSquadPlayerBodyDto] })
  opponentSquad?: OpponentSquadPlayerBodyDto[];

  @ApiPropertyOptional({ example: '#1A2B3C' })
  teamColor?: string;

  @ApiPropertyOptional({ example: '#FF5500' })
  opponentColor?: string;
}

export const rsvpStatusSchema = z.enum(rsvpStatus.enumValues, {
  error: 'RSVP status must be one of: going, not_going, maybe.',
});

export const createRsvpSchema = z.object({
  status: rsvpStatusSchema,
  note: z
    .string()
    .trim()
    .max(280, 'Note must be 280 characters or fewer.')
    .optional(),
});
export type CreateRsvpDto = z.infer<typeof createRsvpSchema>;
