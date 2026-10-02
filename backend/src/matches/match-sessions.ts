import { and, eq, inArray, isNull } from 'drizzle-orm';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  competitionFixtures,
  competitionTeams,
  friendlyFixtures,
  matchSessionParticipants,
  matchSessions,
} from '../database/schema';

const logger = new Logger('MatchSessions');

export function twoSidedLiveLoggingEnabled(): boolean {
  return (
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED?.trim().toLowerCase() === 'true'
  );
}

async function ensureFriendlyParticipants(
  databaseService: DatabaseService,
  sessionId: string,
  fixture: typeof friendlyFixtures.$inferSelect,
) {
  await databaseService.database
    .insert(matchSessionParticipants)
    .values([
      { sessionId, teamId: fixture.requesterTeamId, side: 'home' },
      { sessionId, teamId: fixture.opponentTeamId, side: 'away' },
    ])
    .onConflictDoNothing();
}

async function ensureCompetitionParticipants(
  databaseService: DatabaseService,
  sessionId: string,
  fixture: typeof competitionFixtures.$inferSelect,
) {
  const ids = [
    fixture.homeCompetitionTeamId,
    fixture.awayCompetitionTeamId,
  ].filter((id): id is string => Boolean(id));
  if (!ids.length) return;

  const participants = await databaseService.database
    .select({ id: competitionTeams.id, teamId: competitionTeams.teamId })
    .from(competitionTeams)
    .where(
      and(
        eq(competitionTeams.competitionId, fixture.competitionId),
        inArray(competitionTeams.id, ids),
      ),
    );
  const rows = [
    ...(['home', 'away'] as const).flatMap((side) => {
      const competitionTeamId =
        side === 'home'
          ? fixture.homeCompetitionTeamId
          : fixture.awayCompetitionTeamId;
      const participant = participants.find(
        (row) => row.id === competitionTeamId,
      );
      return participant
        ? [
            {
              sessionId,
              teamId: participant.teamId,
              competitionTeamId: participant.id,
              side,
            },
          ]
        : [];
    }),
  ];
  if (rows.length) {
    await databaseService.database
      .insert(matchSessionParticipants)
      .values(rows)
      .onConflictDoNothing();
  }
}

export async function ensureFriendlyFixtureSession(
  databaseService: DatabaseService,
  fixtureId: string,
): Promise<string | null> {
  if (!twoSidedLiveLoggingEnabled()) return null;
  const [fixture] = await databaseService.database
    .select()
    .from(friendlyFixtures)
    .where(eq(friendlyFixtures.id, fixtureId))
    .limit(1);
  if (!fixture || fixture.status !== 'accepted') return null;
  if (fixture.sharedSessionId) {
    await ensureFriendlyParticipants(
      databaseService,
      fixture.sharedSessionId,
      fixture,
    );
    return fixture.sharedSessionId;
  }

  const [candidate] = await databaseService.database
    .insert(matchSessions)
    .values({})
    .returning({ id: matchSessions.id });
  if (!candidate) return null;
  const [updated] = await databaseService.database
    .update(friendlyFixtures)
    .set({ sharedSessionId: candidate.id, updatedAt: new Date() })
    .where(
      and(
        eq(friendlyFixtures.id, fixture.id),
        isNull(friendlyFixtures.sharedSessionId),
      ),
    )
    .returning({ sharedSessionId: friendlyFixtures.sharedSessionId });
  const sessionId = updated?.sharedSessionId ?? fixture.sharedSessionId;
  if (!updated) {
    const [winner] = await databaseService.database
      .select({ sharedSessionId: friendlyFixtures.sharedSessionId })
      .from(friendlyFixtures)
      .where(eq(friendlyFixtures.id, fixture.id))
      .limit(1);
    await databaseService.database
      .delete(matchSessions)
      .where(eq(matchSessions.id, candidate.id));
    const winningSessionId = winner?.sharedSessionId ?? sessionId;
    if (!winningSessionId) return null;
    logger.warn(
      `Duplicate friendly session candidate discarded for fixture ${fixture.id}; using ${winningSessionId}.`,
    );
    await ensureFriendlyParticipants(
      databaseService,
      winningSessionId,
      fixture,
    );
    return winningSessionId;
  }
  if (!sessionId) return null;

  await ensureFriendlyParticipants(databaseService, sessionId, fixture);
  return sessionId;
}

export async function ensureCompetitionFixtureSession(
  databaseService: DatabaseService,
  fixtureId: string,
): Promise<string | null> {
  if (!twoSidedLiveLoggingEnabled()) return null;
  const [fixture] = await databaseService.database
    .select()
    .from(competitionFixtures)
    .where(eq(competitionFixtures.id, fixtureId))
    .limit(1);
  if (!fixture) return null;
  if (fixture.sharedSessionId) {
    await ensureCompetitionParticipants(
      databaseService,
      fixture.sharedSessionId,
      fixture,
    );
    return fixture.sharedSessionId;
  }
  const [candidate] = await databaseService.database
    .insert(matchSessions)
    .values({})
    .returning({ id: matchSessions.id });
  if (!candidate) return null;
  const [updated] = await databaseService.database
    .update(competitionFixtures)
    .set({ sharedSessionId: candidate.id, updatedAt: new Date() })
    .where(
      and(
        eq(competitionFixtures.id, fixture.id),
        isNull(competitionFixtures.sharedSessionId),
      ),
    )
    .returning({ sharedSessionId: competitionFixtures.sharedSessionId });
  const sessionId = updated?.sharedSessionId ?? fixture.sharedSessionId;
  if (!updated) {
    const [winner] = await databaseService.database
      .select({ sharedSessionId: competitionFixtures.sharedSessionId })
      .from(competitionFixtures)
      .where(eq(competitionFixtures.id, fixture.id))
      .limit(1);
    await databaseService.database
      .delete(matchSessions)
      .where(eq(matchSessions.id, candidate.id));
    const winningSessionId = winner?.sharedSessionId ?? sessionId;
    if (!winningSessionId) return null;
    logger.warn(
      `Duplicate competition session candidate discarded for fixture ${fixture.id}; using ${winningSessionId}.`,
    );
    await ensureCompetitionParticipants(
      databaseService,
      winningSessionId,
      fixture,
    );
    return winningSessionId;
  }
  if (!sessionId) return null;

  await ensureCompetitionParticipants(databaseService, sessionId, fixture);
  return sessionId;
}
