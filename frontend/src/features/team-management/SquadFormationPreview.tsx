/**
 * Compact formation pitch for Confirm Squad. Vertical (attack at the top),
 * own team only — not the live-match tactical view, which is landscape and
 * wired to events, opponent markers, and click-to-log.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  DEFAULT_FORMATION_ID,
  FORMATIONS,
  getPositionRole,
} from "./formations";
import type {
  FormationPosition,
  PitchAssignments,
  PositionRole,
} from "./types";
import type { BackendAthlete } from "@/services/athletes";

const ROLE_MARKER: Record<
  PositionRole,
  { fill: string; glow: string }
> = {
  GK: { fill: "#38bdf8", glow: "rgba(56, 189, 248, 0.55)" },
  DEF: { fill: "#3b82f6", glow: "rgba(59, 130, 246, 0.55)" },
  MID: { fill: "#8b5cf6", glow: "rgba(139, 92, 246, 0.55)" },
  FWD: { fill: "#f97316", glow: "rgba(249, 115, 22, 0.55)" },
};

const ROW_Y_GAP = 10;
const LABEL_GAP_RATIO = 0.82;
const LABEL_WIDTH_MIN = 11;
const LABEL_WIDTH_MAX = 20;

interface SquadFormationPreviewProps {
  formationId: string;
  assignments: PitchAssignments;
  athletes: BackendAthlete[];
  className?: string;
}

interface ConnectorSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function SquadFormationPreview({
  formationId,
  assignments,
  athletes,
  className,
}: SquadFormationPreviewProps) {
  const formation =
    FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION_ID];
  const athleteById = useMemo(
    () => new Map(athletes.map((athlete) => [athlete.id, athlete])),
    [athletes],
  );
  const rows = useMemo(
    () => groupPositionsIntoRows(formation.positions),
    [formation],
  );
  const connectors = useMemo(() => connectorSegments(rows), [rows]);
  const widthBySlotId = useMemo(() => labelWidthBySlot(rows), [rows]);

  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Formation preview
      </p>
      <div
        className="squad-formation-pitch relative mt-3 aspect-[3/4] w-full overflow-hidden rounded-xl border border-primary/40"
        role="img"
        aria-label={`${formation.name} formation preview`}
      >
        <div className="squad-formation-pitch-stripes absolute inset-0" />
        <div className="squad-formation-pitch-vignette pointer-events-none absolute inset-0" />
        <SquadPitchMarkings />
        <span
          className="pointer-events-none absolute left-1/2 top-[46%] z-[1] -translate-x-1/2 -translate-y-1/2 font-display text-7xl font-semibold leading-none text-white/[0.07] sm:text-8xl"
          aria-hidden
        >
          G
        </span>
        <p className="pointer-events-none absolute left-1/2 top-2 z-[2] -translate-x-1/2 text-[10px] font-bold uppercase tracking-[0.22em] text-primary">
          Attacking ↑
        </p>
        <svg
          width="100%"
          height="100%"
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
          aria-hidden
        >
          {connectors.map((segment, index) => (
            <line
              key={`${segment.x1}-${segment.y1}-${segment.x2}-${segment.y2}-${index}`}
              x1={`${segment.x1}%`}
              y1={`${segment.y1}%`}
              x2={`${segment.x2}%`}
              y2={`${segment.y2}%`}
              stroke="var(--primary)"
              strokeWidth="1.75"
              strokeOpacity="0.45"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
        <div className="absolute inset-0 z-[3]">
          {formation.positions.map((slot) => {
            const athleteId = assignments[slot.id];
            const athlete = athleteId ? athleteById.get(athleteId) : undefined;
            const role =
              getPositionRole(athlete?.position) ?? slot.role;
            const marker = ROLE_MARKER[role];
            const labelsAbove = slot.y > 88;
            const widthPct = widthBySlotId.get(slot.id) ?? LABEL_WIDTH_MAX;
            const name = athlete ? markerSurname(athlete) : null;
            return (
              <div
                key={slot.id}
                className="absolute -translate-x-1/2"
                style={{
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  width: `${widthPct}%`,
                }}
              >
                <span className="absolute left-1/2 top-0 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center sm:size-14">
                  <span
                    className="absolute inset-0 rounded-full border border-primary/35"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      "relative z-[1] flex size-9 items-center justify-center rounded-full border-2 border-white text-xs font-bold tabular-nums text-white sm:size-11 sm:text-sm",
                      !athlete && "border-white/40 text-white/50",
                    )}
                    style={{
                      backgroundColor: athlete ? marker.fill : "transparent",
                      boxShadow: athlete
                        ? `0 0 10px ${marker.glow}`
                        : undefined,
                    }}
                  >
                    {athlete?.squadNumber ?? "—"}
                  </span>
                </span>
                <div
                  className={cn(
                    "absolute left-1/2 flex w-full -translate-x-1/2 flex-col items-center px-0.5 text-center",
                    labelsAbove
                      ? "bottom-[1.85rem]"
                      : "top-[1.85rem]",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase leading-none tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[11px]">
                    {slot.label}
                  </span>
                  {name ? (
                    <span className="mt-0.5 w-full truncate text-[10px] font-medium leading-tight text-white/85 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] sm:text-[11px]">
                      {name}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Updates as you edit the squad.
      </p>
    </div>
  );
}

export function SquadPitchMarkings() {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full text-white/25"
      preserveAspectRatio="none"
      aria-hidden
    >
      <rect
        x="1.8"
        y="1.8"
        width="96.4"
        height="96.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.45"
      />
      <line
        x1="1.8"
        y1="50"
        x2="98.2"
        y2="50"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <circle
        cx="50"
        cy="50"
        r="11"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <circle cx="50" cy="50" r="0.7" fill="currentColor" />
      <path
        d="M 1.8 5.2 A 3.4 3.4 0 0 0 5.2 1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <path
        d="M 94.8 1.8 A 3.4 3.4 0 0 0 98.2 5.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <path
        d="M 5.2 98.2 A 3.4 3.4 0 0 0 1.8 94.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <path
        d="M 98.2 94.8 A 3.4 3.4 0 0 0 94.8 98.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
    </svg>
  );
}

function markerSurname(athlete: BackendAthlete): string {
  const last = athlete.lastName.trim();
  const first = athlete.firstName.trim();
  if (!last) return first;

  const needsShort = last.length > 9 || last.includes("-");
  if (!needsShort) return last;

  const tail =
    last.split(/[\s-]+/).filter(Boolean).at(-1) ?? last;
  const initial = first.charAt(0).toUpperCase();
  return initial ? `${initial}. ${tail}` : tail;
}

function labelWidthBySlot(
  rows: FormationPosition[][],
): Map<string, number> {
  const widths = new Map<string, number>();
  for (const row of rows) {
    for (let i = 0; i < row.length; i += 1) {
      const slot = row[i];
      const leftGap = i > 0 ? slot.x - row[i - 1].x : slot.x * 2;
      const rightGap =
        i < row.length - 1 ? row[i + 1].x - slot.x : (100 - slot.x) * 2;
      const gap = Math.min(leftGap, rightGap);
      widths.set(
        slot.id,
        Math.max(
          LABEL_WIDTH_MIN,
          Math.min(gap * LABEL_GAP_RATIO, LABEL_WIDTH_MAX),
        ),
      );
    }
  }
  return widths;
}

function groupPositionsIntoRows(
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

function connectorSegments(rows: FormationPosition[][]): ConnectorSegment[] {
  const segments: ConnectorSegment[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (let i = 0; i < row.length - 1; i += 1) {
      addSegment(segments, seen, row[i], row[i + 1]);
    }
  }

  for (let r = 0; r < rows.length - 1; r += 1) {
    const back = rows[r];
    const front = rows[r + 1];
    for (const player of back) {
      const target = nearestInRow(player, front);
      if (target) addSegment(segments, seen, player, target);
    }
    for (const player of front) {
      const target = nearestInRow(player, back);
      if (target) addSegment(segments, seen, player, target);
    }
  }

  return segments;
}
