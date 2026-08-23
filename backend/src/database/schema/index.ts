import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
};

// These tables use Better Auth's default PostgreSQL model names so they can be
// connected to the Better Auth Drizzle adapter during the authentication slice.
export const sexEnum = pgEnum('sex', ['male', 'female', 'prefer_not_to_say']);

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  phoneNumber: text('phone_number'),
  sex: sexEnum('sex'),
  dateOfBirth: date('date_of_birth', { mode: 'string' }),
  ...timestamps,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_index').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps,
  },
  (table) => [index('account_user_id_index').on(table.userId)],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index('verification_identifier_index').on(table.identifier)],
);

export const teamRole = pgEnum('team_role', ['coach', 'assistant']);
export const eventType = pgEnum('event_type', ['match', 'training', 'meeting']);
export const eventStatus = pgEnum('event_status', [
  'scheduled',
  'cancelled',
  'completed',
]);

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const teamMembers = pgTable(
  'team_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: teamRole('role').default('assistant').notNull(),
    ...timestamps,
  },
  (table) => [
    index('team_members_team_id_index').on(table.teamId),
    index('team_members_user_id_index').on(table.userId),
    uniqueIndex('team_members_team_user_unique').on(table.teamId, table.userId),
  ],
);

export const athletes = pgTable(
  'athletes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    dateOfBirth: date('date_of_birth', { mode: 'string' }),
    position: text('position'),
    squadNumber: integer('squad_number'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('athletes_team_id_index').on(table.teamId),
    index('athletes_team_name_index').on(
      table.teamId,
      table.lastName,
      table.firstName,
    ),
  ],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    type: eventType('type').notNull(),
    status: eventStatus('status').default('scheduled').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    location: text('location').notNull(),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('events_team_id_index').on(table.teamId),
    index('events_team_scheduled_at_index').on(table.teamId, table.scheduledAt),
  ],
);
