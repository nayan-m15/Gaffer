import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
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
export const athleteStatus = pgEnum('athlete_status', [
  'available',
  'injured',
  'suspended',
]);

export const teams = pgTable('teams', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // Club kit colour; used as the default for each match's own-team colour
  // and overridable per fixture (away kits / clashes).
  primaryColor: text('primary_color'),
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
    uniqueIndex('team_members_user_unique').on(table.userId),
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
    status: athleteStatus('status').default('available').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    // The user who claimed this athlete record as themselves via a claim
    // invite. Nullable and deliberately not unique — one person may claim
    // athlete rows on more than one team.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('athletes_team_id_index').on(table.teamId),
    index('athletes_team_name_index').on(
      table.teamId,
      table.lastName,
      table.firstName,
    ),
    index('athletes_user_id_index').on(table.userId),
    uniqueIndex('athletes_team_user_unique')
      .on(table.teamId, table.userId)
      .where(sql`${table.userId} is not null`),
  ],
);

// A one-time invite a coach generates so a player can claim their athlete
// record as themselves. Only sha256(token) is stored in tokenHash — the raw
// token is shown to the coach once and never persisted.
export const claimInviteStatus = pgEnum('claim_invite_status', [
  'pending',
  'used',
  'revoked',
]);

export const playerClaimInvites = pgTable(
  'player_claim_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    status: claimInviteStatus('status').default('pending').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: text('used_by_user_id').references(() => user.id),
    ...timestamps,
  },
  (table) => [
    index('player_claim_invites_athlete_id_index').on(table.athleteId),
    index('player_claim_invites_token_hash_index').on(table.tokenHash),
  ],
);

// A one-time invite a coach generates so another person can join their team
// as an assistant. Only sha256(token) is stored in tokenHash — the raw token
// is shown to the coach once and never persisted. Each invite is bound to a
// specific email address: only a signed-in user whose email matches may
// accept, so the one-time link cannot be forwarded to someone else.
export const teamInviteStatus = pgEnum('team_invite_status', [
  'pending',
  'used',
  'revoked',
]);

export const teamInvites = pgTable(
  'team_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: teamInviteStatus('status').default('pending').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: text('used_by_user_id').references(() => user.id),
    ...timestamps,
  },
  (table) => [
    index('team_invites_team_id_index').on(table.teamId),
    index('team_invites_token_hash_index').on(table.tokenHash),
  ],
);

// FIFA-style "custom tactics" for a team. Each defensive/offensive style is a
// single enum value; the sliders are integers on a 1–10 scale.
export const defensiveStyle = pgEnum('defensive_style', [
  'drop_back',
  'balanced',
  'pressure_on_heavy_touch',
  'press_after_possession_loss',
  'constant_pressure',
]);

export const offensiveStyle = pgEnum('offensive_style', [
  'possession',
  'balanced',
  'fast_build_up',
  'long_ball',
]);

// A named tactical profile ("game plan") for a team, modeled on FIFA 20's
// Custom Tactics. A team keeps several (e.g. "Balanced", "Cup final low
// block") and swaps between them per fixture; names are unique per team. Each
// row is a complete snapshot of the matchday plan: the starting XI and bench
// alongside the formation + defensive/offensive settings + set-piece takers.
export const gamePlans = pgTable(
  'game_plans',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    formationId: text('formation_id').notNull().default('4-3-3'),
    // Squad selection — maps formation position IDs to athlete IDs (or null
    // for an empty slot).
    assignments: jsonb('assignments')
      .notNull()
      .default({})
      .$type<Record<string, string | null>>(),
    // Athlete IDs on the substitutes bench.
    substituteIds: jsonb('substitute_ids')
      .notNull()
      .default([])
      .$type<string[]>(),
    // Defence
    defensiveStyle: defensiveStyle('defensive_style')
      .notNull()
      .default('balanced'),
    defensiveWidth: integer('defensive_width').notNull().default(5),
    defensiveDepth: integer('defensive_depth').notNull().default(5),
    // Offence
    offensiveStyle: offensiveStyle('offensive_style')
      .notNull()
      .default('balanced'),
    offensiveWidth: integer('offensive_width').notNull().default(5),
    playersInBox: integer('players_in_box').notNull().default(4),
    cornersCommitment: integer('corners_commitment').notNull().default(3),
    freeKicksCommitment: integer('free_kicks_commitment').notNull().default(3),
    // Roles — one athlete each; cleared to null if the athlete is removed.
    captainId: uuid('captain_id').references(() => athletes.id, {
      onDelete: 'set null',
    }),
    freeKickTakerId: uuid('free_kick_taker_id').references(() => athletes.id, {
      onDelete: 'set null',
    }),
    penaltyTakerId: uuid('penalty_taker_id').references(() => athletes.id, {
      onDelete: 'set null',
    }),
    cornerTakerId: uuid('corner_taker_id').references(() => athletes.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('game_plans_team_id_index').on(table.teamId),
    uniqueIndex('game_plans_team_name_unique').on(table.teamId, table.name),
  ],
);

export interface GamePlanSnapshot {
  name: string;
  formationId: string;
  assignments: Record<string, string | null>;
  substituteIds: string[];
  defensiveStyle: (typeof defensiveStyle.enumValues)[number];
  defensiveWidth: number;
  defensiveDepth: number;
  offensiveStyle: (typeof offensiveStyle.enumValues)[number];
  offensiveWidth: number;
  playersInBox: number;
  cornersCommitment: number;
  freeKicksCommitment: number;
  captainId: string | null;
  freeKickTakerId: string | null;
  penaltyTakerId: string | null;
  cornerTakerId: string | null;
}

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
    venueAddress: text('venue_address'),
    weatherLocation: text('weather_location'),
    // Keep the original column names from migration 0018 while exposing their
    // purpose clearly in application code.
    weatherLatitude: doublePrecision('latitude'),
    weatherLongitude: doublePrecision('longitude'),
    weatherTimezone: text('timezone'),
    notes: text('notes'),
    competitionId: uuid('competition_id').references(() => competitions.id, {
      onDelete: 'set null',
    }),
    ...timestamps,
  },
  (table) => [
    index('events_team_id_index').on(table.teamId),
    index('events_team_scheduled_at_index').on(table.teamId, table.scheduledAt),
    index('events_competition_id_index').on(table.competitionId),
  ],
);

// A claimed player's RSVP for a team event. One row per (event, athlete) —
// a fresh response updates the existing row rather than adding a new one.
export const rsvpStatus = pgEnum('rsvp_status', [
  'going',
  'not_going',
  'maybe',
]);

export const eventRsvps = pgTable(
  'event_rsvps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    athleteId: uuid('athlete_id')
      .notNull()
      .references(() => athletes.id, { onDelete: 'cascade' }),
    status: rsvpStatus('status').notNull(),
    note: text('note'),
    respondedAt: timestamp('responded_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    index('event_rsvps_event_id_index').on(table.eventId),
    uniqueIndex('event_rsvps_event_athlete_unique').on(
      table.eventId,
      table.athleteId,
    ),
  ],
);

// A coach-defined date range that groups a team's matches for aggregate
// statistics. A match belongs to the season whose [startDate, endDate] contains
// its event's scheduledAt — matches carry no competition link of their own
// (startMatch never sets matches.competitionId), so the date range is the only
// reliable grouping key. Ranges may not overlap within a team, and at most one
// season per team is flagged current (enforced by the partial unique index).
export const seasons = pgTable(
  'seasons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // e.g. "2025/26"
    startDate: date('start_date', { mode: 'string' }).notNull(),
    endDate: date('end_date', { mode: 'string' }).notNull(),
    isCurrent: boolean('is_current').default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    index('seasons_team_id_index').on(table.teamId),
    index('seasons_team_start_date_index').on(table.teamId, table.startDate),
    uniqueIndex('seasons_team_name_unique').on(table.teamId, table.name),
    uniqueIndex('seasons_team_current_unique')
      .on(table.teamId)
      .where(sql`${table.isCurrent}`),
  ],
);

export const competitionType = pgEnum('competition_type', [
  'league',
  'cup',
  'friendly',
]);

// How much opponent-player identity the coach records for a given match.
export const opponentSquadVisibility = pgEnum('opponent_squad_visibility', [
  'none',
  'numbers',
  'full',
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
    seasonId: uuid('season_id').references(() => seasons.id, {
      onDelete: 'set null',
    }),
    // @deprecated — free-text label superseded by seasonId. Still read by the
    // competition form and standings display; dropped in a follow-up.
    season: text('season'), // e.g. "2025/26" — optional
    ...timestamps,
  },
  (table) => [
    index('competitions_team_id_index').on(table.teamId),
    index('competitions_season_id_index').on(table.seasonId),
  ],
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
    // Saved game plan this match sheet was based on. Null when the coach
    // locked a squad without picking a named plan (legacy flow).
    gamePlanId: uuid('game_plan_id').references(() => gamePlans.id, {
      onDelete: 'set null',
    }),
    gamePlanSnapshot: jsonb('game_plan_snapshot').$type<GamePlanSnapshot>(),
    opponentSquadVisibility: opponentSquadVisibility(
      'opponent_squad_visibility',
    )
      .default('none')
      .notNull(),
    teamColor: text('team_color'),
    opponentColor: text('opponent_color'),
    clockPeriod: text('clock_period').default('not_started').notNull(),
    clockElapsedMs: integer('clock_elapsed_ms').default(0).notNull(),
    clockStartedAt: timestamp('clock_started_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('matches_competition_id_index').on(table.competitionId),
    index('matches_game_plan_id_index').on(table.gamePlanId),
  ],
);

/**
 * Shirt-position abbreviations stored on own athletes and opponent players.
 * Matches the roster picker plus every label `POSITION_ROLE_MAP` understands
 * for formation auto-fill (GK, CB, LB, RB, CM, LW, RW, ST, …).
 */
export const PLAYER_POSITIONS = [
  'GK',
  'CB',
  'LB',
  'RB',
  'LWB',
  'RWB',
  'CDM',
  'CM',
  'CAM',
  'DM',
  'LM',
  'RM',
  'LAM',
  'RAM',
  'AM',
  'ST',
  'LW',
  'RW',
  'CF',
] as const;
export type PlayerPosition = (typeof PLAYER_POSITIONS)[number];

// Per-match opponent players. Empty when visibility is `none`. `name` is
// null in numbers-only mode and required in full mode. `position` is optional
// so numbers-only / unknown-formation squads still persist without a XI.
export const opponentMatchPlayers = pgTable(
  'opponent_match_players',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    shirtNumber: integer('shirt_number').notNull(),
    name: text('name'),
    position: text('position'),
    ...timestamps,
  },
  (table) => [
    index('opponent_match_players_match_id_index').on(table.matchId),
    uniqueIndex('opponent_match_players_match_number_unique').on(
      table.matchId,
      table.shirtNumber,
    ),
  ],
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
  (table) => [
    index('standings_competition_id_index').on(table.competitionId),
    uniqueIndex('standings_competition_position_unique').on(
      table.competitionId,
      table.position,
    ),
    uniqueIndex('standings_competition_team_name_unique').on(
      table.competitionId,
      table.teamName,
    ),
  ],
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
    opponentPlayerId: uuid('opponent_player_id').references(
      () => opponentMatchPlayers.id,
      { onDelete: 'set null' },
    ),
    eventType: matchEventType('event_type').notNull(),
    minute: integer('minute').notNull(),
    detail: text('detail'),
    loggedByUserId: text('logged_by_user_id')
      .notNull()
      .references(() => user.id),
    manuallyAdjusted: boolean('manually_adjusted').default(false).notNull(),
    clientRequestId: uuid('client_request_id'),
    ...timestamps,
  },
  (table) => [
    index('match_events_match_id_index').on(table.matchId),
    index('match_events_opponent_player_id_index').on(table.opponentPlayerId),
    // Serves the per-athlete event counts in StatisticsService, which filter on
    // (match_id, athlete_id, team, event_type) once per athlete_match_stats row.
    index('match_events_match_athlete_type_index').on(
      table.matchId,
      table.athleteId,
      table.eventType,
    ),
    uniqueIndex('match_events_match_request_unique')
      .on(table.matchId, table.clientRequestId)
      .where(sql`${table.clientRequestId} is not null`),
  ],
);
