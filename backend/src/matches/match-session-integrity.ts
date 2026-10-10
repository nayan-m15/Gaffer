import { ConflictException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  competitionFixtures,
  competitionTeams,
  events,
  friendlyFixtures,
  matches,
  matchSessionParticipants,
  matchSessions,
} from '../database/schema';
import {
  ensureCompetitionFixtureSession,
  ensureFriendlyFixtureSession,
  twoSidedLiveLoggingEnabled,
} from './match-sessions';

export type SharedMatchErrorCode =
  | 'SHARED_MATCH_SESSION_REQUIRED'
  | 'SHARED_MATCH_SESSION_CONFLICT'
  | 'SHARED_MATCH_RECONCILIATION_REQUIRED'
  | 'SHARED_MATCH_RESULT_NOT_FINALISED';

export function sharedMatchConflict(
  code: SharedMatchErrorCode,
): ConflictException {
  const messages: Record<SharedMatchErrorCode, string> = {
    SHARED_MATCH_SESSION_REQUIRED:
      'This fixture requires a valid shared match session. Retry match setup before logging or confirming.',
    SHARED_MATCH_SESSION_CONFLICT:
      'The match sheet, fixture or participant side has a conflicting shared identity.',
    SHARED_MATCH_RECONCILIATION_REQUIRED:
      'This unlinked sheet already has match history and requires reconciliation. Its records have not been relinked.',
    SHARED_MATCH_RESULT_NOT_FINALISED:
      'The shared session must complete result confirmation and review before publishing this fixture.',
  };
  return new ConflictException({
    statusCode: 409,
    code,
    message: messages[code],
  });
}

export interface MatchSessionIdentity {
  state:
    | 'legacy_allowed'
    | 'shared_valid'
    | 'shared_attachable'
    | 'shared_missing_link'
    | 'shared_conflict';
  fixtureType: 'friendly' | 'competition' | null;
  fixtureId: string | null;
  fixtureSharedSessionId: string | null;
  owningMatchSharedSessionId: string | null;
  participantTeamId: string | null;
  participantSide: 'home' | 'away' | null;
  participants: Array<{ teamId: string | null; side: 'home' | 'away' }>;
  reconciliationRequired: boolean;
}

/** Read-only unless explicitly ensuring a session for a safe start/retry. */
export async function resolveMatchSessionIdentity(
  database: DatabaseService,
  event: typeof events.$inferSelect,
  match?: typeof matches.$inferSelect,
  options: { ensureSession?: boolean; ignoreFeatureFlag?: boolean } = {},
): Promise<MatchSessionIdentity> {
  const identity: MatchSessionIdentity = {
    state: 'legacy_allowed',
    fixtureType: event.competitionFixtureId
      ? 'competition'
      : event.friendlyFixtureId
        ? 'friendly'
        : null,
    fixtureId: event.competitionFixtureId ?? event.friendlyFixtureId,
    fixtureSharedSessionId: null,
    owningMatchSharedSessionId: match?.sharedMatchId ?? null,
    participantTeamId: event.teamId,
    participantSide: null,
    participants: [],
    reconciliationRequired: false,
  };
  if (!identity.fixtureId) return identity;
  if (!options.ignoreFeatureFlag && !twoSidedLiveLoggingEnabled()) {
    // A disabled/older server must not create independent history for a fixture
    // that another server already enrolled in shared logging.
    const table =
      identity.fixtureType === 'competition'
        ? competitionFixtures
        : friendlyFixtures;
    const [fixture] = await database.database
      .select({ sharedSessionId: table.sharedSessionId })
      .from(table)
      .where(eq(table.id, identity.fixtureId))
      .limit(1);
    if (fixture?.sharedSessionId) {
      identity.fixtureSharedSessionId = fixture.sharedSessionId;
      return { ...identity, state: 'shared_missing_link' };
    }
    return identity;
  }
  let eligible = false;
  let completed = false;
  if (identity.fixtureType === 'competition') {
    const [fixture] = await database.database
      .select()
      .from(competitionFixtures)
      .where(eq(competitionFixtures.id, identity.fixtureId))
      .limit(1);
    if (!fixture) return { ...identity, state: 'shared_missing_link' };
    identity.fixtureSharedSessionId = fixture.sharedSessionId;
    completed = fixture.status === 'completed';
    const ids = [
      fixture.homeCompetitionTeamId,
      fixture.awayCompetitionTeamId,
    ].filter((id): id is string => Boolean(id));
    const rows = ids.length
      ? await database.database
          .select()
          .from(competitionTeams)
          .where(
            and(
              eq(competitionTeams.competitionId, fixture.competitionId),
              inArray(competitionTeams.id, ids),
            ),
          )
      : [];
    identity.participants = (['home', 'away'] as const).map((side) => ({
      side,
      teamId:
        rows.find(
          (row) =>
            row.id ===
            (side === 'home'
              ? fixture.homeCompetitionTeamId
              : fixture.awayCompetitionTeamId),
        )?.teamId ?? null,
    }));
    eligible =
      identity.participants.every((row) => row.teamId !== null) ||
      fixture.sharedSessionId !== null;
  } else {
    const [fixture] = await database.database
      .select()
      .from(friendlyFixtures)
      .where(eq(friendlyFixtures.id, identity.fixtureId))
      .limit(1);
    if (!fixture) return { ...identity, state: 'shared_missing_link' };
    identity.fixtureSharedSessionId = fixture.sharedSessionId;
    identity.participants = [
      { teamId: fixture.requesterTeamId, side: 'home' },
      { teamId: fixture.opponentTeamId, side: 'away' },
    ];
    eligible = fixture.status === 'accepted';
  }
  if (!eligible) return identity;
  identity.participantSide =
    identity.participants.find((row) => row.teamId === event.teamId)?.side ??
    null;
  if (
    !identity.participantSide ||
    identity.participants[0].teamId === identity.participants[1].teamId
  )
    return { ...identity, state: 'shared_conflict' };
  if (
    match?.sharedMatchId &&
    match.sharedMatchId !== identity.fixtureSharedSessionId
  )
    return { ...identity, state: 'shared_conflict' };
  // Starting under the flag-off contract may have already created evidence.
  // Do not reinterpret any of it by filling the sheet link.
  if (match && !match.sharedMatchId) {
    const result = await database.database.execute<{ history: boolean }>(sql`
      SELECT (${event.status !== 'scheduled'}::boolean OR ${completed}::boolean
        OR EXISTS (SELECT 1 FROM match_event_observations WHERE match_id = ${match.id}::uuid)
        OR EXISTS (SELECT 1 FROM match_events WHERE match_id = ${match.id}::uuid)
        OR EXISTS (SELECT 1 FROM match_event_operations WHERE match_id = ${match.id}::uuid)
        OR EXISTS (SELECT 1 FROM match_event_reviews WHERE match_id = ${match.id}::uuid)
        OR EXISTS (SELECT 1 FROM match_clock_operations WHERE match_id = ${match.id}::uuid)
        OR EXISTS (SELECT 1 FROM match_projection_state WHERE match_id = ${match.id}::uuid
          AND (finalisation_state <> 'open' OR finalised_at IS NOT NULL OR session_id IS NOT NULL))
        OR EXISTS (SELECT 1 FROM matches WHERE id = ${match.id}::uuid
          AND (clock_period <> 'not_started' OR clock_revision <> 0 OR clock_elapsed_ms <> 0 OR clock_started_at IS NOT NULL))
        OR EXISTS (SELECT 1 FROM match_sessions WHERE id = ${identity.fixtureSharedSessionId}::uuid
          AND (home_confirmed_at IS NOT NULL OR away_confirmed_at IS NOT NULL OR finalised_at IS NOT NULL))
      ) AS history`);
    identity.reconciliationRequired = result.rows[0]?.history === true;
    if (identity.reconciliationRequired)
      return { ...identity, state: 'shared_missing_link' };
  }
  if (options.ensureSession && !identity.fixtureSharedSessionId) {
    identity.fixtureSharedSessionId =
      identity.fixtureType === 'competition'
        ? await ensureCompetitionFixtureSession(database, identity.fixtureId)
        : await ensureFriendlyFixtureSession(database, identity.fixtureId);
  }
  if (!identity.fixtureSharedSessionId)
    return { ...identity, state: 'shared_missing_link' };
  const [session] = await database.database
    .select({ id: matchSessions.id })
    .from(matchSessions)
    .where(eq(matchSessions.id, identity.fixtureSharedSessionId))
    .limit(1);
  const participants = await database.database
    .select()
    .from(matchSessionParticipants)
    .where(
      eq(matchSessionParticipants.sessionId, identity.fixtureSharedSessionId),
    );
  if (
    !session ||
    identity.participants.some(
      (expected) =>
        !participants.some(
          (actual) =>
            actual.teamId === expected.teamId && actual.side === expected.side,
        ),
    )
  )
    return { ...identity, state: 'shared_conflict' };
  if (!match?.sharedMatchId) return { ...identity, state: 'shared_attachable' };
  if (match.isHome !== (identity.participantSide === 'home'))
    return { ...identity, state: 'shared_conflict' };
  return { ...identity, state: 'shared_valid' };
}

export function assertMatchSessionIdentity(
  identity: MatchSessionIdentity,
  allowAttachment = false,
): void {
  if (identity.state === 'legacy_allowed' || identity.state === 'shared_valid')
    return;
  if (allowAttachment && identity.reconciliationRequired)
    throw sharedMatchConflict('SHARED_MATCH_RECONCILIATION_REQUIRED');
  if (identity.state === 'shared_conflict')
    throw sharedMatchConflict('SHARED_MATCH_SESSION_CONFLICT');
  if (allowAttachment && identity.state === 'shared_attachable') return;
  throw sharedMatchConflict('SHARED_MATCH_SESSION_REQUIRED');
}
