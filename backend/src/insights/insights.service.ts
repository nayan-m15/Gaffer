import { Injectable, Logger } from '@nestjs/common';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athletes,
  athleteMatchStats,
  competitions,
  events,
  matchEvents,
  matchInsights,
  matches,
  opponentMatchPlayers,
  teams,
} from '../database/schema';
import { buildTrends, summariseMatches } from '../statistics/statistics.trends';
import { GeminiClient, GeminiNotConfiguredError } from './gemini-client';
import {
  buildInsightPrompt,
  computeInputDigest,
  type InsightAthletePerformance,
  type InsightEventSummary,
  type InsightSeasonContext,
} from './insight-prompt';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const PROMPT_VERSION = 1;

function matchGoalCount(team: 'own' | 'opponent') {
  return sql<number>`coalesce((
    select count(*)::int from ${matchEvents}
    where ${matchEvents.matchId} = ${matches.id}
      and ${matchEvents.team} = ${team}
      and ${matchEvents.eventType} = 'goal'
      and ${matchEvents.lifecycleStatus} <> 'voided'
  ), 0)`;
}

export interface MatchInsightSummary {
  matchId: string;
  status: 'pending' | 'ready' | 'failed' | 'stale';
  narrativeText: string | null;
  highlights: Record<string, unknown> | null;
  generatedAt: string | null;
}

/**
 * Generates and serves LLM narrative summaries for finalised matches.
 *
 * Generation is triggered by `MatchesService.finaliseProjection` and always
 * resolves (never throws) — a Gemini failure leaves a `failed` row rather
 * than surfacing to the caller, so it can never block match finalisation.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly geminiClient: GeminiClient,
  ) {}

  /** Generates (or skips, if nothing changed) the insight for a match. Never throws. */
  async generateForMatch(
    matchId: string,
    options: { projectionRevision: number },
  ): Promise<void> {
    try {
      await this.runGeneration(matchId, options.projectionRevision);
    } catch (error) {
      await this.markFailed(matchId, error);
    }
  }

  async getForMatch(matchId: string): Promise<MatchInsightSummary | null> {
    const [row] = await this.databaseService.database
      .select()
      .from(matchInsights)
      .where(eq(matchInsights.matchId, matchId))
      .limit(1);
    return row ? this.toSummary(row) : null;
  }

  async getRecentForTeam(
    teamId: string,
    limit: number,
  ): Promise<MatchInsightSummary[]> {
    const rows = await this.databaseService.database
      .select({ insight: matchInsights })
      .from(matchInsights)
      .innerJoin(matches, eq(matchInsights.matchId, matches.id))
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(
        and(eq(events.teamId, teamId), eq(matchInsights.status, 'ready')),
      )
      .orderBy(desc(events.scheduledAt))
      .limit(limit);
    return rows.map((row) => this.toSummary(row.insight));
  }

  /** Flags a previously-generated insight as outdated after a match is reopened. */
  async markStale(matchId: string): Promise<void> {
    await this.databaseService.database
      .update(matchInsights)
      .set({ status: 'stale', updatedAt: new Date() })
      .where(
        and(
          eq(matchInsights.matchId, matchId),
          eq(matchInsights.status, 'ready'),
        ),
      );
  }

  private toSummary(row: typeof matchInsights.$inferSelect): MatchInsightSummary {
    return {
      matchId: row.matchId,
      status: row.status,
      narrativeText: row.narrativeText,
      highlights: row.highlights,
      generatedAt: row.generatedAt?.toISOString() ?? null,
    };
  }

  private async runGeneration(
    matchId: string,
    projectionRevision: number,
  ): Promise<void> {
    const context = await this.loadContext(matchId);
    if (!context) return; // match vanished between finalise and generation

    const { prompt, digestPayload } = buildInsightPrompt({
      teamName: context.teamName,
      match: context.match,
      events: context.events,
      athletePerformances: context.athletePerformances,
      season: context.season,
    });
    const inputDigest = computeInputDigest(digestPayload);

    const [existing] = await this.databaseService.database
      .select({
        status: matchInsights.status,
        inputDigest: matchInsights.inputDigest,
      })
      .from(matchInsights)
      .where(eq(matchInsights.matchId, matchId))
      .limit(1);

    if (existing?.status === 'ready' && existing.inputDigest === inputDigest) {
      return; // nothing changed since the last successful generation
    }

    const narrativeText = await this.geminiClient.generateNarrative(prompt);
    const modelName = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

    const values = {
      matchId,
      status: 'ready' as const,
      narrativeText,
      model: modelName,
      promptVersion: PROMPT_VERSION,
      inputDigest,
      projectionRevision,
      generatedAt: new Date(),
      failureReason: null,
      attemptCount: 1,
    };
    await this.databaseService.database
      .insert(matchInsights)
      .values(values)
      .onConflictDoUpdate({
        target: matchInsights.matchId,
        set: {
          ...values,
          attemptCount: sql`${matchInsights.attemptCount} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Records a failed attempt without ever touching `narrativeText` — a prior
   * good insight stays visible even if a later re-finalise attempt fails.
   */
  private async markFailed(matchId: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof GeminiNotConfiguredError)) {
      this.logger.warn(
        `Insight generation failed for match ${matchId}: ${message}`,
      );
    }
    await this.databaseService.database
      .insert(matchInsights)
      .values({
        matchId,
        status: 'failed',
        failureReason: message,
        attemptCount: 1,
      })
      .onConflictDoUpdate({
        target: matchInsights.matchId,
        set: {
          status: 'failed',
          failureReason: message,
          attemptCount: sql`${matchInsights.attemptCount} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  private async loadContext(matchId: string): Promise<{
    teamName: string;
    match: {
      opponentName: string;
      isHome: boolean;
      teamScore: number;
      opponentScore: number;
      date: string;
      competitionName: string | null;
    };
    events: InsightEventSummary[];
    athletePerformances: InsightAthletePerformance[];
    season: InsightSeasonContext | null;
  } | null> {
    const [row] = await this.databaseService.database
      .select({
        opponentName: matches.opponentName,
        isHome: matches.isHome,
        competitionId: matches.competitionId,
        teamScore: matchGoalCount('own'),
        opponentScore: matchGoalCount('opponent'),
        eventDate: events.scheduledAt,
        teamId: events.teamId,
        teamName: teams.name,
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .innerJoin(teams, eq(events.teamId, teams.id))
      .where(eq(matches.id, matchId))
      .limit(1);
    if (!row) return null;

    let competitionName: string | null = null;
    if (row.competitionId) {
      const [competition] = await this.databaseService.database
        .select({ name: competitions.name })
        .from(competitions)
        .where(eq(competitions.id, row.competitionId))
        .limit(1);
      competitionName = competition?.name ?? null;
    }

    const eventRows = await this.databaseService.database
      .select({
        eventType: matchEvents.eventType,
        team: matchEvents.team,
        minute: matchEvents.minute,
        athleteFirstName: athletes.firstName,
        athleteLastName: athletes.lastName,
        opponentLabel: matchEvents.opponentLabel,
        opponentPlayerName: opponentMatchPlayers.name,
        opponentPlayerNumber: opponentMatchPlayers.shirtNumber,
      })
      .from(matchEvents)
      .leftJoin(athletes, eq(matchEvents.athleteId, athletes.id))
      .leftJoin(
        opponentMatchPlayers,
        eq(matchEvents.opponentPlayerId, opponentMatchPlayers.id),
      )
      .where(
        and(
          eq(matchEvents.matchId, matchId),
          sql`${matchEvents.lifecycleStatus} <> 'voided'`,
        ),
      )
      .orderBy(asc(matchEvents.minute));

    const eventSummaries: InsightEventSummary[] = eventRows.map((event) => ({
      eventType: event.eventType,
      team: event.team,
      minute: event.minute,
      athleteName: event.athleteFirstName
        ? `${event.athleteFirstName} ${event.athleteLastName}`
        : null,
      opponentLabel:
        event.opponentLabel ??
        event.opponentPlayerName ??
        (event.opponentPlayerNumber != null
          ? `#${event.opponentPlayerNumber}`
          : null),
    }));

    const performanceRows = await this.databaseService.database
      .select({
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        goals: sql<number>`count(*) filter (where ${matchEvents.eventType} = 'goal')::int`,
        assists: sql<number>`count(*) filter (where ${matchEvents.eventType} = 'assist')::int`,
        yellowCards: sql<number>`count(*) filter (where ${matchEvents.eventType} = 'yellow_card')::int`,
        redCards: sql<number>`count(*) filter (where ${matchEvents.eventType} = 'red_card')::int`,
      })
      .from(matchEvents)
      .innerJoin(athletes, eq(matchEvents.athleteId, athletes.id))
      .where(
        and(
          eq(matchEvents.matchId, matchId),
          eq(matchEvents.team, 'own'),
          sql`${matchEvents.lifecycleStatus} <> 'voided'`,
        ),
      )
      .groupBy(athletes.id, athletes.firstName, athletes.lastName);

    const athletePerformances: InsightAthletePerformance[] =
      performanceRows.map((row) => ({
        athleteName: `${row.firstName} ${row.lastName}`,
        goals: row.goals,
        assists: row.assists,
        yellowCards: row.yellowCards,
        redCards: row.redCards,
      }));

    const teamMatches = await this.databaseService.database
      .select({
        matchId: matches.id,
        eventId: matches.eventId,
        date: events.scheduledAt,
        opponent: matches.opponentName,
        isHome: matches.isHome,
        teamScore: matchGoalCount('own'),
        opponentScore: matchGoalCount('opponent'),
      })
      .from(matches)
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(and(eq(events.teamId, row.teamId), eq(events.status, 'completed')))
      .orderBy(asc(events.scheduledAt));

    const { totals, entries } = summariseMatches(teamMatches);
    const trendAnalysis = buildTrends(entries);
    const season: InsightSeasonContext | null =
      totals.matchesPlayed > 0
        ? {
            matchesPlayed: totals.matchesPlayed,
            wins: totals.wins,
            draws: totals.draws,
            losses: totals.losses,
            deltas: trendAnalysis.periods.deltas,
          }
        : null;

    return {
      teamName: row.teamName,
      match: {
        opponentName: row.opponentName,
        isHome: row.isHome,
        teamScore: row.teamScore,
        opponentScore: row.opponentScore,
        date: row.eventDate.toISOString(),
        competitionName,
      },
      events: eventSummaries,
      athletePerformances,
      season,
    };
  }
}
