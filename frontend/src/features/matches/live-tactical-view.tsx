import type { ComponentProps, ReactNode } from "react";
import type { OpponentSquadVisibility } from "@/features/matches/types";
import type {
  MatchLogEvent,
  MatchSquadAthlete,
  OpponentMatchPlayer,
} from "@/features/matches/types";
import { cn } from "@/lib/utils";
import {
  contrastText,
  markerStatsFor,
  opponentSurname,
  shirtNumberLabel,
  surnameOf,
  type MarkerStats,
} from "./live-match-model";

function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      fill="currentColor"
    >
      <circle cx="12" cy="12" r="10" fill="#f4f4f5" />
      <path
        d="M12 4.2 14.4 8l4.2.4-3.2 3.1.9 4.2L12 13.8 7.7 15.7l.9-4.2L5.4 8.4 9.6 8 12 4.2Z"
        fill="#18181b"
      />
    </svg>
  );
}

function MarkerOverlays({ stats }: { stats: MarkerStats }) {
  return (
    <div className="pointer-events-none absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-end gap-0.5">
      {stats.subMinute != null && (
        <span
          className={cn(
            "mb-0.5 flex items-center gap-0.5 rounded-full px-1 py-px text-[8px] font-bold leading-none",
            stats.subOut
              ? "bg-[#ff5b5f] text-white"
              : "bg-[#00d99a] text-[#07110f]",
          )}
        >
          <span aria-hidden="true">{stats.subOut ? "↓" : "↑"}</span>
          {stats.subMinute}&apos;
        </span>
      )}
      {Array.from({ length: Math.min(stats.goals, 3) }).map((_, index) => (
        <SoccerBallIcon key={`g-${index}`} className="size-3.5" />
      ))}
      {stats.assists > 0 && (
        <span className="rounded-sm bg-[#5b9fff] px-0.5 text-[8px] font-bold leading-4 text-white">
          A{stats.assists > 1 ? stats.assists : ""}
        </span>
      )}
      {stats.secondYellow ? (
        <span className="relative inline-block h-3.5 w-3">
          <span className="absolute left-0 top-0 h-3 w-[7px] rounded-[1px] bg-[#f5c518]" />
          <span className="absolute bottom-0 right-0 h-3 w-[7px] rounded-[1px] bg-[#ff5b5f]" />
        </span>
      ) : stats.red ? (
        <span className="inline-block h-3.5 w-2.5 rounded-[1px] bg-[#ff5b5f]" />
      ) : stats.yellow ? (
        <span className="inline-block h-3.5 w-2.5 rounded-[1px] bg-[#f5c518]" />
      ) : null}
    </div>
  );
}

function PlayerMarker({
  number,
  name,
  color,
  selected,
  stats,
  onClick,
}: {
  number: string;
  name: string;
  color: string;
  selected: boolean;
  stats: MarkerStats;
  onClick: () => void;
}) {
  const text = contrastText(color);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      <span className="relative">
        <MarkerOverlays stats={stats} />
        <span
          className={cn(
            "flex size-8 items-center justify-center rounded-md text-xs font-bold tabular-nums shadow-[0_2px_8px_rgba(0,0,0,0.45)] sm:size-9 sm:text-sm",
            selected && "ring-2 ring-white ring-offset-1 ring-offset-transparent",
          )}
          style={{ backgroundColor: color, color: text }}
        >
          {number}
        </span>
      </span>
      {name ? (
        <span className="mt-0.5 max-w-[4.5rem] truncate text-[10px] font-semibold uppercase tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {name}
        </span>
      ) : null}
    </button>
  );
}

function PositionedMarker({
  x,
  y,
  ...markerProps
}: ComponentProps<typeof PlayerMarker> & { x: number; y: number }) {
  return (
    <div className="absolute" style={{ left: `${x}%`, top: `${y}%` }}>
      <PlayerMarker {...markerProps} />
    </div>
  );
}

export function LivePitch({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("live-pitch relative w-full overflow-hidden rounded-xl", className)}>
      <div className="live-pitch-grass absolute inset-0" />
      <svg
        viewBox="0 0 150 100"
        className="absolute inset-0 size-full text-white/70"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect x="2" y="2" width="146" height="96" fill="none" stroke="currentColor" strokeWidth="0.45" />
        <line x1="75" y1="2" x2="75" y2="98" stroke="currentColor" strokeWidth="0.35" />
        <circle cx="75" cy="50" r="12" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <circle cx="75" cy="50" r="0.7" fill="currentColor" />
        <rect x="2" y="17" width="24" height="66" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <rect x="2" y="30" width="10" height="40" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <circle cx="18" cy="50" r="0.55" fill="currentColor" />
        <path d="M 26 37 A 12 12 0 0 1 26 63" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <rect x="-1.2" y="38" width="3.2" height="24" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <rect x="124" y="17" width="24" height="66" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <rect x="138" y="30" width="10" height="40" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <circle cx="132" cy="50" r="0.55" fill="currentColor" />
        <path d="M 124 37 A 12 12 0 0 0 124 63" fill="none" stroke="currentColor" strokeWidth="0.35" />
        <rect x="148" y="38" width="3.2" height="24" fill="none" stroke="currentColor" strokeWidth="0.35" />
      </svg>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

export function LivePitchPlayers({
  ownPlaced,
  oppPlaced,
  ownColor,
  oppColor,
  visibility,
  timeline,
  selectedKey,
  onSelectOwn,
  onSelectOpp,
}: {
  ownPlaced: Array<{ athlete: MatchSquadAthlete; x: number; y: number }>;
  oppPlaced: Array<{ player: OpponentMatchPlayer; x: number; y: number }>;
  ownColor: string;
  oppColor: string;
  visibility: OpponentSquadVisibility;
  timeline: MatchLogEvent[];
  selectedKey: string | null;
  onSelectOwn: (athlete: MatchSquadAthlete) => void;
  onSelectOpp: (player: OpponentMatchPlayer) => void;
}) {
  return (
    <>
      {ownPlaced.map((placed) => (
        <PositionedMarker
          key={placed.athlete.id}
          x={placed.x}
          y={placed.y}
          number={shirtNumberLabel(placed.athlete.squadNumber)}
          name={surnameOf(placed.athlete)}
          color={ownColor}
          selected={selectedKey === `own:${placed.athlete.id}`}
          stats={markerStatsFor(timeline, placed.athlete.id)}
          onClick={() => onSelectOwn(placed.athlete)}
        />
      ))}
      {visibility !== "none" &&
        oppPlaced.map((placed) => (
          <PositionedMarker
            key={placed.player.id}
            x={placed.x}
            y={placed.y}
            number={shirtNumberLabel(placed.player.shirtNumber)}
            name={opponentSurname(placed.player, visibility)}
            color={oppColor}
            selected={selectedKey === `opp:${placed.player.id}`}
            stats={markerStatsFor(timeline, undefined, placed.player.id)}
            onClick={() => onSelectOpp(placed.player)}
          />
        ))}
    </>
  );
}

function BenchPlayer({
  number,
  name,
  color,
  selected,
  stats,
  onClick,
}: {
  number: string;
  name: string;
  color: string;
  selected: boolean;
  stats: MarkerStats;
  onClick: () => void;
}) {
  const text = contrastText(color);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-[2.75rem] flex-col items-center focus-visible:outline-none"
    >
      <span className="relative">
        <MarkerOverlays stats={stats} />
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-[10px] font-bold tabular-nums",
            selected && "ring-2 ring-white",
          )}
          style={{ backgroundColor: color, color: text }}
        >
          {number}
        </span>
      </span>
      {name ? (
        <span className="mt-1 max-w-[3.2rem] truncate text-[8px] font-semibold uppercase tracking-wide text-[#c5ced6]">
          {name}
        </span>
      ) : null}
    </button>
  );
}

export function LiveBenchRow({
  label,
  color,
  athletes,
  opponents,
  visibility,
  timeline,
  selectedKey,
  onSelectOwn,
  onSelectOpp,
}: {
  label: string;
  color: string;
  athletes?: MatchSquadAthlete[];
  opponents?: OpponentMatchPlayer[];
  visibility?: OpponentSquadVisibility;
  timeline: MatchLogEvent[];
  selectedKey: string | null;
  onSelectOwn?: (athlete: MatchSquadAthlete) => void;
  onSelectOpp?: (player: OpponentMatchPlayer) => void;
}) {
  const empty = (athletes?.length ?? 0) === 0 && (opponents?.length ?? 0) === 0;
  return (
    <div className="flex items-center gap-3 overflow-x-auto py-0.5">
      <p className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8e9ba8]">
        {label}
      </p>
      <div className="flex items-end gap-3">
        {athletes?.map((athlete) => (
          <BenchPlayer
            key={athlete.id}
            number={shirtNumberLabel(athlete.squadNumber)}
            name={surnameOf(athlete)}
            color={color}
            selected={selectedKey === `own:${athlete.id}`}
            stats={markerStatsFor(timeline, athlete.id)}
            onClick={() => onSelectOwn?.(athlete)}
          />
        ))}
        {visibility && visibility !== "none"
          ? opponents?.map((player) => (
              <BenchPlayer
                key={player.id}
                number={shirtNumberLabel(player.shirtNumber)}
                name={opponentSurname(player, visibility)}
                color={color}
                selected={selectedKey === `opp:${player.id}`}
                stats={markerStatsFor(timeline, undefined, player.id)}
                onClick={() => onSelectOpp?.(player)}
              />
            ))
          : null}
        {empty && (
          <span className="text-[11px] text-[#5d6b76]">No substitutes</span>
        )}
      </div>
    </div>
  );
}
