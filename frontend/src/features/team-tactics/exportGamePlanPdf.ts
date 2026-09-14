/**
 * Exports the current game plan — the formation on the pitch plus the
 * tactical settings — as a one-page, printable PDF a coach can bring to
 * training or a match.
 *
 * Built with jsPDF's vector drawing primitives rather than a DOM screenshot
 * (e.g. html2canvas): the pitch positions are already known as percentage
 * coordinates (see `Formation`), so drawing them directly gives a crisp
 * result at any zoom/print size and never depends on capturing the app's
 * live CSS correctly.
 */

import jsPDF from "jspdf";
import type { BackendAthlete } from "@/services/athletes";
import type { GamePlanTactics } from "@/services/gamePlans";
import type {
  Formation,
  PitchAssignments,
} from "@/features/team-management/types";
import {
  DEFENSIVE_STYLE_OPTIONS,
  OFFENSIVE_STYLE_OPTIONS,
  type StyleOption,
} from "./tactics-options";

export interface GamePlanExportData {
  /** Saved plan name, or a fallback when the board hasn't been saved yet. */
  planName: string;
  teamName: string | null;
  formation: Formation;
  assignments: PitchAssignments;
  substituteIds: string[];
  tactics: GamePlanTactics;
  getAthlete: (athleteId: string | null) => BackendAthlete | null;
}

const PAGE_MARGIN = 40;
const PITCH_GREEN: [number, number, number] = [35, 110, 60];

function athleteLabel(athlete: BackendAthlete | null): string {
  if (!athlete) return "Unassigned";
  const number = athlete.squadNumber != null ? `${athlete.squadNumber}. ` : "";
  return `${number}${athlete.firstName} ${athlete.lastName}`.trim();
}

function styleLabel<T extends string>(
  options: StyleOption<T>[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** Builds the plan's PDF document without triggering a download — used by
 * `downloadGamePlanPdf` and available directly for tests. */
export function buildGamePlanPdf(data: GamePlanExportData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  let y = PAGE_MARGIN;

  // ── Header ──────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(data.planName, PAGE_MARGIN, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(110);
  const subtitle = [data.teamName, data.formation.name]
    .filter((part): part is string => Boolean(part))
    .join("  ·  ");
  doc.text(subtitle, PAGE_MARGIN, y);
  doc.text(new Date().toLocaleDateString(), pageWidth - PAGE_MARGIN, y, {
    align: "right",
  });
  doc.setTextColor(0);
  y += 18;

  // ── Pitch diagram ───────────────────────────────────────────────────
  const pitchTop = y;
  const pitchWidth = contentWidth;
  const pitchHeight = pitchWidth * 1.35;

  doc.setFillColor(...PITCH_GREEN);
  doc.rect(PAGE_MARGIN, pitchTop, pitchWidth, pitchHeight, "F");
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.2);
  doc.rect(
    PAGE_MARGIN + 8,
    pitchTop + 8,
    pitchWidth - 16,
    pitchHeight - 16,
    "S",
  );
  doc.line(
    PAGE_MARGIN + 8,
    pitchTop + pitchHeight / 2,
    PAGE_MARGIN + pitchWidth - 8,
    pitchTop + pitchHeight / 2,
  );
  doc.circle(
    PAGE_MARGIN + pitchWidth / 2,
    pitchTop + pitchHeight / 2,
    pitchWidth * 0.12,
    "S",
  );

  for (const position of data.formation.positions) {
    const cx = PAGE_MARGIN + (position.x / 100) * pitchWidth;
    const cy = pitchTop + (position.y / 100) * pitchHeight;
    const athlete = data.getAthlete(data.assignments[position.id] ?? null);

    doc.setFillColor(255, 255, 255);
    doc.circle(cx, cy, 13, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(20, 20, 20);
    doc.text(position.label, cx, cy + 3, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(athleteLabel(athlete), cx, cy + 22, {
      align: "center",
      maxWidth: 64,
    });
  }

  doc.setTextColor(0);
  y = pitchTop + pitchHeight + 24;

  // ── Substitutes ─────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Substitutes", PAGE_MARGIN, y);
  y += 14;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const substitutesText = data.substituteIds.length
    ? data.substituteIds
        .map((id) => athleteLabel(data.getAthlete(id)))
        .join(", ")
    : "None named";
  const substituteLines = doc.splitTextToSize(substitutesText, contentWidth);
  doc.text(substituteLines, PAGE_MARGIN, y);
  y += substituteLines.length * 12 + 18;

  // ── Tactics ─────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Tactics", PAGE_MARGIN, y);
  y += 16;

  const rows: [string, string][] = [
    [
      "Defensive style",
      styleLabel(DEFENSIVE_STYLE_OPTIONS, data.tactics.defensiveStyle),
    ],
    [
      "Defensive width / depth",
      `${data.tactics.defensiveWidth} / ${data.tactics.defensiveDepth}`,
    ],
    [
      "Offensive style",
      styleLabel(OFFENSIVE_STYLE_OPTIONS, data.tactics.offensiveStyle),
    ],
    ["Offensive width", `${data.tactics.offensiveWidth}`],
    ["Players in box", `${data.tactics.playersInBox}`],
    ["Corners commitment", `${data.tactics.cornersCommitment}`],
    ["Free kicks commitment", `${data.tactics.freeKicksCommitment}`],
    ["Captain", athleteLabel(data.getAthlete(data.tactics.captainId))],
    [
      "Free kick taker",
      athleteLabel(data.getAthlete(data.tactics.freeKickTakerId)),
    ],
    [
      "Penalty taker",
      athleteLabel(data.getAthlete(data.tactics.penaltyTakerId)),
    ],
    ["Corner taker", athleteLabel(data.getAthlete(data.tactics.cornerTakerId))],
  ];

  const labelColumnWidth = 170;
  doc.setFontSize(9);
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold");
    doc.text(label, PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.text(value, PAGE_MARGIN + labelColumnWidth, y, {
      maxWidth: contentWidth - labelColumnWidth,
    });
    y += 14;
  }

  return doc;
}

/** Turns a plan name into a safe, lowercase, hyphenated filename stem. */
export function slugifyFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "game-plan";
}

/** Builds the plan's PDF and triggers a browser download of it. */
export function downloadGamePlanPdf(data: GamePlanExportData): void {
  const doc = buildGamePlanPdf(data);
  doc.save(`${slugifyFileName(data.planName)}.pdf`);
}
