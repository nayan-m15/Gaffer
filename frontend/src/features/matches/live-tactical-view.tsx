import {
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { OpponentSquadVisibility } from "@/features/matches/types";
import type {
  MatchLogEvent,
  MatchSquadAthlete,
  OpponentMatchPlayer,
} from "@/features/matches/types";
import { cn } from "@/lib/utils";
import {
  contrastText,
  markerBadgeSlots,
  markerStatsFor,
  opponentSurname,
  shirtNumberLabel,
  surnameOf,
  type MarkerBadgeKind,
  type MarkerStats,
  type PitchHalf,
} from "./live-match-model";
import { BootIcon, SoccerBallIcon } from "./match-icons";

const TOKEN_FACE =
  "live-squad-token relative flex size-12 items-center justify-center overflow-visible text-base font-bold tabular-nums shadow-[0_2px_8px_rgba(0,0,0,0.45)]";

function useTokenPress() {
  const [pressing, setPressing] = useState(false);
  const onPointerDown = () => {
    setPressing(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setPressing(true));
    });
  };
  const onAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    if (event.animationName === "live-token-press") {
      setPressing(false);
    }
  };
  return { pressing, onPointerDown, onAnimationEnd };
}

function SubArrowIcon({ incoming }: { incoming?: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
      {incoming ? (
        <>
          <path
            d="M4.6 2.6 8.4 6 4.6 9.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M8 6H2.8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <path
            d="M7.4 2.6 3.6 6l3.8 3.4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 6h5.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}

function CardGlyph({
  yellow,
  red,
  stacked,
}: {
  yellow: boolean;
  red: boolean;
  stacked: boolean;
}) {
  if (stacked) {
    return (
      <span className="relative inline-block h-3.5 w-3">
        <span className="absolute left-0 top-0 h-3 w-[7px] rounded-[1px] bg-[#f5c518] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
        <span className="absolute bottom-0 right-0 h-3 w-[7px] rounded-[1px] bg-[#ff5b5f] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]" />
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-2.5 rounded-[1px] shadow-[0_0_0_1px_rgba(0,0,0,0.35)]",
        red ? "bg-[#ff5b5f]" : yellow ? "bg-[#f5c518]" : "bg-[#f5c518]",
      )}
    />
  );
}

function BadgeCount({ value }: { value: number }) {
  if (value <= 1) {
    return null;
  }
  return (
    <span className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full bg-[#0c1218] text-[7px] font-bold leading-none text-white">
      {value}
    </span>
  );
}

function badgeAnchorStyle(kind: MarkerBadgeKind): CSSProperties {
  if (kind === "sub-out" || kind === "sub-in") {
    return { top: "-6px", left: "-6px" };
  }
  if (kind === "card") {
    return { top: "50%", left: "-7px", transform: "translateY(-50%)" };
  }
  if (kind === "assist") {
    return { bottom: "-6px", left: "-6px" };
  }
  return { bottom: "-6px", right: "-6px" };
}

function MarkerOverlays({ stats }: { stats: MarkerStats }) {
  const badges = markerBadgeSlots(stats);
  if (badges.length === 0) {
    return null;
  }
  return (
    <>
      {badges.map((badge) => {
        const isSubOut = badge.kind === "sub-out";
        const isSubIn = badge.kind === "sub-in";
        const badgeKey =
          badge.kind === "goal"
            ? `goal-${stats.goals}`
            : badge.kind === "assist"
              ? `assist-${stats.assists}`
              : badge.kind === "card"
                ? `card-${stats.secondYellow ? "2y" : stats.red ? "r" : "y"}`
                : isSubIn
                  ? `sub-in-${stats.subMinute ?? ""}`
                  : `sub-out-${stats.subMinute ?? ""}`;
        const subColor = isSubIn ? "text-[#00d99a]" : "text-[#ff5b5f]";
        return (
          <span
            key={badgeKey}
            data-marker-badge={badge.kind}
            className="pointer-events-none absolute z-10"
            style={badgeAnchorStyle(badge.kind)}
            aria-hidden="true"
          >
            <span className="live-marker-badge-enter flex items-center justify-center">
              {isSubOut || isSubIn ? (
                <span
                  className={cn(
                    "relative flex size-4 items-center justify-center rounded-full bg-[#141414] shadow-[0_1px_2px_rgba(0,0,0,0.55)] ring-1",
                    subColor,
                    isSubIn ? "ring-[#00d99a]/70" : "ring-[#ff5b5f]/70",
                  )}
                >
                  {stats.subMinute != null ? (
                    <span
                      className={cn(
                        "absolute bottom-full left-1/2 mb-px -translate-x-1/2 text-[8px] font-bold leading-none tabular-nums",
                        subColor,
                      )}
                    >
                      {stats.subMinute}&apos;
                    </span>
                  ) : null}
                  <SubArrowIcon incoming={isSubIn} />
                </span>
              ) : null}
              {badge.kind === "goal" ? (
                <span className="relative size-5 text-[#f4f4f5] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  <SoccerBallIcon className="size-5" />
                  <BadgeCount value={stats.goals} />
                </span>
              ) : null}
              {badge.kind === "assist" ? (
                <span className="relative flex size-5 items-center justify-center rounded-full bg-[#141414] text-[#e8ecef] shadow-[0_1px_2px_rgba(0,0,0,0.55)]">
                  <BootIcon className="size-5" />
                  <BadgeCount value={stats.assists} />
                </span>
              ) : null}
              {badge.kind === "card" ? (
                <CardGlyph
                  yellow={stats.yellow}
                  red={stats.red}
                  stacked={stats.secondYellow}
                />
              ) : null}
            </span>
          </span>
        );
      })}
    </>
  );
}

function SquadToken({
  number,
  color,
  selected,
  stats,
  rounded,
  pressing,
  onAnimationEnd,
}: {
  number: string;
  color: string;
  selected: boolean;
  stats: MarkerStats;
  rounded: "md" | "full";
  pressing?: boolean;
  onAnimationEnd?: (event: AnimationEvent<HTMLSpanElement>) => void;
}) {
  const text = contrastText(color);
  return (
    <span
      className={cn(
        TOKEN_FACE,
        rounded === "full" ? "rounded-full" : "rounded-md",
        selected && "live-token-selected",
        pressing && "live-token-press",
      )}
      style={
        {
          backgroundColor: color,
          color: text,
          "--token-color": color,
        } as CSSProperties
      }
      onAnimationEnd={onAnimationEnd}
    >
      {number}
      <MarkerOverlays stats={stats} />
    </span>
  );
}

function PlayerMarker({
  number,
  name,
  color,
  selected,
  stats,
  callToAction,
  callToActionTone = "warning",
  onClick,
}: {
  number: string;
  name: string;
  color: string;
  selected: boolean;
  stats: MarkerStats;
  callToAction?: boolean;
  callToActionTone?: "warning" | "positive" | "assist";
  onClick: () => void;
}) {
  const { pressing, onPointerDown, onAnimationEnd } = useTokenPress();
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={cn(
        "live-marker-hit relative flex -translate-x-1/2 -translate-y-1/2 flex-col items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        selected && "is-selected",
      )}
    >
      <span
        className={cn(
          "inline-flex rounded-md",
          callToAction && "live-token-call",
          callToAction && callToActionTone === "positive" && "live-token-call-positive",
          callToAction && callToActionTone === "assist" && "live-token-call-assist",
        )}
      >
        <SquadToken
          number={number}
          color={color}
          selected={selected}
          stats={stats}
          rounded="md"
          pressing={pressing}
          onAnimationEnd={onAnimationEnd}
        />
      </span>
      {name ? (
        <span className="live-player-name pointer-events-none absolute left-1/2 top-full mt-0.5 max-w-[4.75rem] -translate-x-1/2 truncate text-[10px] font-semibold uppercase leading-none tracking-wide text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {name}
        </span>
      ) : null}
    </button>
  );
}

function PositionedMarker({
  x,
  y,
  orientation = "horizontal",
  ...markerProps
}: ComponentProps<typeof PlayerMarker> & {
  x: number;
  y: number;
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <div
      className="absolute"
      style={
        orientation === "vertical"
          ? { left: `${y}%`, top: `${100 - x}%` }
          : { left: `${x}%`, top: `${y}%` }
      }
    >
      <PlayerMarker {...markerProps} />
    </div>
  );
}

export function LivePitch({
  children,
  className,
  layout = "full",
  ownHalf = "left",
  ownColor,
  oppColor,
  orientation = "horizontal",
}: {
  children: ReactNode;
  className?: string;
  layout?: "full" | "own";
  ownHalf?: PitchHalf;
  ownColor?: string;
  oppColor?: string;
  orientation?: "horizontal" | "vertical";
}) {
  const leftColor = ownHalf === "left" ? ownColor : oppColor;
  const rightColor = ownHalf === "left" ? oppColor : ownColor;
  const ownOnlyColor = ownColor;
  const panelRef = useRef<HTMLDivElement>(null);
  const [viewLength, setViewLength] = useState(150);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    const syncViewBox = () => {
      const { width, height } = panel.getBoundingClientRect();
      if (width < 1 || height < 1) {
        return;
      }
      setViewLength(
        orientation === "vertical"
          ? (height / width) * 100
          : (width / height) * 100,
      );
    };
    syncViewBox();
    const observer = new ResizeObserver(syncViewBox);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [orientation]);

  return (
    <div
      ref={panelRef}
      className={cn(
        "live-pitch-panel relative overflow-hidden rounded-xl",
        className,
      )}
    >
      <div className="live-pitch">
        <div
          className={cn(
            "live-pitch-grass absolute inset-0",
            orientation === "vertical" && "live-pitch-grass-vertical",
          )}
        />
        {layout === "full" && leftColor && rightColor ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                orientation === "vertical"
                  ? `linear-gradient(to top, color-mix(in oklab, ${leftColor} 18%, transparent) 0%, transparent 20%, transparent 80%, color-mix(in oklab, ${rightColor} 18%, transparent) 100%)`
                  : `linear-gradient(to right, color-mix(in oklab, ${leftColor} 18%, transparent) 0%, transparent 20%, transparent 80%, color-mix(in oklab, ${rightColor} 18%, transparent) 100%)`,
            }}
          />
        ) : null}
        {layout === "own" && ownOnlyColor ? (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${ownOnlyColor} 45%, transparent), inset ${ownHalf === "left" ? "28px" : "-28px"} 0 48px color-mix(in oklab, ${ownOnlyColor} 16%, transparent)`,
            }}
          />
        ) : null}
        <svg
          viewBox={
            orientation === "vertical"
              ? `0 0 100 ${viewLength}`
              : `0 0 ${viewLength} 100`
          }
          className="absolute inset-0 size-full text-white/70"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g
            transform={
              orientation === "vertical"
                ? `matrix(0 -1 1 0 0 ${viewLength})`
                : undefined
            }
          >
            {layout === "own" ? (
              <OwnHalfMarkings half={ownHalf} length={viewLength} />
            ) : (
              <FullPitchMarkings length={viewLength} />
            )}
          </g>
        </svg>
        <div className="absolute inset-0">{children}</div>
      </div>
    </div>
  );
}

function FullPitchMarkings({ length: L }: { length: number }) {
  const box = L * 0.16;
  const six = L * 0.067;
  const spot = L * 0.12;
  const d = 12;
  const mid = L / 2;
  return (
    <>
      <rect x="2" y="2" width={L - 4} height="96" fill="none" stroke="currentColor" strokeWidth="0.45" />
      <line x1={mid} y1="2" x2={mid} y2="98" stroke="currentColor" strokeWidth="0.35" />
      <circle cx={mid} cy="50" r={d} fill="none" stroke="currentColor" strokeWidth="0.35" />
      <circle cx={mid} cy="50" r="0.7" fill="currentColor" />
      <rect x="2" y="17" width={box} height="66" fill="none" stroke="currentColor" strokeWidth="0.35" />
      <rect x="2" y="30" width={six} height="40" fill="none" stroke="currentColor" strokeWidth="0.35" />
      <circle cx={spot} cy="50" r="0.55" fill="currentColor" />
      <path
        d={`M ${2 + box} 37 A ${d} ${d} 0 0 1 ${2 + box} 63`}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <rect x="-1.2" y="38" width="3.2" height="24" fill="none" stroke="currentColor" strokeWidth="0.35" />
      <rect x={L - 2 - box} y="17" width={box} height="66" fill="none" stroke="currentColor" strokeWidth="0.35" />
      <rect x={L - 2 - six} y="30" width={six} height="40" fill="none" stroke="currentColor" strokeWidth="0.35" />
      <circle cx={L - spot} cy="50" r="0.55" fill="currentColor" />
      <path
        d={`M ${L - 2 - box} 37 A ${d} ${d} 0 0 0 ${L - 2 - box} 63`}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.35"
      />
      <rect x={L - 2} y="38" width="3.2" height="24" fill="none" stroke="currentColor" strokeWidth="0.35" />
    </>
  );
}

function OwnHalfMarkings({
  half,
  length: L,
}: {
  half: PitchHalf;
  length: number;
}) {
  const box = L * 0.16;
  const six = L * 0.067;
  const spot = L * 0.12;
  const d = 12;
  if (half === "left") {
    return (
      <>
        <rect x="2" y="2" width={L - 4} height="96" fill="none" stroke="currentColor" strokeWidth="0.55" />
        <rect x="2" y="17" width={box} height="66" fill="none" stroke="currentColor" strokeWidth="0.4" />
        <rect x="2" y="30" width={six} height="40" fill="none" stroke="currentColor" strokeWidth="0.4" />
        <circle cx={spot} cy="50" r="0.65" fill="currentColor" />
        <path
          d={`M ${2 + box} 37 A ${d} ${d} 0 0 1 ${2 + box} 63`}
          fill="none"
          stroke="currentColor"
          strokeWidth="0.4"
        />
        <rect x="-1.2" y="38" width="3.2" height="24" fill="none" stroke="currentColor" strokeWidth="0.45" />
      </>
    );
  }
  return (
    <>
      <rect x="2" y="2" width={L - 4} height="96" fill="none" stroke="currentColor" strokeWidth="0.55" />
      <rect x={L - 2 - box} y="17" width={box} height="66" fill="none" stroke="currentColor" strokeWidth="0.4" />
      <rect x={L - 2 - six} y="30" width={six} height="40" fill="none" stroke="currentColor" strokeWidth="0.4" />
      <circle cx={L - spot} cy="50" r="0.65" fill="currentColor" />
      <path
        d={`M ${L - 2 - box} 37 A ${d} ${d} 0 0 0 ${L - 2 - box} 63`}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.4"
      />
      <rect x={L - 2} y="38" width="3.2" height="24" fill="none" stroke="currentColor" strokeWidth="0.45" />
    </>
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
  callToActionOwnIds,
  callToActionOppIds,
  callToActionTone = "positive",
  orientation = "horizontal",
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
  callToActionOwnIds?: Set<string>;
  callToActionOppIds?: Set<string>;
  callToActionTone?: "warning" | "positive" | "assist";
  orientation?: "horizontal" | "vertical";
}) {
  return (
    <>
      {ownPlaced.map((placed) => (
        <PositionedMarker
          key={placed.athlete.id}
          x={placed.x}
          y={placed.y}
          orientation={orientation}
          number={shirtNumberLabel(placed.athlete.squadNumber)}
          name={surnameOf(placed.athlete)}
          color={ownColor}
          selected={selectedKey === `own:${placed.athlete.id}`}
          stats={markerStatsFor(timeline, placed.athlete.id)}
          callToAction={callToActionOwnIds?.has(placed.athlete.id)}
          callToActionTone={callToActionTone}
          onClick={() => onSelectOwn(placed.athlete)}
        />
      ))}
      {visibility !== "none" &&
        oppPlaced.map((placed) => (
          <PositionedMarker
            key={placed.player.id}
            x={placed.x}
            y={placed.y}
            orientation={orientation}
            number={shirtNumberLabel(placed.player.shirtNumber)}
            name={opponentSurname(placed.player, visibility)}
            color={oppColor}
            selected={selectedKey === `opp:${placed.player.id}`}
            stats={markerStatsFor(timeline, undefined, placed.player.id)}
            callToAction={callToActionOppIds?.has(placed.player.id)}
            callToActionTone={callToActionTone}
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
  callToAction,
  onClick,
}: {
  number: string;
  name: string;
  color: string;
  selected: boolean;
  stats: MarkerStats;
  callToAction?: boolean;
  onClick: () => void;
}) {
  const { pressing, onPointerDown, onAnimationEnd } = useTokenPress();
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={onPointerDown}
      className={cn(
        "live-bench-player live-marker-hit flex min-w-16 flex-col items-center focus-visible:outline-none",
        selected && "is-selected",
      )}
    >
      <span
        className={cn(
          "inline-flex rounded-full",
          callToAction && "live-token-call",
        )}
      >
        <SquadToken
          number={number}
          color={color}
          selected={selected}
          stats={stats}
          rounded="full"
          pressing={pressing}
          onAnimationEnd={onAnimationEnd}
        />
      </span>
      {name ? (
        <span className="live-bench-name mt-1 max-w-[4.5rem] truncate text-[8px] font-semibold uppercase tracking-wide text-[#c5ced6]">
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
  align = "left",
  callToAction = false,
  orientation = "horizontal",
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
  align?: "left" | "right";
  callToAction?: boolean;
  orientation?: "horizontal" | "vertical";
}) {
  const empty = (athletes?.length ?? 0) === 0 && (opponents?.length ?? 0) === 0;
  return (
    <div
      className={cn(
        "live-bench-row flex min-w-0 items-center gap-3 py-0.5",
        orientation === "vertical"
          ? "h-full flex-col"
          : align === "right" && "flex-row-reverse",
      )}
    >
      <p
        className={cn(
          "live-bench-label shrink-0 text-[10px] font-bold uppercase tracking-[0.16em] text-[#8e9ba8]",
          orientation === "vertical" ? "w-full text-center" : "w-24",
          callToAction && "text-[#ffbe2e]",
        )}
      >
        {label}
      </p>
      <div
        className={cn(
          "live-bench-list flex min-w-0 items-end gap-3",
          orientation === "vertical"
            ? "min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 pb-3 pt-5"
            : "overflow-x-auto pb-3 pt-6",
          callToAction ? "px-2" : "px-1",
        )}
      >
        {athletes?.map((athlete) => (
          <BenchPlayer
            key={athlete.id}
            number={shirtNumberLabel(athlete.squadNumber)}
            name={surnameOf(athlete)}
            color={color}
            selected={selectedKey === `own:${athlete.id}`}
            stats={markerStatsFor(timeline, athlete.id)}
            callToAction={callToAction}
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
                callToAction={callToAction}
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
