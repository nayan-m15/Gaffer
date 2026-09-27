/**
 * Pure prompt-building for a team's season-summary narrative. No database,
 * no Nest — mirrors `insight-prompt.ts`'s per-match module so it can be
 * unit-tested the same way.
 *
 * Unlike the per-match insight, generation here is coach-triggered (a
 * "Generate season summary" button), not automatic, so there is no
 * player-of-the-match style structured field to parse out — just prose.
 */

import { createHash } from 'node:crypto';
import type { MetricDelta } from '../statistics/statistics.trends';

export interface SeasonInsightTotals {
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface SeasonInsightTopPlayer {
  name: string;
  goals: number;
  assists: number;
}

export interface BuildSeasonInsightPromptInput {
  teamName: string;
  /** e.g. "2025/26", or "all matches" when no season is selected. */
  seasonLabel: string;
  totals: SeasonInsightTotals;
  deltas: MetricDelta[];
  /** Up to 3 players, sorted by goals descending. */
  topScorers: SeasonInsightTopPlayer[];
  /** Up to 3 players, sorted by assists descending. */
  topAssisters: SeasonInsightTopPlayer[];
}

export interface BuildSeasonInsightPromptResult {
  prompt: string;
  digestPayload: Record<string, unknown>;
}

function formatDelta(delta: MetricDelta): string {
  const sign = delta.delta > 0 ? '+' : '';
  return `- ${delta.label}: ${delta.first} -> ${delta.last} (${sign}${delta.delta}, ${delta.direction})`;
}

function formatTopPlayers(
  players: SeasonInsightTopPlayer[],
  stat: 'goals' | 'assists',
): string {
  if (players.length === 0) return '(none recorded)';
  return players.map((p) => `${p.name} (${p[stat]})`).join(', ');
}

export function buildSeasonInsightPrompt(
  input: BuildSeasonInsightPromptInput,
): BuildSeasonInsightPromptResult {
  const { teamName, seasonLabel, totals, deltas, topScorers, topAssisters } =
    input;

  const recordLine = `${teamName}'s record for ${seasonLabel}: ${totals.matchesPlayed} played, ${totals.wins}W ${totals.draws}D ${totals.losses}L, ${totals.goalsFor} scored, ${totals.goalsAgainst} conceded, ${totals.points} points.`;

  const trendLines =
    deltas.length > 0
      ? `Trend across the season so far (first period vs most recent period):\n${deltas.map(formatDelta).join('\n')}`
      : 'Not enough matches yet for a meaningful trend comparison.';

  const prompt = `You are a concise assistant coach writing a short season-summary for a grassroots football team's coach. Write 3-5 sentences of plain, encouraging, factual prose — no bullet points, no headings, no emojis. Only state facts given below; do not invent players, matches, or numbers.

${recordLine}

${trendLines}

Top scorers: ${formatTopPlayers(topScorers, 'goals')}
Top assisters: ${formatTopPlayers(topAssisters, 'assists')}

Write the season summary now.`;

  const digestPayload: Record<string, unknown> = {
    seasonLabel,
    totals,
    deltas,
    topScorers,
    topAssisters,
    promptVersion: 1,
  };

  return { prompt, digestPayload };
}

/** Deterministic hash of a digest payload, used as `seasonInsights.inputDigest`. */
export function computeSeasonInputDigest(
  payload: Record<string, unknown>,
): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}
