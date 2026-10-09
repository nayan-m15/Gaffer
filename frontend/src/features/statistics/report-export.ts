import type { jsPDF as JsPdfType } from "jspdf";
import { rollingChartRows, cumulativeChartRows, periodChartRows } from "./season-trends-model";
import { formatDate, formatDiff, formatRate } from "./formatting";
import {
  buildTeamReportCsv,
  reportHighlights,
  resultLabel,
  safeReportFilename,
  type TeamReportData,
} from "./team-report-model";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export function exportTeamReportCsv(data: TeamReportData): void {
  const csv = buildTeamReportCsv(data);
  const suffix = safeReportFilename(data.context.teamName, data.context.generatedAt);
  downloadBlob(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
    `Gaffer_Team_Performance_${suffix}.csv`,
  );
}

type Pdf = InstanceType<typeof JsPdfType>;

type ChartSeries = { label: string; values: number[]; color: [number, number, number] };

/** Native PDF vectors keep exports independent of screen/theme/temporary DOM. */
function drawChart(pdf: Pdf, title: string, labels: string[], series: ChartSeries[], top: number, bars = false): void {
  const left = 24, right = 192, bottom = top + 54;
  const maximum = Math.max(1, ...series.flatMap((item) => item.values));
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(24, 24, 24);
  pdf.text(title, 14, top - 6);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  for (let tick = 0; tick <= 3; tick++) {
    const y = bottom - tick * 18;
    pdf.setDrawColor(220, 220, 220);
    pdf.line(left, y, right, y);
    pdf.text((maximum * tick / 3).toFixed(1), left - 2, y + 1, { align: "right" });
  }
  const xAt = (index: number) => left + (right - left) * index / Math.max(labels.length - 1, 1);
  series.forEach((item, seriesIndex) => {
    pdf.setDrawColor(...item.color);
    pdf.setFillColor(...item.color);
    pdf.setLineWidth(0.6);
    item.values.forEach((value, index) => {
      const y = bottom - value / maximum * 54;
      if (bars) {
        const width = (right - left) / Math.max(labels.length, 1);
        pdf.rect(left + index * width + width * 0.15, y, width * 0.7, bottom - y, "F");
      } else if (index > 0) {
        pdf.line(xAt(index - 1), bottom - item.values[index - 1] / maximum * 54, xAt(index), y);
      }
    });
    pdf.setTextColor(...item.color);
    pdf.text(item.label, left + seriesIndex * 56, bottom + 14);
  });
  pdf.setTextColor(80, 80, 80);
  const stride = Math.max(1, Math.ceil(labels.length / 8));
  labels.forEach((label, index) => {
    if (index % stride !== 0 && index !== labels.length - 1) return;
    const x = bars ? left + (index + 0.5) * (right - left) / labels.length : xAt(index);
    pdf.text(pdf.splitTextToSize(label, 26), x, bottom + 5, { align: "center" });
  });
}

function drawReportCharts(pdf: Pdf, data: TeamReportData): void {
  const { overview } = data;
  if (overview.form.rolling.length < 2) return;
  const rolling = rollingChartRows(overview.form.rolling, overview.rollingWindow);
  const cumulative = cumulativeChartRows(overview.form.cumulative);
  pdf.addPage();
  drawChart(pdf, "Form trend - rolling " + overview.rollingWindow + " matches", rolling.map(row => row.label), [
    { label: "Goals scored", values: rolling.map(row => row.goalsFor), color: [4, 120, 87] },
    { label: "Goals conceded", values: rolling.map(row => row.goalsAgainst), color: [194, 65, 69] },
    { label: "Points per match", values: rolling.map(row => row.pointsPerGame), color: [37, 99, 235] },
  ], 28);
  drawChart(pdf, "Points progression", cumulative.map(row => row.label), [
    { label: "Cumulative points", values: cumulative.map(row => row.points), color: [37, 99, 235] },
  ], 117);
  if (overview.periods.splits.length >= 2) {
    const periods = periodChartRows(overview.periods.splits, "pointsPerGame");
    drawChart(pdf, "Period comparison - points per match", periods.map(row => row.label), [
      { label: "Points per match", values: periods.map(row => row.value), color: [4, 120, 87] },
    ], 206, true);
  }
}



function drawTable(
  pdf: Pdf,
  title: string,
  headers: string[],
  rows: string[][],
  startY: number,
  widths: number[],
): number {
  const left = 14;
  const rowHeight = 7;
  let y = startY;
  const drawHeader = () => {
    pdf.setFillColor(232, 245, 239);
    pdf.rect(left, y, widths.reduce((sum, width) => sum + width, 0), rowHeight, "F");
    pdf.setTextColor(4, 120, 87);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(7.5);
    let x = left;
    headers.forEach((header, index) => {
      pdf.text(header, x + 1.5, y + 4.8);
      x += widths[index];
    });
    y += rowHeight;
  };
  const newPage = () => {
    pdf.addPage();
    y = 18;
    drawHeader();
  };

  if (y > 258) {
    pdf.addPage();
    y = 18;
  }
  pdf.setTextColor(24, 24, 24);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, left, y);
  y += 5;
  drawHeader();

  for (const row of rows) {
    const lines = row.map((cell, index) => pdf.splitTextToSize(cell, Math.max(widths[index] - 3, 4)) as string[]);
    const height = Math.max(rowHeight, ...lines.map((cell) => cell.length * 3.2 + 3));
    if (y + height > 282) newPage();
    pdf.setDrawColor(222, 222, 222);
    pdf.line(left, y + height, 196, y + height);
    pdf.setTextColor(45, 45, 45);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7.5);
    let x = left;
    lines.forEach((cell, index) => {
      pdf.text(cell, x + 1.5, y + 4.8);
      x += widths[index];
    });
    y += height;
  }
  return y + 9;
}

export async function exportTeamReportPdf(data: TeamReportData, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  const { jsPDF } = await import("jspdf");
  signal?.throwIfAborted();
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const { overview, context } = data;
  pdf.setProperties({
    title: `Gaffer Team Performance Report — ${context.teamName}`,
    subject: `${context.seasonName}; ${context.competitionName}; ${context.dateRange}`,
    author: "Gaffer",
    creator: "Gaffer",
  });

  pdf.setFillColor(4, 120, 87);
  pdf.rect(0, 0, 210, 34, "F");
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("GAFFER", 14, 11);
  pdf.setFontSize(19);
  pdf.text("Team Performance Report", 14, 23);
  pdf.setFontSize(10);
  pdf.text(context.teamName, 196, 22, { align: "right" });

  pdf.setTextColor(80, 80, 80);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);
  pdf.text(`Season: ${context.seasonName}`, 14, 42);
  pdf.text(`Competition: ${context.competitionName}`, 14, 47);
  pdf.text(`Period: ${context.dateRange}`, 14, 52);
  pdf.text(`Generated: ${context.generatedAt.toLocaleString()}`, 196, 42, { align: "right" });

  const stats = [
    ["Played", overview.matchesPlayed], ["Wins", overview.wins],
    ["Draws", overview.draws], ["Losses", overview.losses],
    ["Win %", formatRate(overview.winRate)], ["Points", overview.points],
    ["Goals for", overview.goalsFor], ["Goals against", overview.goalsAgainst],
    ["Goal diff", formatDiff(overview.goalDifference)], ["Clean sheets", overview.cleanSheets],
    ["Avg goals for", overview.avgGoalsFor.toFixed(2)], ["Avg goals against", overview.avgGoalsAgainst.toFixed(2)],
  ] as const;
  stats.forEach(([label, value], index) => {
    const col = index % 5;
    const row = Math.floor(index / 5);
    const x = 14 + col * 36.4;
    const y = 60 + row * 17;
    pdf.setFillColor(246, 247, 246);
    pdf.roundedRect(x, y, 33.5, 13, 1.5, 1.5, "F");
    pdf.setTextColor(24, 24, 24);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text(String(value), x + 2, y + 6);
    pdf.setTextColor(100, 100, 100);
    pdf.setFontSize(6.5);
    pdf.text(label.toUpperCase(), x + 2, y + 10.5);
  });

  let y = 116;
  const highlights = reportHighlights(overview);
  if (highlights.length > 0) {
    pdf.setTextColor(24, 24, 24);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(12);
    pdf.text("Performance highlights", 14, y);
    y += 6;
    pdf.setFontSize(8);
    highlights.forEach((item) => {
      pdf.setFont("helvetica", "bold");
      pdf.text(`${item.label}: ${item.value}`, 14, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(item.detail, 82, y);
      y += 5;
    });
    y += 4;
  }

  y = drawTable(
    pdf,
    "Match results",
    ["Date", "Opponent", "H/A", "Score", "Result"],
    overview.trends.map((match) => [
      formatDate(match.date), match.opponent, match.isHome ? "Home" : "Away",
      `${match.goalsFor}-${match.goalsAgainst}`, resultLabel(match.result),
    ]),
    y,
    [30, 78, 24, 22, 28],
  );
  drawTable(
    pdf,
    "Player performance",
    ["Player", "Apps", "Goals", "Assists", "Yellow", "Red", "Saves"],
    overview.players.map((player) => [
      player.name, String(player.appearances), String(player.goals),
      String(player.assists), String(player.yellowCards), String(player.redCards), String(player.saves ?? 0),
    ]),
    y,
    [62, 20, 20, 20, 20, 20, 20],
  );

  drawReportCharts(pdf, data);

  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(7);
    pdf.setTextColor(120, 120, 120);
    pdf.text(`Gaffer · ${context.teamName}`, 14, 291);
    pdf.text(`Page ${page} of ${pageCount}`, 196, 291, { align: "right" });
  }

  const suffix = safeReportFilename(context.teamName, context.generatedAt);
  signal?.throwIfAborted();
  pdf.save(`Gaffer_Team_Performance_Report_${suffix}.pdf`);
}
