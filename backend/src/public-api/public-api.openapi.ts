import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiQuery,
  type ApiResponseSchemaHost,
} from '@nestjs/swagger';

type SchemaObject = ApiResponseSchemaHost['schema'];

const text: SchemaObject = { type: 'string' };
const uuid: SchemaObject = { type: 'string', format: 'uuid' };
const integer: SchemaObject = { type: 'integer' };
const boolean: SchemaObject = { type: 'boolean' };
const date: SchemaObject = { type: 'string', format: 'date' };
const nullable = (schema: SchemaObject): SchemaObject => ({
  ...schema,
  nullable: true,
});
const array = (items: SchemaObject): SchemaObject => ({ type: 'array', items });
const object = (properties: Record<string, SchemaObject>): SchemaObject => ({
  type: 'object',
  required: Object.keys(properties),
  properties,
});
const named = object({ id: uuid, name: text });
const competition = object({ id: uuid, name: text, type: text });

export const formationSchema = object({
  id: text,
  name: text,
  shape: text,
  playerCount: { type: 'integer', enum: [5, 7, 11] },
  description: text,
});

export const tacticSchema = object({
  id: text,
  name: text,
  category: { type: 'string', enum: ['defensive', 'offensive'] },
  description: text,
  formationId: { type: 'string', nullable: true, example: null },
});

export const filtersSchema = object({
  success: { type: 'boolean', enum: [true] },
  data: object({
    teams: array(named),
    seasons: array(
      object({
        id: uuid,
        name: text,
        teamId: uuid,
        startDate: date,
        endDate: date,
        isCurrent: boolean,
      }),
    ),
    competitions: array(
      object({
        id: uuid,
        name: text,
        type: text,
        teamId: uuid,
        seasonId: nullable(uuid),
        teamIds: array(uuid),
      }),
    ),
  }),
});

export const matchSchema = object({
  id: uuid,
  eventId: uuid,
  title: text,
  status: { type: 'string', enum: ['scheduled', 'cancelled', 'completed'] },
  scheduledAt: { type: 'string', format: 'date-time' },
  location: text,
  opponentName: text,
  isHome: boolean,
  teamScore: integer,
  opponentScore: integer,
  team: named,
  competition: nullable(competition),
  season: nullable(named),
});

export const playerSchema = object({
  id: uuid,
  firstName: text,
  lastName: text,
  position: nullable(text),
  squadNumber: nullable(integer),
  team: named,
  statistics: object({
    appearances: integer,
    minutesPlayed: integer,
    goals: integer,
    assists: integer,
    yellowCards: integer,
    redCards: integer,
  }),
});

export const teamStatisticsSchema = object({
  id: uuid,
  teamName: text,
  position: integer,
  played: integer,
  won: integer,
  drawn: integer,
  lost: integer,
  goalsFor: integer,
  goalsAgainst: integer,
  goalDifference: integer,
  points: integer,
  isOwnTeam: boolean,
  ownerTeam: named,
  competition,
  season: nullable(named),
});

export function listSchema(
  items: SchemaObject,
  paginated = false,
): SchemaObject {
  return object({
    success: { type: 'boolean', enum: [true] },
    count: {
      type: 'integer',
      minimum: 0,
      description: 'Records in this response.',
    },
    ...(paginated
      ? { limit: integer, offset: { type: 'integer', minimum: 0 } }
      : {}),
    data: array(items),
  });
}

/** Metadata only: runtime query validation remains in public-api.schemas.ts. */
export function ApiDashboardQuery(
  resource: 'matches' | 'players' | 'standings',
) {
  const decorators = ['teamId', 'competitionId', 'seasonId'].map((name) =>
    ApiQuery({ name, required: false, schema: uuid }),
  );
  if (resource === 'matches') {
    decorators.push(
      ApiQuery({
        name: 'status',
        required: false,
        enum: ['scheduled', 'cancelled', 'completed'],
      }),
    );
  }
  if (resource !== 'standings') {
    decorators.push(
      ApiQuery({
        name: 'limit',
        required: false,
        schema: {
          type: 'integer',
          minimum: 1,
          maximum: resource === 'matches' ? 100 : 500,
          default: resource === 'matches' ? 50 : 200,
        },
      }),
      ApiQuery({
        name: 'offset',
        required: false,
        schema: { type: 'integer', minimum: 0, default: 0 },
      }),
    );
  }
  return applyDecorators(
    ...decorators,
    ApiBadRequestResponse({ description: 'Invalid query parameters.' }),
  );
}
