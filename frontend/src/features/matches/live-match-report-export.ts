import type { jsPDF as JsPdfType } from "jspdf";
import {
  matchReportFilename,
  matchReportGoals,
  matchReportPlayerRows,
  matchReportSubstitutions,
  matchReportTimeline,
  matchResult,
  type LiveMatchReportData,
} from "./live-match-report-model.ts";

type Pdf = InstanceType<typeof JsPdfType>;
type TableColumn = { label: string; width: number };

const LEFT = 14;
const RIGHT = 196;
const PAGE_BOTTOM = 281;
const GREEN: [number, number, number] = [4, 120, 87];

function dateParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "—" };
  return {
    date: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

function sectionTitle(pdf: Pdf, title: string, y: number): number {
  pdf.setTextColor(24, 24, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, LEFT, y);
  return y + 5;
}

function addPage(pdf: Pdf): number {
  pdf.addPage();
  return 18;
}

function ensureSpace(pdf: Pdf, y: number, height: number): number {
  return y + height > PAGE_BOTTOM ? addPage(pdf) : y;
}

function drawTable(
  pdf: Pdf,
  title: string,
  columns: TableColumn[],
  rows: string[][],
  startY: number,
): number {
  if (rows.length === 0) return startY;
  let y = ensureSpace(pdf, startY, 20);
  y = sectionTitle(pdf, title, y);
  const header = () => {
    pdf.setFillColor(232, 245, 239);
    pdf.rect(LEFT, y, columns.reduce((sum, column) => sum + column.width, 0), 7, "F");
    pdf.setTextColor(...GREEN);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.2);
    let x = LEFT;
    columns.forEach((column) => {
      pdf.text(column.label, x + 1.5, y + 4.8);
      x += column.width;
    });
    y += 7;
  };
  header();
  for (const row of rows) {
    const wrapped = row.map((cell, index) =>
      pdf.splitTextToSize(cell, Math.max(columns[index].width - 3, 4)) as string[],
    );
    const height = Math.max(7, Math.max(...wrapped.map((lines) => lines.length)) * 3.4 + 3);
    if (y + height > PAGE_BOTTOM) {
      y = addPage(pdf);
      header();
    }
    pdf.setDrawColor(222, 222, 222);
    pdf.line(LEFT, y + height, RIGHT, y + height);
    pdf.setTextColor(45, 45, 45);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.4);
    let x = LEFT;
    wrapped.forEach((lines, index) => {
      pdf.text(lines, x + 1.5, y + 4.5);
      x += columns[index].width;
    });
    y += height;
  }
  return y + 9;
}

export async function createLiveMatchReportPdf(data: LiveMatchReportData): Promise<Pdf> {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const { match } = data;
  const ownName = data.teamName;
  const homeName = match.isHome ? ownName : match.opponentName;
  const awayName = match.isHome ? match.opponentName : ownName;
  const homeScore = match.isHome ? match.teamScore : match.opponentScore;
  const awayScore = match.isHome ? match.opponentScore : match.teamScore;
  const scheduled = dateParts(match.eventScheduledAt);
  const statusTitle = match.eventStatus === "completed" ? "Match Report" : "Match Report — In Progress";

  pdf.setProperties({
    title: `Gaffer ${statusTitle} — ${homeName} vs ${awayName}`,
    subject: `${match.competitionName ?? "Friendly"}; ${scheduled.date}`,
    author: "Gaffer",
    creator: "Gaffer",
  });

  pdf.setFillColor(...GREEN);
  pdf.rect(0, 0, 210, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("GAFFER", LEFT, 11);
  pdf.setFontSize(19);
  pdf.text(statusTitle, LEFT, 23);
  pdf.setFontSize(9);
  pdf.text(match.competitionName ?? "Friendly", RIGHT, 22, { align: "right" });

  pdf.setTextColor(90, 90, 90);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Season: ${match.competitionSeason ?? "Not specified"}`, LEFT, 42);
  pdf.text(`Date: ${scheduled.date} · Kick-off: ${scheduled.time}`, LEFT, 47);
  pdf.text(`Venue: ${match.eventLocation || "Not specified"}`, LEFT, 52);
  pdf.text(`Generated: ${data.generatedAt.toLocaleString()}`, RIGHT, 42, { align: "right" });

  pdf.setFillColor(246, 247, 246);
  pdf.roundedRect(LEFT, 59, 182, 31, 2, 2, "F");
  pdf.setTextColor(24, 24, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(homeName, 61, 70, { align: "right", maxWidth: 44 });
  pdf.text(awayName, 149, 70, { align: "left", maxWidth: 44 });
  pdf.setFontSize(25);
  pdf.text(`${homeScore}  –  ${awayScore}`, 105, 72, { align: "center" });
  pdf.setTextColor(...GREEN);
  pdf.setFontSize(8);
  pdf.text(matchResult(data).toUpperCase(), 105, 82, { align: "center" });
  pdf.setTextColor(100, 100, 100);
  pdf.setFont("helvetica", "normal");
  pdf.text("HOME", 61, 82, { align: "right" });
  pdf.text("AWAY", 149, 82);

  const ownEvents = data.events.filter((event) => event.team === "own");
  const opponentEvents = data.events.filter((event) => event.team === "opponent");
  const trackedStats = [
    ["Goals", "goal"], ["Key passes", "key_pass"],
    ["Yellow cards", "yellow_card"], ["Red cards", "red_card"],
    ["Substitutions", "substitution"], ["Injuries", "injury"],
  ] as const;
  let y = drawTable(
    pdf,
    "Match summary statistics",
    [{ label: ownName, width: 45 }, { label: "STAT", width: 92 }, { label: match.opponentName, width: 45 }],
    trackedStats
      .map(([label, type]) => [
        String(ownEvents.filter((event) => event.eventType === type).length),
        label,
        String(opponentEvents.filter((event) => event.eventType === type).length),
      ])
      .filter((row) => row[0] !== "0" || row[2] !== "0" || row[1] === "Goals"),
    101,
  );

  const starters = data.squad.filter((athlete) => athlete.started);
  const substitutes = data.squad.filter((athlete) => !athlete.started);
  const lineupRows = (athletes: typeof data.squad) => athletes.map((athlete) => [
    athlete.squadNumber == null ? "—" : String(athlete.squadNumber),
    `${athlete.firstName} ${athlete.lastName}`.trim(),
    athlete.position ?? "—",
  ]);
  y = drawTable(pdf, "Starting lineup", [
    { label: "NO.", width: 20 }, { label: "PLAYER", width: 112 }, { label: "POSITION", width: 50 },
  ], lineupRows(starters), y);
  y = drawTable(pdf, "Substitutes", [
    { label: "NO.", width: 20 }, { label: "PLAYER", width: 112 }, { label: "POSITION", width: 50 },
  ], lineupRows(substitutes), y);

  const timeline = matchReportTimeline(data);
  y = drawTable(pdf, "Match timeline", [
    { label: "MIN", width: 18 }, { label: "TEAM", width: 43 },
    { label: "EVENT", width: 35 }, { label: "PLAYER / DETAIL", width: 86 },
  ], timeline.map((event) => [
    `${event.minute}'`, event.team === "own" ? ownName : match.opponentName,
    event.label, [event.person, event.detail].filter(Boolean).join(" · "),
  ]), y);

  const goals = matchReportGoals(data);
  y = drawTable(pdf, "Goals", [
    { label: "MIN", width: 18 }, { label: "TEAM", width: 38 }, { label: "SCORER", width: 56 },
    { label: "ASSIST", width: 50 }, { label: "SCORE", width: 20 },
  ], goals.map((goal) => [
    `${goal.minute}'`, goal.team === "own" ? ownName : match.opponentName,
    goal.scorer, goal.assist ?? "—", goal.score,
  ]), y);

  const substitutions = matchReportSubstitutions(data);
  y = drawTable(pdf, "Substitutions", [
    { label: "MIN", width: 18 }, { label: "TEAM", width: 42 },
    { label: "PLAYER OFF", width: 61 }, { label: "PLAYER ON", width: 61 },
  ], substitutions.map((substitution) => [
    `${substitution.minute}'`, substitution.team === "own" ? ownName : match.opponentName,
    substitution.playerOff, substitution.playerOn,
  ]), y);

  const discipline = timeline.filter((event) => event.type === "yellow_card" || event.type === "red_card");
  y = drawTable(pdf, "Discipline", [
    { label: "MIN", width: 18 }, { label: "TEAM", width: 45 }, { label: "PLAYER", width: 69 }, { label: "CARD / REASON", width: 50 },
  ], discipline.map((event) => [
    `${event.minute}'`, event.team === "own" ? ownName : match.opponentName,
    event.person, [event.label, event.detail].filter(Boolean).join(" · "),
  ]), y);

  const playerRows = matchReportPlayerRows(data);
  y = drawTable(pdf, "Player performance", [
    { label: "PLAYER", width: 72 }, { label: "START", width: 22 }, { label: "G", width: 18 },
    { label: "A", width: 18 }, { label: "KP", width: 18 }, { label: "YC", width: 17 }, { label: "RC", width: 17 },
  ], playerRows.map((row) => [
    `${row.athlete.squadNumber == null ? "" : `#${row.athlete.squadNumber} `}${row.athlete.firstName} ${row.athlete.lastName}`.trim(),
    row.athlete.started ? "Yes" : "No", String(row.goals), String(row.assists),
    String(row.keyPasses), String(row.yellowCards), String(row.redCards),
  ]), y);

  if (match.eventNotes?.trim()) {
    const lines = pdf.splitTextToSize(match.eventNotes.trim(), 178) as string[];
    y = ensureSpace(pdf, y, 12 + lines.length * 4);
    y = sectionTitle(pdf, "Match notes", y);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(55, 55, 55);
    pdf.text(lines, LEFT, y + 3);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Gaffer · ${homeName} vs ${awayName} · ${scheduled.date}`, LEFT, 291);
    pdf.text(`Page ${page} of ${pages}`, RIGHT, 291, { align: "right" });
  }
  return pdf;
}

export async function exportLiveMatchReportPdf(data: LiveMatchReportData): Promise<void> {
  const pdf = await createLiveMatchReportPdf(data);
  pdf.save(matchReportFilename(data));
}
