/**
 * Pure prompt-building for match insight generation. No database, no Nest —
 * everything here is a function of already-fetched match/event/trend data,
 * so it can be unit-tested without stubbing Drizzle or the Gemini client.
 *
 * `InsightsService` fetches the rows and delegates prompt construction and
 * cache-key computation to this module.
 */

import { createHash } from 'node:crypto';
import type { MetricDelta } from '../statistics/statistics.trends';

export interface InsightMatchSummary {
  opponentName: string;
  isHome: boolean;
  teamScore: number;
  opponentScore: number;
  date: string;
  competitionName: string | null;
}

export interface InsightEventSummary {
  eventType: string;
  team: 'own' | 'opponent';
  minute: number;
  athleteName: string | null;
  opponentLabel: string | null;
}

export interface InsightAthletePerformance {
  athleteName: string;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

export interface InsightSeasonContext {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  deltas: MetricDelta[];
}

export interface BuildInsightPromptInput {
  teamName: string;
  match: InsightMatchSummary;
  events: InsightEventSummary[];
  athletePerformances: InsightAthletePerformance[];
  season: InsightSeasonContext | null;
}

export interface BuildInsightPromptResult {
  prompt: string;
  /** JSON-serialisable payload the caller hashes into `inputDigest`. */
  digestPayload: Record<string, unknown>;
}

function describeResult(teamScore: number, opponentScore: number): string {
  if (teamScore > opponentScore) return 'won';
  if (teamScore < opponentScore) return 'lost';
  return 'drew';
}

function formatEventLine(event: InsightEventSummary): string {
  const actor =
    event.team === 'own'
      ? (event.athleteName ?? 'An unidentified player')
      : (event.opponentLabel ?? 'The opponent');
  const label = event.eventType.replace(/_/g, ' ');
  const side = event.team === 'own' ? 'for us' : 'for the opponent';
  return `- ${event.minute}': ${label} ${side} (${actor})`;
}

function formatDelta(delta: MetricDelta): string {
  const sign = delta.delta > 0 ? '+' : '';
  return `- ${delta.label}: ${delta.first} -> ${delta.last} (${sign}${delta.delta}, ${delta.direction})`;
}

/**
 * Builds the Gemini prompt for a single finalised match plus the JSON payload
 * used to compute `inputDigest` — so the caller can skip regeneration when
 * nothing meaningful has changed since the last successful run.
 */
export function buildInsightPrompt(
  input: BuildInsightPromptInput,
): BuildInsightPromptResult {
  const { teamName, match, events, athletePerformances, season } = input;

  const resultWord = describeResult(match.teamScore, match.opponentScore);
  const venue = match.isHome ? 'at home' : 'away';
  const scoreLine = `${teamName} ${resultWord} ${match.teamScore}-${match.opponentScore} ${venue} against ${match.opponentName}${match.competitionName ? ` in ${match.competitionName}` : ''} on ${match.date.slice(0, 10)}.`;

  const eventLines =
    events.length > 0
      ? events.map(formatEventLine).join('\n')
      : '(No notable events were logged.)';

  const performanceLines = athletePerformances
    .filter((p) => p.goals + p.assists + p.yellowCards + p.redCards > 0)
    .map(
      (p) =>
        `- ${p.athleteName}: ${p.goals}g ${p.assists}a` +
        (p.yellowCards ? ` ${p.yellowCards}yc` : '') +
        (p.redCards ? ` ${p.redCards}rc` : ''),
    )
    .join('\n');

  const seasonLines = season
    ? [
        `Season so far: ${season.matchesPlayed} played, ${season.wins}W ${season.draws}D ${season.losses}L.`,
        season.deltas.length > 0
          ? `Recent trend (first period vs most recent period):\n${season.deltas.map(formatDelta).join('\n')}`
          : null,
      ]
        .filter(Boolean)
        .join('\n')
    : 'No season trend data is available yet.';

  const prompt = `You are a concise assistant coach writing a short post-match summary for a grassroots football team's coach. Write 2-4 sentences of plain, encouraging, factual prose — no bullet points, no headings, no emojis. Only state facts given below; do not invent players, events, or numbers.

Match result:
${scoreLine}

Match events:
${eventLines}

Notable individual performances:
${performanceLines || '(No goal/assist/card contributions logged.)'}

${seasonLines}

Respond in exactly this two-line format:
SUMMARY: <your 2-4 sentence summary>
PLAYER_OF_THE_MATCH: <full name> - <one short clause reason>

Only name a player who appears in the notable individual performances list above. If no single player stood out, write "PLAYER_OF_THE_MATCH: None" instead.`;

  const digestPayload: Record<string, unknown> = {
    match,
    events,
    athletePerformances,
    season,
    promptVersion: 1,
  };

  return { prompt, digestPayload };
}

/** Deterministic hash of a digest payload, used as `matchInsights.inputDigest`. */
export function computeInputDigest(payload: Record<string, unknown>): string {
  return createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex');
}

export interface ParsedInsightResponse {
  narrativeText: string;
  playerOfTheMatch: { athleteName: string; reason: string } | null;
}

/**
 * Parses Gemini's two-line `SUMMARY:`/`PLAYER_OF_THE_MATCH:` response (see
 * the format requested in `buildInsightPrompt`). Falls back to treating the
 * whole response as the narrative if the model didn't follow the format —
 * the summary must never end up empty just because the marker line is missing.
 */
export function parseInsightResponse(raw: string): ParsedInsightResponse {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const summaryLine = lines.find((line) => /^summary:/i.test(line));
  const potmLine = lines.find((line) => /^player_of_the_match:/i.test(line));

  const narrativeText = summaryLine
    ? summaryLine.replace(/^summary:/i, '').trim()
    : raw.trim();

  let playerOfTheMatch: ParsedInsightResponse['playerOfTheMatch'] = null;
  if (potmLine) {
    const value = potmLine.replace(/^player_of_the_match:/i, '').trim();
    if (value && !/^none$/i.test(value)) {
      const separator = value.match(/\s[-—]\s/);
      playerOfTheMatch = separator
        ? {
            athleteName: value.slice(0, separator.index).trim(),
            reason: value
              .slice((separator.index ?? 0) + separator[0].length)
              .trim(),
          }
        : { athleteName: value, reason: '' };
    }
  }

  return { narrativeText, playerOfTheMatch };
}

/**
 * Nulls out a parsed player-of-the-match pick that doesn't match a real
 * contributor from this match — a guard against the model inventing a name
 * despite being told not to.
 */
export function sanitizePlayerOfTheMatch(
  parsed: ParsedInsightResponse['playerOfTheMatch'],
  athletePerformances: InsightAthletePerformance[],
): ParsedInsightResponse['playerOfTheMatch'] {
  if (!parsed) return null;
  const known = athletePerformances.some(
    (performance) =>
      performance.athleteName.toLowerCase() ===
      parsed.athleteName.toLowerCase(),
  );
  return known ? parsed : null;
}
