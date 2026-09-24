import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { and, asc, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
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
  seasonInsights,
  teams,
} from '../database/schema';
import { SeasonsService } from '../seasons/seasons.service';
import type { SeasonWindow } from '../seasons/season-window';
import { buildTrends, summariseMatches } from '../statistics/statistics.trends';
import { GeminiClient, GeminiNotConfiguredError } from './gemini-client';
import {
  buildInsightPrompt,
  computeInputDigest,
  parseInsightResponse,
  sanitizePlayerOfTheMatch,
  type InsightAthletePerformance,
  type InsightEventSummary,
  type InsightSeasonContext,
} from './insight-prompt';
import {
  buildSeasonInsightPrompt,
  computeSeasonInputDigest,
  type SeasonInsightTopPlayer,
} from './season-insight-prompt';

const DEFAULT_MODEL = 'gemini-3.8-flash';
const PROMPT_VERSION = 1;
const ASSISTANT_RETRY_DELAY_MS = 1_000;

/** 503s from Gemini's free tier ("currently experiencing high demand") are
 * transient capacity issues, not something retrying with the same prompt
 * will avoid triggering again on a genuinely broken request. */
function isRetryableGeminiError(error: unknown): boolean {
  return error instanceof GoogleGenerativeAIFetchError && error.status === 503;
}

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

export interface SeasonInsightSummary {
  teamId: string;
  seasonId: string | null;
  status: 'pending' | 'ready' | 'failed';
  narrativeText: string | null;
  generatedAt: string | null;
  failureReason: string | null;
}

export interface AssistantAnswer {
  status: 'ready' | 'failed';
  answer: string | null;
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
    private readonly seasonsService: SeasonsService,
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

  /**
   * Answers a free-text stats question with a plain-text Gemini call. Fully
   * stateless — nothing is written to the database, since a unique question
   * has no meaningful cache key. Never throws; a Gemini failure comes back
   * as `{ status: 'failed', answer: null }` for the caller to render as a
   * friendly "couldn't answer that" message.
   *
   * Unlike the match/season insight generators, this retries once on a 503
   * ("high demand") — it's a single user-initiated click rather than an
   * automatic background job, so one extra attempt is cheap and meaningfully
   * improves the odds of a real answer instead of asking the coach to
   * manually retype the same question.
   */
  async answerQuestion(prompt: string): Promise<AssistantAnswer> {
    try {
      const answer = await this.generateNarrativeWithRetry(prompt);
      return { status: 'ready', answer };
    } catch (error) {
      if (!(error instanceof GeminiNotConfiguredError)) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Assistant query failed: ${message}`);
      }
      return { status: 'failed', answer: null };
    }
  }

  private async generateNarrativeWithRetry(prompt: string): Promise<string> {
    try {
      return await this.geminiClient.generateNarrative(prompt);
    } catch (error) {
      if (!isRetryableGeminiError(error)) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, ASSISTANT_RETRY_DELAY_MS),
      );
      return this.geminiClient.generateNarrative(prompt);
    }
  }

  /**
   * Generates (or returns the cached, still-valid) season-summary narrative
   * for a team. Unlike `generateForMatch`, this is coach-triggered (a
   * "Generate season summary" button) rather than fire-and-forget, so it
   * runs synchronously and returns the resulting row — but still never
   * throws; a Gemini failure comes back as a `failed` summary.
   */
  async generateSeasonInsight(
    teamId: string,
    seasonId: string | null,
    userId: string,
  ): Promise<SeasonInsightSummary> {
    try {
      return await this.runSeasonGeneration(teamId, seasonId, userId);
    } catch (error) {
      return this.markSeasonFailed(teamId, seasonId, userId, error);
    }
  }

  async getSeasonInsight(
    teamId: string,
    seasonId: string | null,
  ): Promise<SeasonInsightSummary | null> {
    const row = await this.findSeasonInsightRow(teamId, seasonId);
    return row ? this.toSeasonSummary(row) : null;
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

  private toSeasonSummary(
    row: typeof seasonInsights.$inferSelect,
  ): SeasonInsightSummary {
    return {
      teamId: row.teamId,
      seasonId: row.seasonId,
      status: row.status,
      narrativeText: row.narrativeText,
      generatedAt: row.generatedAt?.toISOString() ?? null,
      failureReason: row.failureReason,
    };
  }

  private async findSeasonInsightRow(teamId: string, seasonId: string | null) {
    const [row] = await this.databaseService.database
      .select()
      .from(seasonInsights)
      .where(
        and(
          eq(seasonInsights.teamId, teamId),
          seasonId ? eq(seasonInsights.seasonId, seasonId) : isNull(seasonInsights.seasonId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async runSeasonGeneration(
    teamId: string,
    seasonId: string | null,
    userId: string,
  ): Promise<SeasonInsightSummary> {
    let seasonLabel = 'all matches';
    let window: SeasonWindow | undefined;
    if (seasonId) {
      const resolved = await this.seasonsService.resolveSeasonWindow(
        teamId,
        seasonId,
      );
      seasonLabel = resolved.season.name;
      window = resolved.window;
    }

    const teamMatches = await this.loadTeamMatches(teamId, window);
    const { totals, entries } = summariseMatches(teamMatches);
    const trendAnalysis = buildTrends(entries);

    const [team] = await this.databaseService.database
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);
    const { topScorers, topAssisters } = await this.loadTopPlayers(
      teamId,
      window,
    );

    const { prompt, digestPayload } = buildSeasonInsightPrompt({
      teamName: team?.name ?? 'The team',
      seasonLabel,
      totals: {
        matchesPlayed: totals.matchesPlayed,
        wins: totals.wins,
        draws: totals.draws,
        losses: totals.losses,
        goalsFor: totals.goalsFor,
        goalsAgainst: totals.goalsAgainst,
        points: totals.points,
      },
      deltas: trendAnalysis.periods.deltas,
      topScorers,
      topAssisters,
    });
    const inputDigest = computeSeasonInputDigest(digestPayload);

    const existing = await this.findSeasonInsightRow(teamId, seasonId);
    if (existing?.status === 'ready' && existing.inputDigest === inputDigest) {
      return this.toSeasonSummary(existing);
    }

    const narrativeText = await this.geminiClient.generateNarrative(prompt);
    const modelName = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

    const values = {
      teamId,
      seasonId,
      status: 'ready' as const,
      narrativeText,
      model: modelName,
      promptVersion: PROMPT_VERSION,
      inputDigest,
      generatedAt: new Date(),
      failureReason: null,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      generatedByUserId: userId,
    };

    const row = existing
      ? (
          await this.databaseService.database
            .update(seasonInsights)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(seasonInsights.id, existing.id))
            .returning()
        )[0]
      : (
          await this.databaseService.database
            .insert(seasonInsights)
            .values(values)
            .returning()
        )[0];
    return this.toSeasonSummary(row);
  }

  private async markSeasonFailed(
    teamId: string,
    seasonId: string | null,
    userId: string,
    error: unknown,
  ): Promise<SeasonInsightSummary> {
    const message = error instanceof Error ? error.message : String(error);
    if (!(error instanceof GeminiNotConfiguredError)) {
      this.logger.warn(
        `Season insight generation failed for team ${teamId}: ${message}`,
      );
    }

    const existing = await this.findSeasonInsightRow(teamId, seasonId);
    const values = {
      teamId,
      seasonId,
      status: 'failed' as const,
      failureReason: message,
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      generatedByUserId: userId,
    };

    const row = existing
      ? (
          await this.databaseService.database
            .update(seasonInsights)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(seasonInsights.id, existing.id))
            .returning()
        )[0]
      : (
          await this.databaseService.database
            .insert(seasonInsights)
            .values(values)
            .returning()
        )[0];
    return this.toSeasonSummary(row);
  }

  /** Completed matches for a team, optionally windowed to a season's date range. */
  private async loadTeamMatches(teamId: string, window?: SeasonWindow) {
    const conditions = [eq(events.teamId, teamId), eq(events.status, 'completed')];
    if (window) {
      conditions.push(
        gte(events.scheduledAt, window.start),
        lte(events.scheduledAt, window.end),
      );
    }
    return this.databaseService.database
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
      .where(and(...conditions))
      .orderBy(asc(events.scheduledAt));
  }

  /** Top 3 goal scorers and top 3 assisters, optionally windowed to a season. */
  private async loadTopPlayers(
    teamId: string,
    window?: SeasonWindow,
  ): Promise<{
    topScorers: SeasonInsightTopPlayer[];
    topAssisters: SeasonInsightTopPlayer[];
  }> {
    const conditions = [
      eq(athletes.teamId, teamId),
      eq(events.status, 'completed'),
      eq(matchEvents.team, 'own'),
      sql`${matchEvents.lifecycleStatus} <> 'voided'`,
    ];
    if (window) {
      conditions.push(
        gte(events.scheduledAt, window.start),
        lte(events.scheduledAt, window.end),
      );
    }

    const rows = await this.databaseService.database
      .select({
        name: sql<string>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
        goals: sql<number>`count(*) filter (where ${matchEvents.eventType} = 'goal')::int`,
        assists: sql<number>`count(*) filter (where ${matchEvents.eventType} = 'assist')::int`,
      })
      .from(matchEvents)
      .innerJoin(athletes, eq(matchEvents.athleteId, athletes.id))
      .innerJoin(matches, eq(matchEvents.matchId, matches.id))
      .innerJoin(events, eq(matches.eventId, events.id))
      .where(and(...conditions))
      .groupBy(athletes.id, athletes.firstName, athletes.lastName);

    const topScorers = [...rows]
      .filter((row) => row.goals > 0)
      .sort((a, b) => b.goals - a.goals)
      .slice(0, 3);
    const topAssisters = [...rows]
      .filter((row) => row.assists > 0)
      .sort((a, b) => b.assists - a.assists)
      .slice(0, 3);

    return { topScorers, topAssisters };
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

    const rawResponse = await this.geminiClient.generateNarrative(prompt);
    const parsed = parseInsightResponse(rawResponse);
    const playerOfTheMatch = sanitizePlayerOfTheMatch(
      parsed.playerOfTheMatch,
      context.athletePerformances,
    );
    const modelName = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

    const values = {
      matchId,
      status: 'ready' as const,
      narrativeText: parsed.narrativeText,
      highlights: playerOfTheMatch ? { playerOfTheMatch } : null,
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

    const teamMatches = await this.loadTeamMatches(row.teamId);

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
