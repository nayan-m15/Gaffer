import { useId } from "react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, type AthleteStatusValue } from "@/services/athletes";
import "./PlayerCard.css";

type PositionGroup = "gk" | "def" | "mid" | "fwd";

const POSITION_GROUPS: Record<PositionGroup, readonly string[]> = {
  gk: ["GK"],
  def: ["CB", "LB", "RB", "LWB", "RWB", "SW", "DEF"],
  mid: ["CDM", "DM", "CM", "CAM", "AM", "LM", "RM", "MID", "UN"],
  fwd: ["LW", "RW", "ST", "CF", "SS", "FW", "ATT"],
};

function positionGroup(position: string): PositionGroup {
  const code = position.trim().toUpperCase();
  return (
    (Object.keys(POSITION_GROUPS) as PositionGroup[]).find((group) =>
      POSITION_GROUPS[group].includes(code),
    ) ?? "mid"
  );
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    given: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
    family: (parts.at(-1) ?? name).toUpperCase(),
  };
}

function Nameset({ text, pathId }: { text: string; pathId: string }) {
  const size =
    text.length <= 7 ? 36 : text.length <= 9 ? 33 : text.length <= 12 ? 29 : 25;

  return (
    <svg
      className="player-card__nameset"
      viewBox="0 0 240 60"
      role="img"
      aria-label={text}
    >
      <defs>
        <path id={pathId} d="M14 52 Q120 4 226 52" fill="none" />
      </defs>
      <text fontSize={size} letterSpacing="1.5">
        <textPath
          href={`#${pathId}`}
          startOffset="50%"
          textAnchor="middle"
          textLength="198"
          lengthAdjust="spacingAndGlyphs"
        >
          {text}
        </textPath>
      </text>
    </svg>
  );
}

function Stat({
  value,
  label,
  card,
}: {
  value: number;
  label: string;
  card?: "yellow" | "red";
}) {
  return (
    <span
      className={cn(
        "player-card__stat",
        value === 0 && "player-card__stat--zero",
      )}
    >
      <span className="player-card__stat-value">
        {card && (
          <i
            className={`player-card__booking player-card__booking--${card}`}
            aria-hidden="true"
          />
        )}
        {value}
      </span>
      <span className="player-card__stat-label">{label}</span>
    </span>
  );
}

interface PlayerCardProps {
  initials: string;
  name: string;
  position: string;
  squadNumber: number | null;
  status?: AthleteStatusValue | null;
  appearances?: number;
  goals?: number;
  assists?: number;
  yellowCards?: number;
  redCards?: number;
  minutesPlayed?: number;
  preferredFoot?: "left" | "right" | "both";
  variant: "pitch" | "sub";
  isDragging?: boolean;
  isDropTarget?: boolean;
  isInvalid?: boolean;
  readOnly?: boolean;
  publicView?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
  onPointerMove?: React.PointerEventHandler<HTMLElement>;
  onPointerUp?: React.PointerEventHandler<HTMLElement>;
  onPointerCancel?: React.PointerEventHandler<HTMLElement>;
  className?: string;
}

export function PlayerCard({
  initials,
  name,
  position,
  squadNumber,
  status = "available",
  appearances = 0,
  goals = 0,
  assists = 0,
  yellowCards = 0,
  redCards = 0,
  minutesPlayed = 0,
  preferredFoot = "right",
  variant,
  isDragging = false,
  isDropTarget = false,
  isInvalid = false,
  readOnly = false,
  publicView = false,
  onDragStart,
  onDragEnd,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  className,
}: PlayerCardProps) {
  const pathId = `player-card-arc-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const group = positionGroup(position);
  const resolvedStatus = status ?? "available";
  const displayPosition = position.trim().toUpperCase() || "UN";
  const displayNumber = squadNumber ?? "—";
  const statusLabel = STATUS_LABELS[resolvedStatus];
  const accessibleLabel = `${name} — ${displayPosition}, number ${displayNumber}${
    publicView ? "" : ` · ${statusLabel}`
  }`;
  const { given, family } = splitName(name);

  if (variant === "pitch") {
    return (
      <div
        draggable={!readOnly}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className={cn(
          "player-card player-card--pitch",
          !readOnly && "player-card--draggable",
          isDragging && "player-card--dragging",
          isDropTarget && !isInvalid && "player-card--drop-target",
          isInvalid && "player-card--invalid",
          className,
        )}
        data-group={group}
        data-status={resolvedStatus}
        role={readOnly ? undefined : "button"}
        aria-label={accessibleLabel}
        tabIndex={readOnly ? undefined : 0}
      >
        <span className="player-card__pitch-topline">
          <span className="player-card__position">{displayPosition}</span>
          {!publicView && (
            <span
              className="player-card__status-dot"
              title={statusLabel}
              aria-hidden="true"
            />
          )}
        </span>
        <span className="player-card__pitch-number">{displayNumber}</span>
        <span className="player-card__pitch-name">{family || initials}</span>
      </div>
    );
  }

  return (
    <article
      draggable={!readOnly}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={cn(
        "player-card player-card--sub",
        !readOnly && "player-card--draggable",
        isDragging && "player-card--dragging",
        isDropTarget && !isInvalid && "player-card--drop-target",
        isInvalid && "player-card--invalid",
        className,
      )}
      data-group={group}
      data-status={resolvedStatus}
      role={readOnly ? undefined : "button"}
      aria-label={accessibleLabel}
      tabIndex={readOnly ? undefined : 0}
    >
      <div className="player-card__top">
        <span className="player-card__position">{displayPosition}</span>
        {!publicView && (
          <span className="player-card__status">
            <i className="player-card__status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
        )}
      </div>

      <div className="player-card__jersey">
        {given && <p className="player-card__given-name">{given}</p>}
        <Nameset text={family || initials} pathId={pathId} />
        <p className="player-card__number">{displayNumber}</p>
      </div>

      <div className="player-card__stats">
        <Stat value={appearances} label="Apps" />
        <Stat value={goals} label="Goals" />
        <Stat value={assists} label="Assists" />
        <Stat value={yellowCards} label="Yellows" card="yellow" />
        <Stat value={redCards} label="Reds" card="red" />
        {publicView ? (
          <Stat value={minutesPlayed} label="Minutes" />
        ) : (
          <span className="player-card__stat">
            <span className="player-card__stat-value player-card__foot">
              <span
                className={
                  preferredFoot !== "right"
                    ? "player-card__foot--on"
                    : undefined
                }
              >
                L
              </span>
              <span
                className={
                  preferredFoot !== "left" ? "player-card__foot--on" : undefined
                }
              >
                R
              </span>
            </span>
            <span className="player-card__stat-label">Foot</span>
          </span>
        )}
      </div>
    </article>
  );
}
