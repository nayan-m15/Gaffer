/**
 * Exports the current game plan — the formation on the pitch plus the
 * tactical settings — as a printable, magazine-style PDF a coach can bring
 * to training or a match: a "Team Line-up" page (branded header, pitch
 * diagram, substitutes) followed by a "Tactical Plan" page (defensive /
 * attacking / set-piece cards).
 *
 * Built with jsPDF's vector drawing primitives rather than a DOM screenshot
 * (e.g. html2canvas): the pitch positions are already known as percentage
 * coordinates (see `Formation`), so drawing them directly gives a crisp
 * result at any zoom/print size and never depends on capturing the app's
 * live CSS correctly. Tactics get their own page rather than being packed
 * under the pitch — that's fixed real estate, not overflow room, so nothing
 * gets silently clipped off the bottom of the sheet as the squad grows.
 */

import jsPDF, { GState } from "jspdf";
import type { BackendAthlete } from "@/services/athletes";
import type { GamePlanTactics } from "@/services/gamePlans";
import type {
  Formation,
  PitchAssignments,
} from "@/features/team-management/types";
import {
  DEFENSIVE_STYLE_OPTIONS,
  OFFENSIVE_STYLE_OPTIONS,
  defensiveStyleDescription,
  type StyleOption,
} from "./tactics-options";

export interface GamePlanExportData {
  /** Saved plan name, or a fallback when the board hasn't been saved yet. */
  planName: string;
  teamName: string | null;
  /** Team brand color (hex, e.g. "#00D99A"); falls back to navy when unset. */
  teamColor: string | null;
  formation: Formation;
  assignments: PitchAssignments;
  substituteIds: string[];
  tactics: GamePlanTactics;
  getAthlete: (athleteId: string | null) => BackendAthlete | null;
}

/* ─── Palette & layout constants ─────────────────────────────────────── */

type Rgb = [number, number, number];

const PAGE_MARGIN = 26;
const HEADER_HEIGHT = 148;
const FOOTER_ZONE = 46;

const HEADER_BG: Rgb = [16, 43, 30]; // deep forest green — Gaffer's own brand chrome
const BRAND_GREEN: Rgb = [31, 118, 63]; // vivid green — icons, sliders, crest ring
const LABEL_LIGHT: Rgb = [188, 205, 193]; // muted light green-gray, for caps labels on dark bg
const GK_MARKER: Rgb = [206, 108, 21]; // amber — goalkeeper always stands out
const DEFAULT_TEAM_COLOR: Rgb = [24, 52, 88]; // navy — used when no team color is set
const PITCH_STRIPE_A: Rgb = [30, 100, 56];
const PITCH_STRIPE_B: Rgb = [35, 111, 63];
const TEXT_DARK: Rgb = [26, 26, 24];
const TEXT_MUTED: Rgb = [124, 122, 116];
const CARD_BG: Rgb = [243, 242, 238];
const NOTE_BG: Rgb = [234, 233, 227];
const TRACK_BG: Rgb = [221, 220, 214];
const QUOTE_MARK: Rgb = [214, 212, 205];
const WHITE: Rgb = [255, 255, 255];

/** Parses "#rgb" or "#rrggbb" into 0–255 channels; null on anything else. */
function hexToRgb(hex: string | null): Rgb | null {
  if (!hex) return null;
  const match = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!match) return null;
  let value = match[1];
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(value, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function athleteFullName(athlete: BackendAthlete | null): string {
  return athlete ? `${athlete.firstName} ${athlete.lastName}`.trim() : "Unassigned";
}

function athleteLabel(athlete: BackendAthlete | null): string {
  if (!athlete) return "Unassigned";
  const number = athlete.squadNumber != null ? `${athlete.squadNumber}  ` : "";
  return `${number}${athlete.firstName} ${athlete.lastName}`.trim();
}

function styleLabel<T extends string>(
  options: StyleOption<T>[],
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

/** First letter of the team name (or "G" for Gaffer) for the crest monogram. */
function monogramFor(teamName: string | null): string {
  const trimmed = teamName?.trim();
  return trimmed ? trimmed[0].toUpperCase() : "G";
}

/* ─── Small vector glyphs used inside card icon badges ───────────────── */

function drawShieldGlyph(doc: jsPDF, x: number, y: number, size: number): void {
  const width = size * 0.5;
  const left = x + (size - width) / 2;
  const collarBottom = y + size * 0.5;
  doc.setFillColor(...WHITE);
  doc.rect(left, y + size * 0.2, width, collarBottom - (y + size * 0.2), "F");
  doc.triangle(left, collarBottom, left + width, collarBottom, x + size / 2, y + size * 0.82, "F");
}

function drawCrossedArrowsGlyph(doc: jsPDF, x: number, y: number, size: number): void {
  const pad = size * 0.22;
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(2.2);
  doc.line(x + pad, y + pad, x + size - pad, y + size - pad);
  doc.line(x + size - pad, y + pad, x + pad, y + size - pad);
}

function drawFlagGlyph(doc: jsPDF, x: number, y: number, size: number): void {
  const poleX = x + size * 0.34;
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(1.6);
  doc.line(poleX, y + size * 0.16, poleX, y + size * 0.86);
  doc.setFillColor(...WHITE);
  doc.triangle(
    poleX,
    y + size * 0.16,
    poleX + size * 0.46,
    y + size * 0.3,
    poleX,
    y + size * 0.44,
    "F",
  );
}

function drawBenchGlyph(doc: jsPDF, x: number, y: number, size: number): void {
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(1.8);
  const seatY = y + size * 0.42;
  doc.line(x + size * 0.16, seatY, x + size * 0.84, seatY);
  doc.line(x + size * 0.16, seatY, x + size * 0.16, y + size * 0.82);
  doc.line(x + size * 0.84, seatY, x + size * 0.84, y + size * 0.82);
}

type IconGlyph = (doc: jsPDF, x: number, y: number, size: number) => void;

/** A small rounded, accent-filled square with a white glyph centered in it. */
function drawIconBadge(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  glyph: IconGlyph,
): void {
  doc.setFillColor(...BRAND_GREEN);
  doc.roundedRect(x, y, size, size, 5, 5, "F");
  glyph(doc, x, y, size);
}

/* ─── Shared chrome: header + footer ─────────────────────────────────── */

interface HeaderInfo {
  title: string;
  formationName: string;
  sectionLabel: string;
  dateLabel: string;
  monogram: string;
  teamAccent: Rgb;
}

function drawPageHeader(doc: jsPDF, pageWidth: number, info: HeaderInfo): void {
  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, "F");

  // Subtle full-bleed watermark ring, confined to the top-right corner so it
  // never competes with the crest or the "MATCHDAY PLAN" text drawn over it.
  doc.setGState(new GState({ opacity: 0.07 }));
  doc.setDrawColor(...WHITE);
  doc.setLineWidth(26);
  doc.circle(pageWidth - 40, 30, 130, "S");
  doc.setGState(new GState({ opacity: 1 }));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...WHITE);
  doc.text(info.title, PAGE_MARGIN, 54);

  doc.setFontSize(18);
  doc.text(info.formationName, PAGE_MARGIN, 78);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...LABEL_LIGHT);
  doc.text(info.sectionLabel.toUpperCase(), PAGE_MARGIN, 96);

  // Crest monogram, top right.
  const crestR = 22;
  const crestCx = pageWidth - PAGE_MARGIN - crestR;
  const crestCy = 42;
  doc.setFillColor(...WHITE);
  doc.circle(crestCx, crestCy, crestR, "F");
  doc.setDrawColor(...info.teamAccent);
  doc.setLineWidth(2.2);
  doc.circle(crestCx, crestCy, crestR, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...info.teamAccent);
  doc.text(info.monogram, crestCx, crestCy + 6.5, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...LABEL_LIGHT);
  doc.text("MATCHDAY PLAN", pageWidth - PAGE_MARGIN, crestCy + crestR + 16, {
    align: "right",
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...WHITE);
  doc.text(info.dateLabel, pageWidth - PAGE_MARGIN, crestCy + crestR + 29, {
    align: "right",
  });
}

function drawFooters(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...TEXT_DARK);
    doc.text("GAFFER", PAGE_MARGIN, pageHeight - 28);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(
      "THE FOOTBALL COACHING PLATFORM",
      PAGE_MARGIN,
      pageHeight - 19,
    );
    doc.text("BUILT FOR THE TOUCHLINE", PAGE_MARGIN, pageHeight - 12);

    doc.setFontSize(8);
    doc.text(
      `PAGE ${page} OF ${pageCount}`,
      pageWidth - PAGE_MARGIN,
      pageHeight - 20,
      { align: "right" },
    );
  }
}

/* ─── Reusable card primitives ────────────────────────────────────────── */

/** Card shell (no icon) — used when a header's badge is drawn separately. */
function drawCardShell(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  doc.setFillColor(...CARD_BG);
  doc.roundedRect(x, y, width, height, 10, 10, "F");
}

/** Icon badge + uppercase title inside a card; returns the y content
 * should start at below the header row. */
function drawCardHeader(
  doc: jsPDF,
  x: number,
  y: number,
  glyph: IconGlyph,
  title: string,
): number {
  const badgeSize = 22;
  drawIconBadge(doc, x + 16, y + 16, badgeSize, glyph);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(title, x + 16 + badgeSize + 10, y + 16 + badgeSize / 2 + 4);

  return y + 16 + badgeSize + 18;
}

function drawLabelValueRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: string,
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(label, x + 18, y);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT_DARK);
  doc.text(value, x + width - 18, y, { align: "right" });

  return y + 20;
}

/** A label above a filled progress track — used for the 0–10 tactic sliders. */
function drawSliderRow(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  label: string,
  value: number,
  max: number,
): number {
  const trackX = x + 18;
  const trackWidth = width - 36;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(label, trackX, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TEXT_DARK);
  doc.text(`${value}/${max}`, x + width - 18, y, { align: "right" });

  const trackY = y + 6;
  doc.setFillColor(...TRACK_BG);
  doc.roundedRect(trackX, trackY, trackWidth, 6, 3, 3, "F");
  const filled = Math.max(8, (value / max) * trackWidth);
  doc.setFillColor(...BRAND_GREEN);
  doc.roundedRect(trackX, trackY, filled, 6, 3, 3, "F");

  return y + 27;
}

/** A muted note panel nested inside a card — the style's trade-off copy. */
function drawNotePanel(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  text: string,
): number {
  const lines = doc.splitTextToSize(text, width - 36) as string[];
  const panelHeight = lines.length * 12 + 18;
  doc.setFillColor(...NOTE_BG);
  doc.roundedRect(x + 12, y, width - 24, panelHeight, 6, 6, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(lines, x + 24, y + 16);

  return y + panelHeight;
}

/** A card with a large decorative quotation mark and a short line of copy —
 * a purely editorial touch, so the text is a generic, unattributed maxim
 * rather than a real person's (unverifiable, exact) quoted words. */
function drawQuoteCard(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  quote: string,
): void {
  drawCardShell(doc, x, y, width, height);

  doc.setFont("times", "bolditalic");
  doc.setFontSize(46);
  doc.setTextColor(...QUOTE_MARK);
  doc.text("“", x + 16, y + 44);

  doc.setFont("times", "italic");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  const lines = doc.splitTextToSize(quote, width - 40) as string[];
  doc.text(lines, x + 20, y + height / 2 - ((lines.length - 1) * 13) / 2 + 4);
}

/* ─── Page 1: pitch + substitutes ────────────────────────────────────── */

function drawPitch(
  doc: jsPDF,
  data: GamePlanExportData,
  contentWidth: number,
  top: number,
  bottom: number,
  accent: Rgb,
): void {
  const availableHeight = bottom - top;
  const desiredRatio = 1.45; // height / width, a believable portrait pitch
  const pitchHeight = availableHeight;
  const pitchWidth = Math.min(contentWidth, pitchHeight / desiredRatio);
  const pitchLeft = PAGE_MARGIN + (contentWidth - pitchWidth) / 2;
  const pitchTop = top;

  // Mown-grass stripes, clipped to the pitch rect.
  const stripeCount = 9;
  const stripeHeight = pitchHeight / stripeCount;
  for (let i = 0; i < stripeCount; i += 1) {
    doc.setFillColor(...(i % 2 === 0 ? PITCH_STRIPE_A : PITCH_STRIPE_B));
    doc.rect(pitchLeft, pitchTop + i * stripeHeight, pitchWidth, stripeHeight, "F");
  }

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(1.2);
  doc.rect(pitchLeft + 6, pitchTop + 6, pitchWidth - 12, pitchHeight - 12, "S");
  doc.line(
    pitchLeft + 6,
    pitchTop + pitchHeight / 2,
    pitchLeft + pitchWidth - 6,
    pitchTop + pitchHeight / 2,
  );
  doc.circle(pitchLeft + pitchWidth / 2, pitchTop + pitchHeight / 2, pitchWidth * 0.16, "S");
  doc.setFillColor(255, 255, 255);
  doc.circle(pitchLeft + pitchWidth / 2, pitchTop + pitchHeight / 2, 1.4, "F");

  // Penalty + six-yard boxes at both ends, for a recognisable pitch outline.
  const penaltyWidth = pitchWidth * 0.62;
  const penaltyHeight = pitchHeight * 0.13;
  const sixYardWidth = pitchWidth * 0.32;
  const sixYardHeight = pitchHeight * 0.05;
  const penaltyLeft = pitchLeft + (pitchWidth - penaltyWidth) / 2;
  const sixYardLeft = pitchLeft + (pitchWidth - sixYardWidth) / 2;
  for (const fromTop of [true, false]) {
    const penaltyY = fromTop
      ? pitchTop + 6
      : pitchTop + pitchHeight - 6 - penaltyHeight;
    const sixYardY = fromTop
      ? pitchTop + 6
      : pitchTop + pitchHeight - 6 - sixYardHeight;
    doc.rect(penaltyLeft, penaltyY, penaltyWidth, penaltyHeight, "S");
    doc.rect(sixYardLeft, sixYardY, sixYardWidth, sixYardHeight, "S");
  }

  // Player markers: goalkeeper always amber, outfield players in the team's
  // brand color, each numbered, with a name + position chip below.
  for (const position of data.formation.positions) {
    const cx = pitchLeft + (position.x / 100) * pitchWidth;
    const cy = pitchTop + (position.y / 100) * pitchHeight;
    const athlete = data.getAthlete(data.assignments[position.id] ?? null);
    const markerColor = position.role === "GK" ? GK_MARKER : accent;

    doc.setFillColor(...markerColor);
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(1.4);
    doc.circle(cx, cy, 14, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...WHITE);
    doc.text(
      athlete?.squadNumber != null ? String(athlete.squadNumber) : "-",
      cx,
      cy + 3.2,
      { align: "center" },
    );

    const maxWidth = 72;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    const nameLines = doc.splitTextToSize(athleteFullName(athlete), maxWidth) as string[];
    const allLines = [...nameLines, position.label];
    const lineHeight = 8;
    const chipWidth =
      Math.min(
        maxWidth,
        Math.max(...allLines.map((line) => doc.getTextWidth(line))),
      ) + 8;
    const chipHeight = allLines.length * lineHeight + 5;
    const chipTop = cy + 18;

    doc.setGState(new GState({ opacity: 0.42 }));
    doc.setFillColor(8, 8, 8);
    doc.roundedRect(cx - chipWidth / 2, chipTop, chipWidth, chipHeight, 2, 2, "F");
    doc.setGState(new GState({ opacity: 1 }));

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...WHITE);
    nameLines.forEach((line, i) => {
      doc.text(line, cx, chipTop + 8 + i * lineHeight, { align: "center" });
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(210, 210, 210);
    doc.text(position.label, cx, chipTop + 8 + nameLines.length * lineHeight, {
      align: "center",
    });
  }

  doc.setTextColor(...TEXT_DARK);
}

function drawSubstitutesCard(
  doc: jsPDF,
  data: GamePlanExportData,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  drawCardShell(doc, x, y, width, height);
  const contentTop = drawCardHeader(doc, x, y, drawBenchGlyph, "SUBSTITUTES");

  if (data.substituteIds.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text("None named", x + 18, contentTop);
    return;
  }

  let rowY = contentTop;
  for (const id of data.substituteIds) {
    const athlete = data.getAthlete(id);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_DARK);
    const number = athlete?.squadNumber != null ? String(athlete.squadNumber) : "-";
    doc.text(number, x + 18, rowY);

    doc.setFont("helvetica", "normal");
    doc.text(athleteFullName(athlete), x + 44, rowY);

    rowY += 20;
  }
}

/* ─── Page 2: tactics ─────────────────────────────────────────────────── */

function drawTacticsPage(
  doc: jsPDF,
  data: GamePlanExportData,
  contentWidth: number,
  top: number,
): number {
  let y = top;

  // ── Defensive setup ──────────────────────────────────────────────
  const defenceHeight = 158;
  drawCardShell(doc, PAGE_MARGIN, y, contentWidth, defenceHeight);
  let cy = drawCardHeader(doc, PAGE_MARGIN, y, drawShieldGlyph, "DEFENSIVE SETUP");
  cy = drawLabelValueRow(
    doc,
    PAGE_MARGIN,
    cy,
    contentWidth,
    "Defensive style",
    styleLabel(DEFENSIVE_STYLE_OPTIONS, data.tactics.defensiveStyle),
  );
  cy = drawSliderRow(doc, PAGE_MARGIN, cy + 4, contentWidth, "Width", data.tactics.defensiveWidth, 10);
  cy = drawSliderRow(doc, PAGE_MARGIN, cy + 4, contentWidth, "Depth", data.tactics.defensiveDepth, 10);
  drawNotePanel(
    doc,
    PAGE_MARGIN,
    cy + 6,
    contentWidth,
    defensiveStyleDescription(data.tactics.defensiveStyle),
  );
  y += defenceHeight + 14;

  // ── Attacking setup ──────────────────────────────────────────────
  const attackHeight = 190;
  drawCardShell(doc, PAGE_MARGIN, y, contentWidth, attackHeight);
  cy = drawCardHeader(doc, PAGE_MARGIN, y, drawCrossedArrowsGlyph, "ATTACKING SETUP");
  cy = drawLabelValueRow(
    doc,
    PAGE_MARGIN,
    cy,
    contentWidth,
    "Offensive style",
    styleLabel(OFFENSIVE_STYLE_OPTIONS, data.tactics.offensiveStyle),
  );
  cy = drawSliderRow(doc, PAGE_MARGIN, cy + 4, contentWidth, "Width", data.tactics.offensiveWidth, 10);
  cy = drawSliderRow(doc, PAGE_MARGIN, cy + 4, contentWidth, "Players in box", data.tactics.playersInBox, 10);
  cy = drawSliderRow(
    doc,
    PAGE_MARGIN,
    cy + 4,
    contentWidth,
    "Corners commitment",
    data.tactics.cornersCommitment,
    10,
  );
  drawSliderRow(
    doc,
    PAGE_MARGIN,
    cy + 4,
    contentWidth,
    "Free kicks commitment",
    data.tactics.freeKicksCommitment,
    10,
  );
  y += attackHeight + 14;

  // ── Set-piece roles ───────────────────────────────────────────────
  const rolesHeight = 158;
  drawCardShell(doc, PAGE_MARGIN, y, contentWidth, rolesHeight);
  cy = drawCardHeader(doc, PAGE_MARGIN, y, drawFlagGlyph, "SET-PIECE ROLES");
  const roles: [string, string | null][] = [
    ["Captain", data.tactics.captainId],
    ["Free kick taker", data.tactics.freeKickTakerId],
    ["Penalty taker", data.tactics.penaltyTakerId],
    ["Corner taker", data.tactics.cornerTakerId],
  ];
  for (const [label, athleteId] of roles) {
    cy = drawLabelValueRow(
      doc,
      PAGE_MARGIN,
      cy,
      contentWidth,
      label,
      athleteLabel(data.getAthlete(athleteId)),
    );
  }
  y += rolesHeight + 14;

  return y;
}

/* ─── Entry points ────────────────────────────────────────────────────── */

const PAGE1_QUOTE = "Discipline creates freedom on the pitch.";
const PAGE2_QUOTE = "Good tactics make good players better.";

/** Builds the plan's PDF document without triggering a download — used by
 * `downloadGamePlanPdf` and available directly for tests. */
export function buildGamePlanPdf(data: GamePlanExportData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const accent = hexToRgb(data.teamColor) ?? DEFAULT_TEAM_COLOR;
  const monogram = monogramFor(data.teamName);
  const dateLabel = new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase();

  // ── Page 1: Team Line-up ─────────────────────────────────────────
  drawPageHeader(doc, pageWidth, {
    title: data.teamName ?? data.planName,
    formationName: data.formation.name,
    sectionLabel: "Team Line-up",
    dateLabel,
    monogram,
    teamAccent: accent,
  });

  const bottomRowHeight = 150;
  const footerTop = pageHeight - FOOTER_ZONE;
  const bottomRowTop = footerTop - bottomRowHeight;
  const pitchTop = HEADER_HEIGHT + 18;
  const pitchBottom = bottomRowTop - 16;

  drawPitch(doc, data, contentWidth, pitchTop, pitchBottom, accent);

  const subsWidth = contentWidth * 0.52;
  drawSubstitutesCard(doc, data, PAGE_MARGIN, bottomRowTop, subsWidth, bottomRowHeight);
  drawQuoteCard(
    doc,
    PAGE_MARGIN + subsWidth + 16,
    bottomRowTop,
    contentWidth - subsWidth - 16,
    bottomRowHeight,
    PAGE1_QUOTE,
  );

  // ── Page 2: Tactical Plan ────────────────────────────────────────
  doc.addPage();
  drawPageHeader(doc, pageWidth, {
    title: data.teamName ?? data.planName,
    formationName: data.formation.name,
    sectionLabel: "Tactical Plan",
    dateLabel,
    monogram,
    teamAccent: accent,
  });

  const afterCards = drawTacticsPage(doc, data, contentWidth, HEADER_HEIGHT + 18);
  drawQuoteCard(doc, PAGE_MARGIN, afterCards, contentWidth, 78, PAGE2_QUOTE);

  drawFooters(doc);

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
