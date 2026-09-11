import type { FormationPosition } from "./types";

const ROW_Y_GAP = 10;
/** Max |Δx| (pitch %) to draw a line to a player in the adjacent row. */
export const CONNECTOR_MAX_DX = 40;

export interface ConnectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function groupPositionsIntoRows(
  positions: FormationPosition[],
): FormationPosition[][] {
  const sorted = [...positions].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: FormationPosition[][] = [];

  for (const pos of sorted) {
    const current = rows[rows.length - 1];
    if (!current) {
      rows.push([pos]);
      continue;
    }
    const rowY =
      current.reduce((sum, item) => sum + item.y, 0) / current.length;
    if (Math.abs(pos.y - rowY) > ROW_Y_GAP) {
      rows.push([pos]);
    } else {
      current.push(pos);
    }
  }

  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
  }

  return rows;
}

function nearestInRow(
  point: FormationPosition,
  row: FormationPosition[],
): FormationPosition | undefined {
  let nearest = row[0];
  let best = Number.POSITIVE_INFINITY;
  for (const other of row) {
    const d = (point.x - other.x) ** 2 + (point.y - other.y) ** 2;
    if (d < best) {
      best = d;
      nearest = other;
    }
  }
  return nearest;
}

function segmentKey(a: FormationPosition, b: FormationPosition): string {
  if (a.x < b.x || (a.x === b.x && a.y <= b.y)) {
    return `${a.x},${a.y}|${b.x},${b.y}`;
  }
  return `${b.x},${b.y}|${a.x},${a.y}`;
}

function addSegment(
  segments: ConnectorSegment[],
  seen: Set<string>,
  a: FormationPosition,
  b: FormationPosition,
) {
  const key = segmentKey(a, b);
  if (seen.has(key)) return;
  seen.add(key);
  segments.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
}

function connectAdjacentRows(
  segments: ConnectorSegment[],
  seen: Set<string>,
  back: FormationPosition[],
  front: FormationPosition[],
) {
  for (const player of back) {
    for (const other of front) {
      if (Math.abs(player.x - other.x) <= CONNECTOR_MAX_DX) {
        addSegment(segments, seen, player, other);
      }
    }
    const nearest = nearestInRow(player, front);
    if (nearest) {
      addSegment(segments, seen, player, nearest);
    }
  }
  for (const player of front) {
    const nearest = nearestInRow(player, back);
    if (nearest) {
      addSegment(segments, seen, player, nearest);
    }
  }
}

export function connectorSegments(
  rows: FormationPosition[][],
): ConnectorSegment[] {
  const segments: ConnectorSegment[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i += 1) {
      addSegment(segments, seen, row[i], row[i + 1]);
    }
  }

  for (let r = 0; r < rows.length - 1; r += 1) {
    connectAdjacentRows(segments, seen, rows[r], rows[r + 1]);
  }

  return segments;
}

export function hasSegmentBetween(
  segments: ConnectorSegment[],
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return segments.some(
    (segment) =>
      (segment.x1 === a.x &&
        segment.y1 === a.y &&
        segment.x2 === b.x &&
        segment.y2 === b.y) ||
      (segment.x1 === b.x &&
        segment.y1 === b.y &&
        segment.x2 === a.x &&
        segment.y2 === a.y),
  );
}
