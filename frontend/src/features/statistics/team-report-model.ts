import type { PlayerStatLine, TeamOverview, TrendEntry } from "./types";

export interface TeamReportContext {
  teamName: string;
  competitionName: string;
  seasonName: string;
  dateRange: string;
  generatedAt: Date;
}

export interface TeamReportHighlight {
  label: string;
  value: string;
  detail: string;
}

export interface TeamReportData {
  overview: TeamOverview;
  context: TeamReportContext;
}

export function reportHighlights(
  overview: TeamOverview,
): TeamReportHighlight[] {
  const byGoals = [...overview.players].sort(
    (a, b) => b.goals - a.goals || a.name.localeCompare(b.name),
  );
  const byAssists = [...overview.players].sort(
    (a, b) => b.assists - a.assists || a.name.localeCompare(b.name),
  );
  const byAppearances = [...overview.players].sort(
    (a, b) => b.appearances - a.appearances || a.name.localeCompare(b.name),
  );
  const bestResult = [...overview.trends]
    .filter((match) => match.result === "W")
    .sort(
      (a, b) =>
        b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst) ||
        b.goalsFor - a.goalsFor,
    )[0];

  const highlights: TeamReportHighlight[] = [];
  if (byGoals[0] && byGoals[0].goals > 0) {
    highlights.push({
      label: "Top scorer",
      value: byGoals[0].name,
      detail: `${byGoals[0].goals} ${byGoals[0].goals === 1 ? "goal" : "goals"}`,
    });
  }
  if (byAssists[0] && byAssists[0].assists > 0) {
    highlights.push({
      label: "Most assists",
      value: byAssists[0].name,
      detail: `${byAssists[0].assists} ${byAssists[0].assists === 1 ? "assist" : "assists"}`,
    });
  }
  if (byAppearances[0] && byAppearances[0].appearances > 0) {
    highlights.push({
      label: "Most appearances",
      value: byAppearances[0].name,
      detail: `${byAppearances[0].appearances} appearances`,
    });
  }
  if (bestResult) {
    highlights.push({
      label: "Best result",
      value: `${bestResult.goalsFor}-${bestResult.goalsAgainst}`,
      detail: `vs ${bestResult.opponent}`,
    });
  }
  return highlights;
}

/**
 * Characters that make spreadsheet applications (Excel, LibreOffice,
 * Google Sheets) interpret a cell as a formula when they lead the value.
 */
const FORMULA_TRIGGERS = new Set(["=", "+", "-", "@"]);

/**
 * True when the first character that is neither whitespace nor a control
 * character is a formula trigger. Importers may skip leading blanks before
 * the formula check, so `" =1+1"` and `"\t+2+2"` count as triggers too.
 */
function needsFormulaGuard(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    // Space, the C0 controls (up to 0x20), DEL and the BOM are characters
    // some spreadsheet importers strip before the formula check; \s adds
    // the remaining Unicode whitespace such as non-breaking spaces.
    if (
      code <= 0x20 ||
      code === 0x7f ||
      code === 0xfeff ||
      /\s/.test(text[index])
    ) {
      continue;
    }
    return FORMULA_TRIGGERS.has(text[index]);
  }
  return false;
}

function csvCell(value: string | number): string {
  // CSV-formula-injection guard: user-controlled strings (team, competition,
  // season, opponent and player names) that a spreadsheet could execute are
  // prefixed with a text-marker apostrophe so they open as literal text.
  // Guarded before CSV quoting so the escaping still round-trips. Numbers are
  // exempt — a numeric cell (-3) is never a formula and must stay numeric so
  // spreadsheet calculations keep working.
  const guarded =
    typeof value === "string" && needsFormulaGuard(value)
      ? `'${value}`
      : String(value);
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvCell).join(",");
}

export function buildTeamReportCsv({
  overview,
  context,
}: TeamReportData): string {
  const headers = [
    "Section",
    "Metric",
    "Value",
    "Date",
    "Competition",
    "Opponent",
    "Venue",
    "Score",
    "Result",
    "Player",
    "Appearances",
    "Goals",
    "Assists",
    "Yellow Cards",
    "Red Cards",
  ];
  const rows: Array<Array<string | number>> = [headers];
  const summary: Array<[string, number | string]> = [
    ["Team", context.teamName],
    ["Season", context.seasonName],
    ["Date range", context.dateRange],
    ["Matches played", overview.matchesPlayed],
    ["Wins", overview.wins],
    ["Draws", overview.draws],
    ["Losses", overview.losses],
    ["Goals for", overview.goalsFor],
    ["Goals against", overview.goalsAgainst],
    ["Goal difference", overview.goalDifference],
    ["Win percentage", `${Math.round(overview.winRate * 100)}%`],
    ["Clean sheets", overview.cleanSheets],
    ["Points", overview.points],
  ];
  for (const [metric, value] of summary) {
    rows.push(["Team summary", metric, value, "", context.competitionName, "", "", "", "", "", "", "", "", "", ""]);
  }
  for (const match of overview.trends) {
    rows.push([
      "Match result", "", "", match.date, context.competitionName,
      match.opponent, match.isHome ? "Home" : "Away",
      `${match.goalsFor}-${match.goalsAgainst}`, match.result,
      "", "", "", "", "", "",
    ]);
  }
  for (const player of overview.players) {
    rows.push([
      "Player performance", "", "", "", context.competitionName,
      "", "", "", "", player.name, player.appearances, player.goals,
      player.assists, player.yellowCards, player.redCards,
    ]);
  }
  return `\uFEFF${rows.map(csvRow).join("\r\n")}`;
}

export function safeReportFilename(teamName: string, date: Date): string {
  const team = teamName.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "Team";
  return `${team}_${date.toISOString().slice(0, 10)}`;
}

export function resultLabel(result: TrendEntry["result"]): string {
  return result === "W" ? "Win" : result === "D" ? "Draw" : "Loss";
}

export function playerCards(player: PlayerStatLine): number {
  return player.yellowCards + player.redCards;
}
