/**
 * Exports one athlete's full injury history — every record on file, open or
 * returned — as a printable, branded PDF a coach can hand to a physio or
 * keep for the club's own records.
 *
 * Each page is a light body between a deep-green header band and a
 * matching footer band — see `drawPageChrome`. An injury's notes and
 * timeline are unbounded free text, so the body is laid out as flowing
 * content below that fixed chrome: every row/paragraph/timeline-entry
 * checks whether it still fits the current page immediately before it
 * draws, and starts a fresh (re-chromed) page instead of overflowing into
 * the footer band.
 */

import jsPDF from "jspdf";
import {
  SEVERITY_GRADES,
  SEVERITY_LABELS,
  bodyRegionLabel,
  injuryTitle,
} from "./body-regions";
import {
  INJURY_STATUS_LABELS,
  TIMELINE_KIND_LABELS,
  formatDate,
  injurySummary,
  returnWindowLabel,
  sortForAttention,
  varianceLabel,
} from "./injury-model";
import type { InjuryContext, InjuryDetail, InjuryListItem } from "./types";

export interface InjuryReportEntry extends InjuryDetail {
  /** From the list endpoint — `InjuryDetail` itself doesn't carry this. */
  isRecurrence: boolean;
}

export interface InjuryReportData {
  athlete: {
    firstName: string;
    lastName: string;
    squadNumber: number | null;
    position: string | null;
  };
  teamName: string | null;
  /** This athlete's full record — every injury, open or returned. */
  injuries: readonly InjuryReportEntry[];
  /** `yyyy-mm-dd`, matching the rest of the app's `todayIso()`. */
  today: string;
}

/* ─── Palette ─────────────────────────────────────────────────────────── */

type Rgb = [number, number, number];

const CARD_BG: Rgb = [236, 242, 238];
const TILE_BG: Rgb = [250, 252, 250];
const TILE_BORDER: Rgb = [221, 230, 224];
const BAND_BG: Rgb = [11, 38, 26];
const BAND_TEXT: Rgb = [255, 255, 255];
const BAND_MUTED: Rgb = [176, 199, 186];
const BRAND_GREEN: Rgb = [21, 90, 58];
const ICON_BADGE_BG: Rgb = [213, 231, 221];
const TEXT_DARK: Rgb = [26, 30, 27];
const TEXT_MUTED: Rgb = [110, 118, 112];
const DIVIDER: Rgb = [219, 228, 222];
const WHITE: Rgb = [255, 255, 255];
const RED: Rgb = [185, 28, 28];
const RED_PILL_BG: Rgb = [252, 226, 226];
const RED_PILL_TEXT: Rgb = [153, 27, 27];
const GREEN_PILL_BG: Rgb = [212, 235, 220];
const GREEN_PILL_TEXT: Rgb = [21, 101, 63];
const AMBER_PILL_BG: Rgb = [253, 240, 210];
const AMBER_PILL_TEXT: Rgb = [161, 98, 7];
const EMERALD: Rgb = [4, 120, 87];
const AMBER: Rgb = [180, 83, 9];

const CONTEXT_LABELS: Record<InjuryContext, string> = {
  match: "Match",
  training: "Training",
  other: "Other",
};

/* ─── Page chrome geometry ────────────────────────────────────────────── */

const CARD_MARGIN = 0;
const CARD_RADIUS = 0;
const BAND_HEIGHT = 118;
const FOOTER_HEIGHT = 40;
const CONTENT_PAD_X = 22;
const CONTENT_TOP_GAP = 22;
const CONTENT_BOTTOM_GAP = 16;

interface HeaderInfo {
  athleteName: string;
  subInfo: string;
  dateLabel: string;
}

interface PageGeometry {
  cardX: number;
  cardY: number;
  cardW: number;
  cardH: number;
  contentX: number;
  contentWidth: number;
  contentTop: number;
  contentBottom: number;
}

interface PageCtx {
  pageWidth: number;
  pageHeight: number;
  header: HeaderInfo;
  geometry: PageGeometry;
}

function pageGeometry(pageWidth: number, pageHeight: number): PageGeometry {
  const cardX = CARD_MARGIN;
  const cardY = CARD_MARGIN;
  const cardW = pageWidth - CARD_MARGIN * 2;
  const cardH = pageHeight - CARD_MARGIN * 2;
  return {
    cardX,
    cardY,
    cardW,
    cardH,
    contentX: cardX + CONTENT_PAD_X,
    contentWidth: cardW - CONTENT_PAD_X * 2,
    contentTop: cardY + BAND_HEIGHT + CONTENT_TOP_GAP,
    contentBottom: cardY + cardH - FOOTER_HEIGHT - CONTENT_BOTTOM_GAP,
  };
}

/** Fills the whole page with a light card background, topped with a
 * deep-green header band and bottomed with a matching footer band. */
function drawPageChrome(doc: jsPDF, ctx: Pick<PageCtx, "pageWidth" | "pageHeight" | "header">): PageGeometry {
  const { pageWidth, pageHeight, header } = ctx;
  const geo = pageGeometry(pageWidth, pageHeight);

  doc.setFillColor(...CARD_BG);
  doc.roundedRect(geo.cardX, geo.cardY, geo.cardW, geo.cardH, CARD_RADIUS, CARD_RADIUS, "F");

  // Header band: rounded rect taller than the visible band by CARD_RADIUS,
  // then the excess bottom rounding is painted over in the card colour so
  // only the top corners stay rounded.
  doc.setFillColor(...BAND_BG);
  doc.roundedRect(
    geo.cardX,
    geo.cardY,
    geo.cardW,
    BAND_HEIGHT + CARD_RADIUS,
    CARD_RADIUS,
    CARD_RADIUS,
    "F",
  );
  doc.setFillColor(...CARD_BG);
  doc.rect(geo.cardX, geo.cardY + BAND_HEIGHT, geo.cardW, CARD_RADIUS, "F");

  // Footer band: same trick, mirrored, extending upward from the bottom.
  // Its height must match FOOTER_HEIGHT, the same figure `pageGeometry`
  // reserves for it in `contentBottom` — a mismatch there would silently
  // waste page space (or overflow into the band) without ever throwing.
  const footerTop = geo.cardY + geo.cardH - FOOTER_HEIGHT;
  const footerBandTop = footerTop - CARD_RADIUS;
  doc.setFillColor(...BAND_BG);
  doc.roundedRect(
    geo.cardX,
    footerBandTop,
    geo.cardW,
    geo.cardY + geo.cardH - footerBandTop,
    CARD_RADIUS,
    CARD_RADIUS,
    "F",
  );
  doc.setFillColor(...CARD_BG);
  doc.rect(geo.cardX, footerBandTop, geo.cardW, CARD_RADIUS, "F");

  /* ── Header content ── */
  const hx = geo.contentX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...BAND_TEXT);
  doc.text("GAFFER", hx, geo.cardY + 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...BAND_MUTED);
  doc.text("P L A Y   S M A R T E R", hx, geo.cardY + 43);

  const rx = geo.cardX + geo.cardW - CONTENT_PAD_X;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...BAND_TEXT);
  doc.text("INJURY REPORT", rx, geo.cardY + 28, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BAND_MUTED);
  doc.text(header.dateLabel, rx, geo.cardY + 39, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(23);
  doc.setTextColor(...BAND_TEXT);
  doc.text(header.athleteName, hx, geo.cardY + 78);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...BAND_MUTED);
  doc.text(header.subInfo, hx, geo.cardY + 96);

  /* ── Footer content ── */
  const footerCy = footerTop + (geo.cardY + geo.cardH - footerTop) / 2 + 2.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...BAND_MUTED);
  doc.text("DATA-DRIVEN DECISIONS FOR A HEALTHIER SQUAD", geo.contentX, footerCy);
  doc.text(
    "CONFIDENTIAL — FOR CLUB USE ONLY",
    geo.cardX + geo.cardW - CONTENT_PAD_X,
    footerCy,
    { align: "right" },
  );

  return geo;
}

/** Starts a fresh, re-chromed page if `needed` more points won't fit above
 * the footer band; otherwise a no-op. Every block below calls this with its
 * own height immediately before drawing, so nothing is ever clipped. */
function ensureSpace(doc: jsPDF, y: number, needed: number, ctx: PageCtx): number {
  if (y + needed <= ctx.geometry.contentBottom) {
    return y;
  }
  doc.addPage();
  ctx.geometry = drawPageChrome(doc, ctx);
  return ctx.geometry.contentTop;
}

/* ─── Small icon glyphs (all drawn in a `size`×`size` box) ───────────── */

function drawCrossIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.6);
  doc.circle(x + size / 2, y + size / 2, size / 2 - 1, "S");
  const pad = size * 0.3;
  doc.line(x + size / 2, y + pad, x + size / 2, y + size - pad);
  doc.line(x + pad, y + size / 2, x + size - pad, y + size / 2);
}

function drawPulseIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.4);
  doc.circle(x + size / 2, y + size / 2, size / 2 - 1, "S");
  const cy = y + size / 2;
  const pts: [number, number][] = [
    [x + size * 0.2, cy],
    [x + size * 0.36, cy],
    [x + size * 0.44, cy - size * 0.2],
    [x + size * 0.54, cy + size * 0.22],
    [x + size * 0.62, cy],
    [x + size * 0.8, cy],
  ];
  for (let i = 0; i < pts.length - 1; i += 1) {
    doc.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
}

function drawCalendarIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.3);
  const bodyY = y + size * 0.16;
  doc.roundedRect(x + size * 0.06, bodyY, size * 0.88, size * 0.78, 1.6, 1.6, "S");
  doc.line(x + size * 0.06, bodyY + size * 0.24, x + size * 0.94, bodyY + size * 0.24);
  doc.setLineWidth(1.8);
  doc.line(x + size * 0.28, y + size * 0.04, x + size * 0.28, bodyY + size * 0.1);
  doc.line(x + size * 0.72, y + size * 0.04, x + size * 0.72, bodyY + size * 0.1);
}

function drawRefreshIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.4);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.32;
  const startDeg = -40;
  const endDeg = 230;
  const steps = 16;
  let prev: [number, number] | null = null;
  for (let i = 0; i <= steps; i += 1) {
    const deg = startDeg + ((endDeg - startDeg) * i) / steps;
    const rad = (deg * Math.PI) / 180;
    const px = cx + r * Math.cos(rad);
    const py = cy + r * Math.sin(rad);
    if (prev) {
      doc.line(prev[0], prev[1], px, py);
    }
    prev = [px, py];
  }
  const endRad = (endDeg * Math.PI) / 180;
  const tipX = cx + r * Math.cos(endRad);
  const tipY = cy + r * Math.sin(endRad);
  const tangent = endRad + Math.PI / 2;
  const wing = size * 0.16;
  doc.setFillColor(...color);
  doc.triangle(
    tipX,
    tipY,
    tipX + wing * Math.cos(tangent + 2.5),
    tipY + wing * Math.sin(tangent + 2.5),
    tipX + wing * Math.cos(tangent - 2.5),
    tipY + wing * Math.sin(tangent - 2.5),
    "F",
  );
}

function drawDocIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.1);
  doc.roundedRect(x + size * 0.14, y + size * 0.06, size * 0.72, size * 0.88, 1.4, 1.4, "S");
  [0.3, 0.5, 0.7].forEach((frac) => {
    doc.line(x + size * 0.26, y + size * frac, x + size * 0.74, y + size * frac);
  });
}

function drawClockIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  doc.setDrawColor(...color);
  doc.setLineWidth(1.3);
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size / 2 - 1;
  doc.circle(cx, cy, r, "S");
  doc.line(cx, cy, cx, cy - r * 0.55);
  doc.line(cx, cy, cx + r * 0.42, cy + r * 0.16);
}

/** A map pin: a teardrop outline around a filled dot, for "Injury area". */
function drawPinIcon(doc: jsPDF, x: number, y: number, size: number, color: Rgb): void {
  const cx = x + size / 2;
  const cy = y + size * 0.42;
  const r = size * 0.32;
  doc.setDrawColor(...color);
  doc.setLineWidth(1.3);
  doc.circle(cx, cy, r, "S");
  doc.triangle(
    cx - r * 0.62,
    cy + r * 0.62,
    cx + r * 0.62,
    cy + r * 0.62,
    cx,
    y + size * 0.94,
    "S",
  );
  doc.setFillColor(...color);
  doc.circle(cx, cy, r * 0.4, "F");
}

const ROW_ICONS: Record<
  "area" | "context" | "diagnosedBy" | "return" | "daysOut",
  (doc: jsPDF, x: number, y: number, size: number, color: Rgb) => void
> = {
  area: drawPinIcon,
  context: drawDocIcon,
  diagnosedBy: drawCrossIcon,
  return: drawClockIcon,
  daysOut: drawCalendarIcon,
};

/* ─── Pills & rows ─────────────────────────────────────────────────────── */

function drawPill(
  doc: jsPDF,
  x: number,
  y: number,
  text: string,
  bg: Rgb,
  textColor: Rgb,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  const textWidth = doc.getTextWidth(text);
  const padX = 8;
  const width = textWidth + padX * 2;
  const height = 17;
  doc.setFillColor(...bg);
  doc.roundedRect(x, y, width, height, height / 2, height / 2, "F");
  doc.setTextColor(...textColor);
  doc.text(text, x + width / 2, y + height / 2 + 2.8, { align: "center" });
  return width;
}

function severityPillColors(severity: InjuryReportEntry["severity"]): [Rgb, Rgb] {
  if (severity === "minor") return [AMBER_PILL_BG, AMBER_PILL_TEXT];
  return [RED_PILL_BG, RED_PILL_TEXT];
}

function statusPillColors(status: InjuryReportEntry["status"]): [Rgb, Rgb] {
  if (status === "season_ending") return [RED_PILL_BG, RED_PILL_TEXT];
  return [GREEN_PILL_BG, GREEN_PILL_TEXT];
}

/* ─── Timeline (unbounded free text) ──────────────────────────────────── */

const TIMELINE_DATE_COLUMN = 84;

interface TimelineEntryLayout {
  titleLines: string[];
  detailLines: string[];
  height: number;
}

/** Pure text measurement — `splitTextToSize` has no drawing side effects,
 * unlike everything else in this file, so this is safe to call while
 * sizing a card before any of it is actually painted onto the page. */
function measureTimelineEntry(
  doc: jsPDF,
  width: number,
  entry: InjuryDetail["timeline"][number],
): TimelineEntryLayout {
  const kindLabel = TIMELINE_KIND_LABELS[entry.kind];
  const titleLine =
    entry.title.trim().toLowerCase() === kindLabel.toLowerCase()
      ? kindLabel
      : `${kindLabel} — ${entry.title}`;
  const textWidth = width - TIMELINE_DATE_COLUMN;
  const titleLines = doc.splitTextToSize(titleLine, textWidth) as string[];
  const detailLines = entry.detail
    ? (doc.splitTextToSize(entry.detail, textWidth) as string[])
    : [];
  const height = Math.max(
    titleLines.length * 13 + detailLines.length * 11 + (detailLines.length ? 3 : 0),
    22,
  );
  return { titleLines, detailLines, height };
}

function drawTimelineEntry(
  doc: jsPDF,
  y: number,
  x: number,
  layout: TimelineEntryLayout,
  entry: InjuryDetail["timeline"][number],
  isCurrent: boolean,
  isLast: boolean,
): number {
  const textX = x + TIMELINE_DATE_COLUMN;
  const dotCx = x + 5;
  const dotCy = y - 3;

  if (!isLast) {
    doc.setDrawColor(...DIVIDER);
    doc.setLineWidth(1);
    doc.line(dotCx, dotCy + 6, dotCx, dotCy + layout.height + 4);
  }

  doc.setDrawColor(...(isCurrent ? EMERALD : TEXT_MUTED));
  doc.setLineWidth(1.3);
  if (isCurrent) {
    doc.setFillColor(...EMERALD);
    doc.circle(dotCx, dotCy, 4.2, "F");
  } else {
    doc.setFillColor(...WHITE);
    doc.circle(dotCx, dotCy, 4.2, "FD");
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(formatDate(entry.occurredOn).toUpperCase(), x + 16, y - 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text(layout.titleLines, textX, y);
  const ty = y + layout.titleLines.length * 13;

  if (layout.detailLines.length > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(layout.detailLines, textX, ty);
  }

  return y + layout.height;
}

/* ─── Card shell helper ───────────────────────────────────────────────── */

function drawCardShell(doc: jsPDF, x: number, y: number, width: number, height: number): void {
  doc.setFillColor(...TILE_BG);
  doc.setDrawColor(...TILE_BORDER);
  doc.setLineWidth(0.75);
  doc.roundedRect(x, y, width, height, 10, 10, "FD");
}

function drawSectionLabel(doc: jsPDF, ctx: PageCtx, y: number, x: number, text: string): number {
  y = ensureSpace(doc, y, 16, ctx);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(text.toUpperCase(), x, y);
  return y + 14;
}

/* ─── Summary strip ───────────────────────────────────────────────────── */

function drawSummaryStrip(
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  stats: { total: number; open: number; daysLost: number; recurrences: number },
): number {
  const gap = 10;
  const tileWidth = (width - gap * 3) / 4;
  // Tall enough that a 19pt bold value never runs into an (up to two-line)
  // label above it — the value is bottom-anchored at a fixed offset from
  // the tile's own bottom, not chased down by however tall the label was.
  const tileHeight = 70;
  const tiles: [string, number, Rgb, (d: jsPDF, x: number, y: number, s: number, c: Rgb) => void][] = [
    ["TOTAL INJURIES", stats.total, TEXT_DARK, drawCrossIcon],
    ["TOTAL CURRENT INJURIES", stats.open, stats.open > 0 ? RED : EMERALD, drawPulseIcon],
    ["DAYS LOST", stats.daysLost, TEXT_DARK, drawCalendarIcon],
    ["RECURRENCES", stats.recurrences, stats.recurrences > 0 ? AMBER : TEXT_DARK, drawRefreshIcon],
  ];

  tiles.forEach(([label, value, color, icon], i) => {
    const tx = x + i * (tileWidth + gap);
    drawCardShell(doc, tx, y, tileWidth, tileHeight);

    const badgeSize = 20;
    doc.setFillColor(...ICON_BADGE_BG);
    doc.circle(tx + 14, y + 14, badgeSize / 2, "F");
    icon(doc, tx + 14 - badgeSize / 2 + 4, y + 14 - badgeSize / 2 + 4, badgeSize - 8, BRAND_GREEN);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.3);
    doc.setTextColor(...TEXT_MUTED);
    const labelLines = doc.splitTextToSize(label, tileWidth - 16) as string[];
    doc.text(labelLines, tx + 12, y + 32);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(19);
    doc.setTextColor(...color);
    doc.text(String(value), tx + 12, y + tileHeight - 10);
  });

  return y + tileHeight;
}

/* ─── One injury's full record ───────────────────────────────────────── */

function drawCurrentInjuryCard(
  doc: jsPDF,
  ctx: PageCtx,
  y: number,
  x: number,
  width: number,
  injury: InjuryReportEntry,
): number {
  // The row/date values are right-aligned to `lx + colW`, so this must be
  // the width actually available *inside* the card's own padding — using
  // the raw card `width` here previously pushed every right-aligned value
  // padX (18pt) past the card's own right edge.
  const padX = 18;
  const padY = 18;
  const colW = width - padX * 2;

  // Every row height here is deterministic (fixed rows plus a wrapped
  // return-window line), so the card height can be computed before
  // anything is drawn — needed since the background must be filled first.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const returnValue = injury.actualReturnOn
    ? `${formatDate(injury.actualReturnOn)} · ${varianceLabel(injury.returnVarianceDays)}`
    : `${returnWindowLabel(injury.estimatedReturnMinDays, injury.estimatedReturnMaxDays)} (${formatDate(
        injury.estimatedReturnFrom,
      )} – ${formatDate(injury.estimatedReturnTo)})`;
  const returnLines = Math.max(
    1,
    (doc.splitTextToSize(returnValue, colW * 0.55) as string[]).length,
  );
  const bodyHeight = 24 + 22 + 19 * 4 + 19 * returnLines + 4;
  const cardHeight = bodyHeight + 34;

  y = ensureSpace(doc, y, cardHeight, ctx);
  drawCardShell(doc, x, y, width, cardHeight);

  let cy = y + padY;
  const lx = x + padX;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...TEXT_DARK);
  doc.text(injuryTitle(injury), lx, cy);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_MUTED);
  doc.text(formatDate(injury.occurredOn), lx + colW, cy, { align: "right" });
  cy += 22;

  const [sevBg, sevText] = severityPillColors(injury.severity);
  const severityLabel = `${SEVERITY_LABELS[injury.severity]} (${SEVERITY_GRADES[injury.severity]})`.toUpperCase();
  const sevWidth = drawPill(doc, lx, cy - 12, severityLabel, sevBg, sevText);
  const [statusBg, statusText] = statusPillColors(injury.status);
  drawPill(doc, lx + sevWidth + 8, cy - 12, INJURY_STATUS_LABELS[injury.status].toUpperCase(), statusBg, statusText);
  cy += 19;

  const contextValue =
    injury.context === "match" && injury.minute != null
      ? `Match · ${injury.minute}'`
      : CONTEXT_LABELS[injury.context];
  cy = drawIconRowFixed(doc, cy, lx, colW, "area", "Injury area", bodyRegionLabel(injury.bodyRegion));
  cy = drawIconRowFixed(doc, cy, lx, colW, "context", "Context", contextValue);
  cy = drawIconRowFixed(doc, cy, lx, colW, "diagnosedBy", "Diagnosed by", injury.diagnosedBy ?? "Not recorded");
  cy = drawIconRowFixedWrapped(doc, cy, lx, colW, "return", injury.actualReturnOn ? "Returned" : "Estimated return", returnValue);
  cy = drawIconRowFixed(doc, cy, lx, colW, "daysOut", "Days out", String(injury.daysOut));

  return y + cardHeight;

  /** Fixed single-line row (values here never wrap). */
  function drawIconRowFixed(
    d: jsPDF,
    rowY: number,
    rx: number,
    rw: number,
    icon: keyof typeof ROW_ICONS,
    label: string,
    value: string,
  ): number {
    const iconSize = 12;
    ROW_ICONS[icon](d, rx, rowY - iconSize + 3, iconSize, TEXT_MUTED);
    d.setFont("helvetica", "normal");
    d.setFontSize(9);
    d.setTextColor(...TEXT_MUTED);
    d.text(label, rx + iconSize + 7, rowY);
    d.setFont("helvetica", "bold");
    d.setTextColor(...TEXT_DARK);
    d.text(value, rx + rw, rowY, { align: "right" });
    return rowY + 19;
  }

  /** Same, but the value may wrap onto a second line under the label. */
  function drawIconRowFixedWrapped(
    d: jsPDF,
    rowY: number,
    rx: number,
    rw: number,
    icon: keyof typeof ROW_ICONS,
    label: string,
    value: string,
  ): number {
    const iconSize = 12;
    ROW_ICONS[icon](d, rx, rowY - iconSize + 3, iconSize, TEXT_MUTED);
    d.setFont("helvetica", "normal");
    d.setFontSize(9);
    d.setTextColor(...TEXT_MUTED);
    d.text(label, rx + iconSize + 7, rowY);
    const lines = d.splitTextToSize(value, rw * 0.55) as string[];
    d.setFont("helvetica", "bold");
    d.setTextColor(...TEXT_DARK);
    d.text(lines, rx + rw, rowY, { align: "right" });
    return rowY + 19 * lines.length;
  }
}

/**
 * Which entry reads as "currently" on the timeline: the most recent one
 * that has actually happened, matching the in-app `InjuryTimeline`'s own
 * rule. The *last array entry* is very often a still-future projection
 * (e.g. "Estimated return"), so indexing by array position alone would
 * mark a not-yet-reached milestone as done.
 */
function currentTimelineIndex(
  entries: readonly InjuryDetail["timeline"][number][],
  today: string,
  isOpen: boolean,
): number {
  if (!isOpen) {
    return -1;
  }
  let current = -1;
  entries.forEach((entry, i) => {
    if (entry.occurredOn <= today) {
      current = i;
    }
  });
  return current;
}

function drawTimelineCard(
  doc: jsPDF,
  ctx: PageCtx,
  y: number,
  x: number,
  width: number,
  injury: InjuryReportEntry,
  today: string,
): number {
  if (injury.timeline.length === 0) {
    return y;
  }
  const padX = 18;
  const padY = 16;
  const headingH = 20;
  const textWidth = width - padX * 2;

  // `measureTimelineEntry` is pure (just `splitTextToSize`), so the card's
  // full height is known before any of it is drawn — needed since the
  // shell background has to be filled first.
  const layouts = injury.timeline.map((entry) => measureTimelineEntry(doc, textWidth, entry));
  const entriesHeight = layouts.reduce((sum, layout) => sum + layout.height, 0);
  const cardHeight = padY + headingH + entriesHeight + padY;
  const currentIndex = currentTimelineIndex(injury.timeline, today, injury.isOpen);

  y = ensureSpace(doc, y, cardHeight, ctx);
  drawCardShell(doc, x, y, width, cardHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Timeline", x + padX, y + padY + 6);

  let ty = y + padY + headingH;
  injury.timeline.forEach((entry, i) => {
    ty = drawTimelineEntry(
      doc,
      ty,
      x + padX,
      layouts[i],
      entry,
      i === currentIndex,
      i === injury.timeline.length - 1,
    );
  });

  return y + cardHeight + 16;
}

function drawNotesCard(
  doc: jsPDF,
  ctx: PageCtx,
  y: number,
  x: number,
  width: number,
  injury: InjuryReportEntry,
): number {
  const text = injury.notes ?? injury.description;
  const padX = 18;
  const padY = 16;
  const lines = text
    ? (doc.splitTextToSize(text, width - padX * 2) as string[])
    : ["No additional notes recorded."];
  const cardHeight = 20 + lines.length * 13 + padY * 2 - 6;

  y = ensureSpace(doc, y, cardHeight, ctx);
  drawCardShell(doc, x, y, width, cardHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Additional notes", x + padX, y + padY + 4);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...(text ? TEXT_DARK : TEXT_MUTED));
  let ty = y + padY + 24;
  for (const line of lines) {
    doc.text(line, x + padX, ty);
    ty += 13;
  }

  return y + cardHeight;
}

function drawReportDetailsCard(
  doc: jsPDF,
  ctx: PageCtx,
  y: number,
  x: number,
  width: number,
  data: InjuryReportData,
): number {
  const padX = 18;
  const padY = 16;
  const labelWidth = 60;
  const valueWidth = width - padX * 2 - labelWidth;
  const rows: [string, string][] = [
    [
      "Generated",
      new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
    ],
    ["Source", "Gaffer"],
    [
      "Player",
      `${data.athlete.firstName} ${data.athlete.lastName}${
        data.athlete.squadNumber != null ? ` (#${data.athlete.squadNumber})` : ""
      }`,
    ],
    ["Team", data.teamName ?? "—"],
  ];
  // A team/player name can run long (this row in particular has no natural
  // length cap), so the value wraps within its own column rather than
  // overflowing past the card — `splitTextToSize` is pure measurement, safe
  // to call before anything is drawn.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  const rowLines = rows.map(
    ([, value]) => doc.splitTextToSize(value, valueWidth) as string[],
  );
  const rowsHeight = rowLines.reduce((sum, lines) => sum + Math.max(lines.length, 1) * 13, 0);
  const cardHeight = 24 + rowsHeight + padY;

  y = ensureSpace(doc, y, cardHeight, ctx);
  drawCardShell(doc, x, y, width, cardHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXT_DARK);
  doc.text("Report details", x + padX, y + padY + 4);

  let ty = y + padY + 22;
  rows.forEach(([label], i) => {
    const lines = rowLines[i];
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(label, x + padX, ty);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TEXT_DARK);
    doc.text(lines, x + width - padX, ty, { align: "right" });
    ty += Math.max(lines.length, 1) * 13;
  });

  return y + cardHeight;
}

/* ─── Entry points ────────────────────────────────────────────────────── */

/** Builds the report's PDF document without triggering a download — used by
 * `downloadInjuryReportPdf` and available directly for tests. */
export function buildInjuryReportPdf(data: InjuryReportData): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const athleteFullName = `${data.athlete.firstName} ${data.athlete.lastName}`;
  const subInfo =
    [
      data.athlete.squadNumber != null ? `#${data.athlete.squadNumber}` : null,
      data.athlete.position,
    ]
      .filter(Boolean)
      .join("   |   ") || "Injury & recovery record";
  const dateLabel = `GENERATED ${new Date()
    .toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    .toUpperCase()}`;

  const header: HeaderInfo = { athleteName: athleteFullName, subInfo, dateLabel };
  const ctx: PageCtx = {
    pageWidth,
    pageHeight,
    header,
    geometry: pageGeometry(pageWidth, pageHeight),
  };
  ctx.geometry = drawPageChrome(doc, ctx);

  const sorted = sortForAttention(data.injuries);
  const summaryInput: InjuryListItem[] = sorted;
  const summary = injurySummary(summaryInput, data.today);

  let y = ctx.geometry.contentTop;
  y = drawSummaryStrip(doc, ctx.geometry.contentX, y, ctx.geometry.contentWidth, {
    total: sorted.length,
    open: summary.openCount,
    daysLost: summary.daysLostThisSeason,
    recurrences: summary.recurrenceCount,
  });
  y += 18;

  if (sorted.length === 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...TEXT_MUTED);
    doc.text("No injuries on record.", ctx.geometry.contentX, y + 4);
  } else {
    sorted.forEach((injury, index) => {
      y = drawSectionLabel(
        doc,
        ctx,
        y,
        ctx.geometry.contentX,
        injury.isOpen ? "Current injury" : "Past injury",
      );
      y = drawCurrentInjuryCard(doc, ctx, y, ctx.geometry.contentX, ctx.geometry.contentWidth, injury);
      y += 16;
      y = drawTimelineCard(doc, ctx, y, ctx.geometry.contentX, ctx.geometry.contentWidth, injury, data.today);

      // The report-level "Report details" card only ever appears once,
      // paired beside the first (most relevant) injury's own notes —
      // matching the approved design's bottom two-column footer. Every
      // other injury's notes render full width on their own.
      if (index === 0) {
        const notesWidth = ctx.geometry.contentWidth * 0.58;
        const detailsWidth = ctx.geometry.contentWidth - notesWidth - 16;
        const beforeY = y;
        const notesEndY = drawNotesCard(doc, ctx, y, ctx.geometry.contentX, notesWidth, injury);
        const detailsEndY = drawReportDetailsCard(
          doc,
          ctx,
          y,
          ctx.geometry.contentX + notesWidth + 16,
          detailsWidth,
          data,
        );
        y = Math.max(notesEndY, detailsEndY, beforeY) + 20;
      } else {
        y = drawNotesCard(doc, ctx, y, ctx.geometry.contentX, ctx.geometry.contentWidth, injury) + 20;
      }
    });
  }

  return doc;
}

/** Turns a name into a safe, lowercase, hyphenated filename stem. */
export function slugifyFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
  return slug || "injury-report";
}

/** Builds the athlete's injury report and triggers a browser download of it. */
export function downloadInjuryReportPdf(data: InjuryReportData): void {
  const doc = buildInjuryReportPdf(data);
  const slug = slugifyFileName(`${data.athlete.firstName}-${data.athlete.lastName}`);
  doc.save(`injury-report-${slug}.pdf`);
}
