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

export const competitionType = pgEnum('competition_type', [
  'league',
  'cup',
  'friendly',
]);

// A league or cup the team is competing in this season.
export const competitions = pgTable(
  'competitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: competitionType('type').notNull(),
    season: text('season'), // e.g. "2025/26" — optional
    ...timestamps,
  },
  (table) => [index('competitions_team_id_index').on(table.teamId)],
);

// One row per event of type 'match'. Populated by the (future) live match
// logger; this feature only reads from it.
export const matches = pgTable(
  'matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .unique()
      .references(() => events.id, { onDelete: 'cascade' }),
    competitionId: uuid('competition_id').references(() => competitions.id, {
      onDelete: 'set null',
    }),
    opponentName: text('opponent_name').notNull(),
    isHome: boolean('is_home').default(true).notNull(),
    teamScore: integer('team_score').default(0).notNull(),
    opponentScore: integer('opponent_score').default(0).notNull(),
    ...timestamps,
  },
  (table) => [index('matches_competition_id_index').on(table.competitionId)],
);

// One row per athlete per match. Populated by the (future) live match
// logger; this feature only reads from it.
export const athleteMatchStats = pgTable(
  'athlete_match_stats',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    started: boolean('started').default(true).notNull(),
    minutesPlayed: integer('minutes_played'), // nullable — not required for v1
    goals: integer('goals').default(0).notNull(),
    assists: integer('assists').default(0).notNull(),
    yellowCards: integer('yellow_cards').default(0).notNull(),
    redCards: integer('red_cards').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index('athlete_match_stats_athlete_id_index').on(table.athleteId),
    uniqueIndex('athlete_match_stats_match_athlete_unique').on(
      table.matchId,
      table.athleteId,
    ),
  ],
);

// Manually entered/updated by the coach — the app has no way to calculate
// standings since it doesn't track other teams' results.
export const standings = pgTable(
  'standings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    teamName: text('team_name').notNull(),
    position: integer('position').notNull(),
    played: integer('played').default(0).notNull(),
    won: integer('won').default(0).notNull(),
    drawn: integer('drawn').default(0).notNull(),
    lost: integer('lost').default(0).notNull(),
    goalsFor: integer('goals_for').default(0).notNull(),
    goalsAgainst: integer('goals_against').default(0).notNull(),
    points: integer('points').default(0).notNull(),
    isOwnTeam: boolean('is_own_team').default(false).notNull(),
    ...timestamps,
  },
  (table) => [index('standings_competition_id_index').on(table.competitionId)],
);

export const matchEventTeam = pgEnum('match_event_team', ['own', 'opponent']);
export const matchEventType = pgEnum('match_event_type', [
  'goal',
  'assist',
  'key_pass',
  'yellow_card',
  'red_card',
  'substitution',
  'penalty',
  'injury',
]);

export const matchEvents = pgTable(
  'match_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id').references(() => athletes.id, {
      onDelete: 'set null',
    }),
    team: matchEventTeam('team').notNull(),
    opponentLabel: text('opponent_label'),
    eventType: matchEventType('event_type').notNull(),
    minute: integer('minute').notNull(),
    detail: text('detail'),
    loggedByUserId: text('logged_by_user_id')
      .notNull()
      .references(() => user.id),
    manuallyAdjusted: boolean('manually_adjusted').default(false).notNull(),
    ...timestamps,
  },
  (table) => [index('match_events_match_id_index').on(table.matchId)],
);
