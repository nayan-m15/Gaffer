/**
 * Generates a branded PDF reference for Gaffer's public API
 * (`GET /v1/formations`, `GET /v1/tactics` — see `src/public-api/`).
 *
 * Pure documentation generator: it does not call the running API, it
 * describes the contract from the source of truth (the controllers,
 * schemas and static catalogs under `src/public-api/`) so the examples
 * shown here are hand-kept in sync with that code, not fetched live.
 * For a guaranteed-live view of the deployed contract, see the running
 * Swagger UI at `/api/docs` instead.
 *
 *   node backend/scripts/generate-public-api-reference.mjs
 *
 * Writes docs/Gaffer-Public-API-Reference.pdf (repo-relative).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jsPDF, GState } from 'jspdf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../../docs');
const OUT_FILE = path.join(OUT_DIR, 'Gaffer-Public-API-Reference.pdf');

const FRONTEND_BASE_URL = 'https://gaffer-virid.vercel.app/api';
const BACKEND_BASE_URL = 'https://gaffer-api-ynaf.onrender.com';

/* ─── Palette & layout (matches the in-app game-plan PDF export) ──────── */

const PAGE_MARGIN = 42;
const HEADER_HEIGHT = 96;
const FOOTER_ZONE = 40;

const HEADER_BG = [16, 43, 30];
const BRAND_GREEN = [31, 118, 63];
const LABEL_LIGHT = [188, 205, 193];
const TEXT_DARK = [26, 26, 24];
const TEXT_MUTED = [110, 108, 102];
const CARD_BG = [243, 242, 238];
const CODE_BG = [19, 26, 22];
const CODE_TEXT = [198, 232, 208];
const CODE_MUTED = [130, 155, 138];
const TABLE_HEADER_BG = [31, 118, 63];
const TABLE_ROW_ALT = [248, 247, 244];
const BORDER = [223, 222, 216];
const WHITE = [255, 255, 255];
const GET_PILL = [31, 118, 63];

function setFill(doc, rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
}
function setDraw(doc, rgb) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
}
function setText(doc, rgb) {
  doc.setTextColor(rgb[0], rgb[1], rgb[2]);
}

/* ─── Page chrome ───────────────────────────────────────────────────── */

let pageIndex = 0;

function newPage(doc, title, subtitle) {
  pageIndex += 1;
  if (pageIndex > 1) doc.addPage();

  const pageWidth = doc.internal.pageSize.getWidth();
  setFill(doc, HEADER_BG);
  doc.rect(0, 0, pageWidth, HEADER_HEIGHT, 'F');

  doc.setGState(new GState({ opacity: 0.07 }));
  setDraw(doc, WHITE);
  doc.setLineWidth(22);
  doc.circle(pageWidth - 30, 20, 100, 'S');
  doc.setGState(new GState({ opacity: 1 }));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  setText(doc, WHITE);
  doc.text(title, PAGE_MARGIN, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  setText(doc, LABEL_LIGHT);
  doc.text(subtitle, PAGE_MARGIN, 62);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  setText(doc, WHITE);
  doc.text('GAFFER', pageWidth - PAGE_MARGIN, 44, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  setText(doc, LABEL_LIGHT);
  doc.text('PUBLIC API REFERENCE · v1.0.0', pageWidth - PAGE_MARGIN, 56, {
    align: 'right',
  });

  return HEADER_HEIGHT + 26;
}

function drawFooters(doc) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    setText(doc, TEXT_MUTED);
    doc.text(
      'Gaffer · The Football Coaching Platform',
      PAGE_MARGIN,
      pageHeight - 18,
    );
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - PAGE_MARGIN, pageHeight - 18, {
      align: 'right',
    });
  }
}

/** Adds a page (repeating the current section's chrome) if `needed` extra
 * points don't fit before the footer zone. Returns the (possibly reset) y. */
function ensureSpace(doc, y, needed, title, subtitle) {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed <= pageHeight - FOOTER_ZONE) return y;
  return newPage(doc, title, subtitle);
}

/* ─── Content primitives ───────────────────────────────────────────── */

function drawHeading(doc, x, y, text) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  setText(doc, TEXT_DARK);
  doc.text(text, x, y);
  setDraw(doc, BORDER);
  doc.setLineWidth(1);
  doc.line(x, y + 6, x + doc.internal.pageSize.getWidth() - x - PAGE_MARGIN, y + 6);
  return y + 22;
}

function drawParagraph(doc, x, y, width, text, options = {}) {
  doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
  doc.setFontSize(options.size ?? 9.5);
  setText(doc, options.muted ? TEXT_MUTED : TEXT_DARK);
  const lines = doc.splitTextToSize(text, width);
  doc.text(lines, x, y);
  return y + lines.length * (options.lineHeight ?? 13);
}

function drawBulletList(doc, x, y, width, items) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  let cursor = y;
  for (const item of items) {
    setFill(doc, BRAND_GREEN);
    doc.circle(x + 2.5, cursor - 3, 1.6, 'F');
    setText(doc, TEXT_DARK);
    const lines = doc.splitTextToSize(item, width - 14);
    doc.text(lines, x + 12, cursor);
    cursor += lines.length * 13 + 4;
  }
  return cursor;
}

/** A GET-method pill followed by a monospace path. */
function drawEndpointBadge(doc, x, y, path) {
  const pillWidth = 40;
  const pillHeight = 18;
  setFill(doc, GET_PILL);
  doc.roundedRect(x, y - 13, pillWidth, pillHeight, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setText(doc, WHITE);
  doc.text('GET', x + pillWidth / 2, y, { align: 'center' });

  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  setText(doc, TEXT_DARK);
  doc.text(path, x + pillWidth + 10, y + 1);

  return y + pillHeight + 8;
}

/** A simple two-column table: header row (brand green) + striped body rows. */
/** Sets the font used for a given column: monospace for the first (an
 * identifier/name), regular text for the rest. */
function setTableCellFont(doc, colIndex) {
  if (colIndex === 0) doc.setFont('courier', 'bold');
  else doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
}

/** A two-or-more column table: header row (brand green) + striped body
 * rows, each sized to fit however many lines its longest cell wraps to —
 * a fixed row height would silently clip any cell that wraps. */
function drawTable(doc, x, y, width, columns, rows) {
  const headerHeight = 22;
  const cellLineHeight = 11;
  const cellPaddingV = 7;

  setFill(doc, TABLE_HEADER_BG);
  doc.rect(x, y, width, headerHeight, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  setText(doc, WHITE);
  let colX = x;
  columns.forEach((col) => {
    doc.text(col.label, colX + 10, y + 14);
    colX += col.width;
  });

  const wrappedRows = rows.map((row) =>
    columns.map((col, colIndex) => {
      setTableCellFont(doc, colIndex);
      return doc.splitTextToSize(String(row[colIndex] ?? ''), col.width - 14);
    }),
  );
  const rowHeights = wrappedRows.map(
    (cells) =>
      Math.max(...cells.map((lines) => lines.length)) * cellLineHeight +
      cellPaddingV * 2,
  );

  let rowY = y + headerHeight;
  wrappedRows.forEach((cells, i) => {
    const rowHeight = rowHeights[i];
    if (i % 2 === 1) {
      setFill(doc, TABLE_ROW_ALT);
      doc.rect(x, rowY, width, rowHeight, 'F');
    }
    setText(doc, TEXT_DARK);
    colX = x;
    columns.forEach((col, colIndex) => {
      setTableCellFont(doc, colIndex);
      doc.text(cells[colIndex], colX + 10, rowY + cellPaddingV + 7);
      colX += col.width;
    });
    rowY += rowHeight;
  });

  setDraw(doc, BORDER);
  doc.setLineWidth(1);
  doc.rect(x, y, width, rowY - y, 'S');

  return rowY + 10;
}

const CODE_LINE_HEIGHT = 11.5;
const CODE_PADDING = 12;

/** Wraps `code` to fit a code block of `width`, indenting continuation
 * lines so a long JSON line still reads as one line, not a new one. Shared
 * by `drawCodeBlock` and `codeBlockHeight` so measuring and drawing can
 * never drift apart. */
function wrapCodeLines(doc, width, code) {
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  const availableWidth = width - CODE_PADDING * 2;
  return code.split('\n').flatMap((raw) => {
    const indent = /^\s*/.exec(raw)[0];
    const pieces = doc.splitTextToSize(raw, availableWidth);
    return pieces.map((piece, i) => (i === 0 ? piece : indent + '  ' + piece.trimStart()));
  });
}

/** Total vertical space `drawCodeBlock` will need for this code, so callers
 * can `ensureSpace` for the real size instead of guessing a constant (a
 * guess that's too small silently pushes content into the footer or off
 * the page — the exact bug this replaced). */
function codeBlockHeight(doc, width, code, hasLabel) {
  const lines = wrapCodeLines(doc, width, code);
  const labelHeight = hasLabel ? 12 : 0;
  return labelHeight + lines.length * CODE_LINE_HEIGHT + CODE_PADDING * 2 + 14;
}

/** A dark, monospace code panel for a JSON example or curl command. */
function drawCodeBlock(doc, x, y, width, code, label) {
  let top = y;
  if (label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setText(doc, TEXT_MUTED);
    doc.text(label.toUpperCase(), x, top);
    top += 12;
  }

  const lines = wrapCodeLines(doc, width, code);
  const blockHeight = lines.length * CODE_LINE_HEIGHT + CODE_PADDING * 2;

  setFill(doc, CODE_BG);
  doc.roundedRect(x, top, width, blockHeight, 6, 6, 'F');
  setText(doc, CODE_TEXT);
  lines.forEach((line, i) => {
    doc.text(line, x + CODE_PADDING, top + CODE_PADDING + 8 + i * CODE_LINE_HEIGHT);
  });

  return top + blockHeight + 14;
}

/** Ensures room for the block (measured, not guessed) before drawing it —
 * use this instead of calling `drawCodeBlock` directly wherever a page
 * break might be needed. */
function drawCodeBlockSafely(doc, x, y, width, code, label, pageTitle, pageSubtitle) {
  const needed = codeBlockHeight(doc, width, code, Boolean(label));
  const top = ensureSpace(doc, y, needed, pageTitle, pageSubtitle);
  return drawCodeBlock(doc, x, top, width, code, label);
}

/* ─── Document content ──────────────────────────────────────────────── */

const doc = new jsPDF({ unit: 'pt', format: 'a4' });
const pageWidth = doc.internal.pageSize.getWidth();
const contentWidth = pageWidth - PAGE_MARGIN * 2;

/* ── Page 1: Overview ── */
const PAGE1_TITLE = 'Public API Reference';
const PAGE1_SUBTITLE = 'Formations & tactics · read-only · no authentication';
let y = newPage(doc, PAGE1_TITLE, PAGE1_SUBTITLE);

y = drawHeading(doc, PAGE_MARGIN, y, 'Overview');
y = drawParagraph(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  'Gaffer publishes a small, externally accessible, read-only API of generic ' +
    'coaching reference content: supported football formations and tactical ' +
    'approaches. It requires no login and returns no team, player, or account ' +
    'data — see the security boundary below.',
);
y += 8;

y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `Frontend (proxied):  ${FRONTEND_BASE_URL}/v1/formations\nBackend (direct):    ${BACKEND_BASE_URL}/v1/formations`,
  'Base URLs',
  PAGE1_TITLE,
  PAGE1_SUBTITLE,
);

y = drawHeading(doc, PAGE_MARGIN, y, 'Security & access');
y = drawBulletList(doc, PAGE_MARGIN, y, contentWidth, [
  'No authentication required — every route here is public by design.',
  'GET only. There are no create, update or delete endpoints on this API.',
  'CORS is open (Access-Control-Allow-Origin: *) for these two routes specifically; ' +
    'every other Gaffer endpoint keeps its normal cookie-authenticated, allow-listed CORS policy.',
  'Responses are sanitized, static reference data — formation shapes and tactical ' +
    'style descriptions. No player, coach, team, email, or session data is ever returned.',
]);
y += 6;

y = drawHeading(doc, PAGE_MARGIN, y, 'Response envelope');
y = drawParagraph(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  'Both endpoints share one envelope. Listing returns every record; adding ?id= ' +
    'narrows it to one, still wrapped in a single-item data array.',
);
y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `{\n  "success": true,\n  "count": <number of records returned>,\n  "data": [ { ...record } ]\n}`,
  'Shape',
  PAGE1_TITLE,
  PAGE1_SUBTITLE,
);

y = drawHeading(doc, PAGE_MARGIN, y, 'Interactive docs');
drawParagraph(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `A live, testable Swagger UI documenting these routes (grouped under the ` +
    `"Public API" tag) is served directly by the backend at ${BACKEND_BASE_URL}/api/docs.`,
);

/* ── Page 2: GET /v1/formations ── */
const PAGE2_TITLE = 'GET /v1/formations';
const PAGE2_SUBTITLE = 'Football formation reference data';
y = newPage(doc, PAGE2_TITLE, PAGE2_SUBTITLE);
y = drawEndpointBadge(doc, PAGE_MARGIN, y, '/v1/formations');
y = drawParagraph(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  'Returns the catalog of supported formations, or a single formation when ?id= is given.',
);
y += 4;

y = drawHeading(doc, PAGE_MARGIN, y, 'Query parameters');
y = drawTable(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  [
    { label: 'Name', width: 90 },
    { label: 'Type', width: 60 },
    { label: 'Required', width: 70 },
    { label: 'Description', width: contentWidth - 220 },
  ],
  [['id', 'string', 'No', 'Formation id to fetch, e.g. "4-3-3". Empty string is a 400.']],
);

y = drawHeading(doc, PAGE_MARGIN, y, 'Example: list all formations');
y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `GET ${FRONTEND_BASE_URL}/v1/formations`,
  'Request',
  PAGE2_TITLE,
  PAGE2_SUBTITLE,
);
y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `HTTP 200 OK\n\n{\n  "success": true,\n  "count": 8,\n  "data": [\n    {\n      "id": "4-3-3",\n      "name": "4-3-3",\n      "shape": "4-3-3",\n      "description": "A balanced formation with width in attack and a three-player midfield that can dominate possession."\n    }\n    // ...7 more formations\n  ]\n}`,
  'Response',
  PAGE2_TITLE,
  PAGE2_SUBTITLE,
);

y = drawHeading(doc, PAGE_MARGIN, y, 'Example: one formation by id');
y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `GET ${FRONTEND_BASE_URL}/v1/formations?id=4-3-3`,
  'Request',
  PAGE2_TITLE,
  PAGE2_SUBTITLE,
);
drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `HTTP 200 OK\n\n{\n  "success": true,\n  "count": 1,\n  "data": [\n    {\n      "id": "4-3-3",\n      "name": "4-3-3",\n      "shape": "4-3-3",\n      "description": "A balanced formation with width in attack and a three-player midfield that can dominate possession."\n    }\n  ]\n}`,
  'Response',
  PAGE2_TITLE,
  PAGE2_SUBTITLE,
);

/* ── Page 3: GET /v1/tactics ── */
const PAGE3_TITLE = 'GET /v1/tactics';
const PAGE3_SUBTITLE = 'Tactical approach reference data';
y = newPage(doc, PAGE3_TITLE, PAGE3_SUBTITLE);
y = drawEndpointBadge(doc, PAGE_MARGIN, y, '/v1/tactics');
y = drawParagraph(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  'Returns the catalog of supported defensive/offensive tactical styles, or a single ' +
    'tactic when ?id= is given. formationId is always null — a style applies across ' +
    'every formation, not one specific shape.',
);
y += 4;

y = drawHeading(doc, PAGE_MARGIN, y, 'Query parameters');
y = drawTable(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  [
    { label: 'Name', width: 90 },
    { label: 'Type', width: 60 },
    { label: 'Required', width: 70 },
    { label: 'Description', width: contentWidth - 220 },
  ],
  [['id', 'string', 'No', 'Tactic id to fetch, e.g. "possession". Empty string is a 400.']],
);

y = drawHeading(doc, PAGE_MARGIN, y, 'Example: one tactic by id');
y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `GET ${FRONTEND_BASE_URL}/v1/tactics?id=possession`,
  'Request',
  PAGE3_TITLE,
  PAGE3_SUBTITLE,
);
y = drawCodeBlockSafely(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  `HTTP 200 OK\n\n{\n  "success": true,\n  "count": 1,\n  "data": [\n    {\n      "id": "possession",\n      "name": "Possession",\n      "category": "offensive",\n      "description": "Short passing and support runs to keep the ball rather than break early.",\n      "formationId": null\n    }\n  ]\n}`,
  'Response',
  PAGE3_TITLE,
  PAGE3_SUBTITLE,
);

y = drawHeading(doc, PAGE_MARGIN, y, 'Tactic categories');
drawParagraph(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  'category is either "defensive" (5 styles: drop back, balanced, pressure on heavy ' +
    'touch, press after possession loss, constant pressure) or "offensive" (4 styles: ' +
    'possession, balanced, fast build up, long ball).',
);

/* ── Page 4: Errors & data dictionary ── */
y = newPage(doc, 'Errors & Data Dictionary', 'Shared across both endpoints');

y = drawHeading(doc, PAGE_MARGIN, y, 'Error responses');
y = drawTable(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  [
    { label: 'Status', width: 60 },
    { label: 'Cause', width: 160 },
    { label: 'Body', width: contentWidth - 220 },
  ],
  [
    ['400', '?id= present but empty', '{ statusCode, message, error: "Bad Request" }'],
    ['404', 'Unknown id', '{ statusCode, message, error: "Not Found" }'],
    ['500', 'Unhandled server error', "Nest's default internal error body"],
  ],
);

y = drawHeading(doc, PAGE_MARGIN, y, 'PublicFormation fields');
y = drawTable(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  [
    { label: 'Field', width: 90 },
    { label: 'Type', width: 80 },
    { label: 'Description', width: contentWidth - 170 },
  ],
  [
    ['id', 'string', 'Stable identifier, e.g. "4-3-3". Mirrors FORMATION_IDS.'],
    ['name', 'string', 'Display name.'],
    ['shape', 'string', 'The formation shape string, e.g. "4-3-3".'],
    ['description', 'string', 'One-line description of the formation.'],
  ],
);

y = drawHeading(doc, PAGE_MARGIN, y, 'PublicTactic fields');
drawTable(
  doc,
  PAGE_MARGIN,
  y,
  contentWidth,
  [
    { label: 'Field', width: 90 },
    { label: 'Type', width: 80 },
    { label: 'Description', width: contentWidth - 170 },
  ],
  [
    ['id', 'string', 'Stable identifier, e.g. "possession".'],
    ['name', 'string', 'Display name.'],
    ['category', '"defensive" | "offensive"', 'Which side of play the style applies to.'],
    ['description', 'string', "The style's trade-off, one line."],
    ['formationId', 'string | null', 'Always null — styles are formation-agnostic.'],
  ],
);

drawFooters(doc);

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, Buffer.from(doc.output('arraybuffer')));
console.log(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${doc.getNumberOfPages()} pages).`);
