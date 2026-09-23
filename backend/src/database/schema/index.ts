import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
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
// record as themselves. Each invite is bound to a specific email address,
// matching assistant invites. Only sha256(token) is stored in tokenHash — the
// raw token is never persisted.
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
    email: text('email').notNull(),
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
    // Generated shared-competition fixtures are surfaced through the normal
    // team Events calendar. This durable link makes the sync idempotent and
    // lets schedule/opponent/progression changes update the same event instead
    // of creating duplicates. Null for ordinary manually-created events.
    competitionFixtureId: uuid('competition_fixture_id').references(
      (): AnyPgColumn => competitionFixtures.id,
      { onDelete: 'cascade' },
    ),
    ...timestamps,
  },
  (table) => [
    index('events_team_id_index').on(table.teamId),
    index('events_team_scheduled_at_index').on(table.teamId, table.scheduledAt),
    index('events_competition_id_index').on(table.competitionId),
    index('events_competition_fixture_id_index').on(table.competitionFixtureId),
    uniqueIndex('events_team_competition_fixture_unique').on(
      table.teamId,
      table.competitionFixtureId,
    ),
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

export const competitionFormat = pgEnum('competition_format', [
  'league',
  'knockout',
  'league_knockout',
]);
export const fixtureStage = pgEnum('competition_fixture_stage', [
  'league',
  'knockout',
]);
export const fixtureStatus = pgEnum('competition_fixture_status', [
  'scheduled',
  'in_progress',
  'completed',
  'cancelled',
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
    // The user who administers this shared competition — normally the coach
    // who created it. Membership editing is gated on this, not teamId.
    // Nullable: legacy rows whose owning team has no coach member (and rows
    // written by older code paths) keep being managed through the team-scoped
    // statistics endpoints until those are retired.
    adminUserId: text('admin_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // Null configuration preserves competitions created by legacy callers.
    format: competitionFormat('format'),
    configuredTeamCount: integer('configured_team_count'),
    maxSubstitutes: integer('max_substitutes').default(5).notNull(),
    redCardSuspensionMatches: integer('red_card_suspension_matches')
      .default(1)
      .notNull(),
    accumulatedYellowThreshold: integer('accumulated_yellow_threshold')
      .default(5)
      .notNull(),
    yellowSuspensionMatches: integer('yellow_suspension_matches')
      .default(1)
      .notNull(),
    startDate: date('start_date'),
    // UTC weekdays: Sunday=0 ... Saturday=6; kickoff is explicitly UTC.
    allowedPlayingDays: integer('allowed_playing_days')
      .array()
      .default(sql`ARRAY[6]::integer[]`)
      .notNull(),
    defaultKickoffTime: text('default_kickoff_time').default('15:00').notNull(),
    fixturesPerOpponent: integer('fixtures_per_opponent').default(1).notNull(),
    pointsWin: integer('points_win').default(3).notNull(),
    pointsDraw: integer('points_draw').default(1).notNull(),
    pointsLoss: integer('points_loss').default(0).notNull(),
    qualifierCount: integer('qualifier_count'),
    // Marks when result-based standings became authoritative for this
    // competition. Existing aggregate standings rows act as the baseline;
    // only matches started after this point are added on top.
    resultTrackingStartedAt: timestamp('result_tracking_started_at', {
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      'competitions_settings_valid',
      sql`
      (${table.configuredTeamCount} is null or ${table.configuredTeamCount} between 2 and 128)
      and ${table.maxSubstitutes} between 0 and 99
      and ${table.redCardSuspensionMatches} between 0 and 99
      and ${table.accumulatedYellowThreshold} between 1 and 99
      and ${table.yellowSuspensionMatches} between 0 and 99
      and cardinality(${table.allowedPlayingDays}) between 1 and 7
      and ${table.allowedPlayingDays} <@ ARRAY[0,1,2,3,4,5,6]::integer[]
      and array_position(${table.allowedPlayingDays}, null) is null
      and ${table.defaultKickoffTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      and ${table.fixturesPerOpponent} in (1,2)
      and ${table.pointsWin} between 0 and 99 and ${table.pointsDraw} between 0 and 99 and ${table.pointsLoss} between 0 and 99
      and (${table.format} is null or (${table.type} = 'league' and ${table.format} = 'league') or (${table.type} = 'cup' and ${table.format} in ('knockout','league_knockout')))
      and (${table.format} is distinct from 'knockout' or ${table.configuredTeamCount} is null or ${table.configuredTeamCount} in (4,8,16,32))
      and (${table.qualifierCount} is null or (${table.format} is not null and ${table.format} = 'league_knockout' and ${table.qualifierCount} in (4,8,16,32) and ${table.configuredTeamCount} is not null and ${table.qualifierCount} <= ${table.configuredTeamCount}))
    `,
    ),
    index('competitions_team_id_index').on(table.teamId),
    index('competitions_season_id_index').on(table.seasonId),
    index('competitions_admin_user_id_index').on(table.adminUserId),
    // Competition names are globally unique, case-insensitively. The service
    // checks first with a friendly message; this index is the race backstop.
    uniqueIndex('competitions_name_lower_unique').on(sql`lower(${table.name})`),
  ],
);

// One participating team slot in a shared competition. A linked participant
// carries the real application team in `teamId`; a slot the admin added ahead
// of an invitation keeps it null and is known only by its display name. The
// creator's team is inserted automatically when the competition is created.
export const competitionTeams = pgTable(
  'competition_teams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    // Nullable until an invited coach accepts and their team is linked.
    teamId: uuid('team_id').references(() => teams.id, {
      onDelete: 'set null',
    }),
    displayName: text('display_name').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('competition_teams_competition_id_id_unique').on(
      table.competitionId,
      table.id,
    ),
    index('competition_teams_competition_id_index').on(table.competitionId),
    index('competition_teams_team_id_index').on(table.teamId),
    // A linked team can only occupy one slot per competition. Unlinked slots
    // (teamId null) never collide because the partial index skips them.
    uniqueIndex('competition_teams_competition_team_unique')
      .on(table.competitionId, table.teamId)
      .where(sql`${table.teamId} is not null`),
    // Display names are unique per competition, case-insensitively, so two
    // slots can never render the same team name.
    uniqueIndex('competition_teams_competition_display_name_unique').on(
      table.competitionId,
      sql`lower(${table.displayName})`,
    ),
  ],
);

export const competitionInviteStatus = pgEnum('competition_invite_status', [
  'pending',
  'used',
  'revoked',
]);

export const competitionInvites = pgTable(
  'competition_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    competitionTeamId: uuid('competition_team_id')
      .notNull()
      .references(() => competitionTeams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    status: competitionInviteStatus('status').default('pending').notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    usedByUserId: text('used_by_user_id').references(() => user.id),
    ...timestamps,
  },
  (table) => [
    index('competition_invites_competition_id_index').on(table.competitionId),
    uniqueIndex('competition_invites_pending_slot_unique')
      .on(table.competitionTeamId)
      .where(sql`${table.status} = 'pending'`),
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
    // For shared leagues/cups, identifies the selected competition participant.
    // Null for friendlies and legacy matches created before participant selection.
    opponentCompetitionTeamId: uuid('opponent_competition_team_id').references(
      () => competitionTeams.id,
      { onDelete: 'set null' },
    ),
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
    clockRevision: integer('clock_revision').default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    index('matches_competition_id_index').on(table.competitionId),
    index('matches_opponent_competition_team_id_index').on(
      table.opponentCompetitionTeamId,
    ),
    index('matches_game_plan_id_index').on(table.gamePlanId),
  ],
);

// Manually entered shared competition results for fixtures that were not
// completed through the live logger. Live-logged matches stay authoritative
// in `matches` + `match_events`; standings combine both sources at read time.
export const competitionMatches = pgTable(
  'competition_matches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    homeCompetitionTeamId: uuid('home_competition_team_id')
      .notNull()
      .references(() => competitionTeams.id, { onDelete: 'cascade' }),
    awayCompetitionTeamId: uuid('away_competition_team_id')
      .notNull()
      .references(() => competitionTeams.id, { onDelete: 'cascade' }),
    homeScore: integer('home_score').default(0).notNull(),
    awayScore: integer('away_score').default(0).notNull(),
    playedAt: timestamp('played_at', { withTimezone: true }).notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => user.id),
    ...timestamps,
  },
  (table) => [
    index('competition_matches_competition_id_index').on(table.competitionId),
    index('competition_matches_home_team_id_index').on(
      table.homeCompetitionTeamId,
    ),
    index('competition_matches_away_team_id_index').on(
      table.awayCompetitionTeamId,
    ),
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

// Legacy manual standings baseline. Shared competitions now calculate future
// movement from live-logged and admin-entered competition results. Kept for
// backwards compatibility with standings entered before result tracking.
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
    period: text('period').default('not_started').notNull(),
    matchElapsedMs: integer('match_elapsed_ms'),
    structuredPayload:
      jsonb('structured_payload').$type<Record<string, unknown>>(),
    lifecycleStatus: text('lifecycle_status').default('provisional').notNull(),
    rulesVersion: integer('rules_version').default(1).notNull(),
    projectionRevision: integer('projection_revision').default(0).notNull(),
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

/** Immutable evidence captured by one match-day device. The canonical
 * `match_events` ledger is derived from these rows; observations are never
 * edited or deleted by the application. */
export const matchEventObservations = pgTable(
  'match_event_observations',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id').notNull(),
    loggedByUserId: text('logged_by_user_id')
      .notNull()
      .references(() => user.id),
    schemaVersion: integer('schema_version').default(1).notNull(),
    eventType: matchEventType('event_type').notNull(),
    team: matchEventTeam('team').notNull(),
    athleteId: uuid('athlete_id').references(() => athletes.id, {
      onDelete: 'set null',
    }),
    opponentLabel: text('opponent_label'),
    opponentPlayerId: uuid('opponent_player_id').references(
      () => opponentMatchPlayers.id,
      { onDelete: 'set null' },
    ),
    period: text('period').notNull(),
    matchElapsedMs: integer('match_elapsed_ms').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    payloadHash: text('payload_hash').notNull(),
    clientCreatedAt: timestamp('client_created_at', {
      withTimezone: true,
    }).notNull(),
    serverReceivedAt: timestamp('server_received_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('match_event_observations_match_index').on(
      table.matchId,
      table.period,
      table.matchElapsedMs,
    ),
    index('match_event_observations_actor_index').on(table.loggedByUserId),
  ],
);

export const matchEventMemberships = pgTable(
  'match_event_memberships',
  {
    observationId: uuid('observation_id')
      .primaryKey()
      .references(() => matchEventObservations.id, { onDelete: 'cascade' }),
    canonicalEventId: uuid('canonical_event_id')
      .notNull()
      .references(() => matchEvents.id, { onDelete: 'cascade' }),
    projectionRevision: integer('projection_revision').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('match_event_memberships_canonical_index').on(table.canonicalEventId),
  ],
);

/** Immutable commands which explain every correction, void, merge, split and
 * conflict decision. Materialised match_events rows may change, but this
 * command history is append-only. */
export const matchEventOperations = pgTable(
  'match_event_operations',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id),
    operationType: text('operation_type').notNull(),
    targetObservationIds: jsonb('target_observation_ids')
      .$type<string[]>()
      .default([])
      .notNull(),
    canonicalEventId: uuid('canonical_event_id').references(
      () => matchEvents.id,
      { onDelete: 'set null' },
    ),
    causalParentIds: jsonb('causal_parent_ids')
      .$type<string[]>()
      .default([])
      .notNull(),
    decision: jsonb('decision').$type<Record<string, unknown>>().notNull(),
    reason: text('reason'),
    schemaVersion: integer('schema_version').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('match_event_operations_match_index').on(
      table.matchId,
      table.createdAt,
    ),
    index('match_event_operations_actor_index').on(table.actorUserId),
  ],
);

/** Append-only audit trail for shared clock commands. The matches row stores
 * the latest materialised clock while these rows preserve who requested every
 * transition and which authoritative revision it produced. */
export const matchClockOperations = pgTable(
  'match_clock_operations',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => user.id),
    period: text('period').notNull(),
    elapsedMs: integer('elapsed_ms').notNull(),
    running: boolean('running').notNull(),
    baseRevision: integer('base_revision').notNull(),
    appliedRevision: integer('applied_revision').notNull(),
    outcome: text('outcome').notNull(),
    payloadHash: text('payload_hash').notNull(),
    clientCreatedAt: timestamp('client_created_at', {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('match_clock_operations_match_revision_index').on(
      table.matchId,
      table.appliedRevision,
    ),
    index('match_clock_operations_actor_index').on(table.actorUserId),
  ],
);

export const matchEventReviews = pgTable(
  'match_event_reviews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    canonicalEventId: uuid('canonical_event_id')
      .notNull()
      .references(() => matchEvents.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: text('status').default('open').notNull(),
    resolution: text('resolution'),
    resolvedByUserId: text('resolved_by_user_id').references(() => user.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index('match_event_reviews_match_status_index').on(
      table.matchId,
      table.status,
    ),
    uniqueIndex('match_event_reviews_open_canonical_unique')
      .on(table.canonicalEventId)
      .where(sql`${table.status} = 'open'`),
  ],
);


// One shared fixture per pairing. Later knockout rounds have empty participant
// slots until winners advance through nextFixtureId + nextFixtureSlot.
export const competitionFixtures = pgTable(
  'competition_fixtures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    competitionId: uuid('competition_id')
      .notNull()
      .references(() => competitions.id, { onDelete: 'cascade' }),
    stage: fixtureStage('stage').notNull(),
    round: integer('round').notNull(),
    position: integer('position').notNull(),
    homeCompetitionTeamId: uuid('home_competition_team_id'),
    awayCompetitionTeamId: uuid('away_competition_team_id'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: fixtureStatus('status').default('scheduled').notNull(),
    homeScore: integer('home_score'),
    awayScore: integer('away_score'),
    homePenaltyScore: integer('home_penalty_score'),
    awayPenaltyScore: integer('away_penalty_score'),
    winnerCompetitionTeamId: uuid('winner_competition_team_id'),
    nextFixtureId: uuid('next_fixture_id'),
    nextFixtureSlot: text('next_fixture_slot'),
    linkedMatchId: uuid('linked_match_id').references(() => matches.id),
    legacyResultId: uuid('legacy_result_id').references(
      () => competitionMatches.id,
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('competition_fixtures_competition_id_id_unique').on(
      table.competitionId,
      table.id,
    ),
    uniqueIndex('competition_fixtures_round_position_unique').on(
      table.competitionId,
      table.stage,
      table.round,
      table.position,
    ),
    uniqueIndex('competition_fixtures_pair_unique').on(
      table.competitionId,
      table.stage,
      table.homeCompetitionTeamId,
      table.awayCompetitionTeamId,
    ),
    uniqueIndex('competition_fixtures_next_slot_unique').on(
      table.nextFixtureId,
      table.nextFixtureSlot,
    ),
    uniqueIndex('competition_fixtures_linked_match_unique').on(
      table.linkedMatchId,
    ),
    uniqueIndex('competition_fixtures_legacy_result_unique').on(
      table.legacyResultId,
    ),
    foreignKey({
      name: 'competition_fixtures_home_participant_fk',
      columns: [table.competitionId, table.homeCompetitionTeamId],
      foreignColumns: [competitionTeams.competitionId, competitionTeams.id],
    }),
    foreignKey({
      name: 'competition_fixtures_away_participant_fk',
      columns: [table.competitionId, table.awayCompetitionTeamId],
      foreignColumns: [competitionTeams.competitionId, competitionTeams.id],
    }),
    foreignKey({
      name: 'competition_fixtures_winner_participant_fk',
      columns: [table.competitionId, table.winnerCompetitionTeamId],
      foreignColumns: [competitionTeams.competitionId, competitionTeams.id],
    }),
    foreignKey({
      name: 'competition_fixtures_next_fixture_fk',
      columns: [table.competitionId, table.nextFixtureId],
      foreignColumns: [table.competitionId, table.id],
    }),
    check(
      'competition_fixtures_valid',
      sql`
    ${table.round} > 0 and ${table.position} > 0
    and (${table.homeCompetitionTeamId} is null or ${table.awayCompetitionTeamId} is null or ${table.homeCompetitionTeamId} <> ${table.awayCompetitionTeamId})
    and (${table.stage} = 'knockout' or (${table.homeCompetitionTeamId} is not null and ${table.awayCompetitionTeamId} is not null and ${table.nextFixtureId} is null))
    and ((${table.nextFixtureId} is null and ${table.nextFixtureSlot} is null) or (${table.nextFixtureId} is not null and ${table.nextFixtureId} <> ${table.id} and ${table.nextFixtureSlot} is not null and ${table.nextFixtureSlot} in ('home','away')))
    and ((${table.homeScore} is null and ${table.awayScore} is null) or (${table.homeScore} between 0 and 99 and ${table.awayScore} between 0 and 99 and ${table.homeScore} is not null and ${table.awayScore} is not null))
    and ((${table.homePenaltyScore} is null and ${table.awayPenaltyScore} is null) or (${table.stage} = 'knockout' and ${table.homePenaltyScore} between 0 and 99 and ${table.awayPenaltyScore} between 0 and 99 and ${table.homePenaltyScore} is not null and ${table.awayPenaltyScore} is not null))
    and (${table.winnerCompetitionTeamId} is null or (${table.homeCompetitionTeamId} is not null and ${table.awayCompetitionTeamId} is not null and ${table.winnerCompetitionTeamId} in (${table.homeCompetitionTeamId}, ${table.awayCompetitionTeamId})))
    and (${table.status} <> 'completed' or (${table.homeCompetitionTeamId} is not null and ${table.awayCompetitionTeamId} is not null and ${table.homeScore} is not null and ${table.awayScore} is not null and (${table.stage} <> 'knockout' or ${table.winnerCompetitionTeamId} is not null)))
  `,
    ),
  ],
);


/** One authoritative projection revision for every consumer of a match. */
export const matchProjectionState = pgTable('match_projection_state', {
  matchId: uuid('match_id')
    .primaryKey()
    .references(() => matches.id, { onDelete: 'cascade' }),
  revision: integer('revision').default(0).notNull(),
  inputDigest: text('input_digest').notNull(),
  rulesVersion: integer('rules_version').default(1).notNull(),
  confirmedTeamScore: integer('confirmed_team_score').default(0).notNull(),
  confirmedOpponentScore: integer('confirmed_opponent_score')
    .default(0)
    .notNull(),
  provisionalTeamScore: integer('provisional_team_score').default(0).notNull(),
  provisionalOpponentScore: integer('provisional_opponent_score')
    .default(0)
    .notNull(),
  possibleEffects: jsonb('possible_effects')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  disciplinaryProjection: jsonb('disciplinary_projection')
    .$type<Record<string, unknown>>()
    .default({})
    .notNull(),
  unresolvedReviewCount: integer('unresolved_review_count')
    .default(0)
    .notNull(),
  finalisationState: text('finalisation_state').default('open').notNull(),
  finalisedByUserId: text('finalised_by_user_id').references(() => user.id),
  finalisedAt: timestamp('finalised_at', { withTimezone: true }),
  ...timestamps,
});

/** Durable acknowledgement for each submitted observation or operation. */
export const syncUploadReceipts = pgTable(
  'sync_upload_receipts',
  {
    id: uuid('id').primaryKey(),
    submittedByUserId: text('submitted_by_user_id')
      .notNull()
      .references(() => user.id),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    itemType: text('item_type').notNull(),
    payloadHash: text('payload_hash').notNull(),
    outcome: text('outcome').notNull(),
    safeErrorCode: text('safe_error_code'),
    processingDurationMs: integer('processing_duration_ms'),
    canonicalEventId: uuid('canonical_event_id').references(
      () => matchEvents.id,
      { onDelete: 'set null' },
    ),
    ...timestamps,
  },
  (table) => [
    index('sync_upload_receipts_user_index').on(
      table.submittedByUserId,
      table.createdAt,
    ),
  ],
);

/** Latest non-sensitive queue health reported by each browser installation. */
export const syncClientTelemetry = pgTable(
  'sync_client_telemetry',
  {
    deviceId: uuid('device_id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, {
      onDelete: 'cascade',
    }),
    pendingCount: integer('pending_count').default(0).notNull(),
    rejectedCount: integer('rejected_count').default(0).notNull(),
    oldestPendingAt: timestamp('oldest_pending_at', { withTimezone: true }),
    lastSuccessfulSyncAt: timestamp('last_successful_sync_at', {
      withTimezone: true,
    }),
    deployment: text('deployment').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('sync_client_telemetry_team_index').on(table.teamId, table.updatedAt),
  ],
);
