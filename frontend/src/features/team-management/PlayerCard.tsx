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

function PlayerCardStatus({
  publicView,
  statusLabel,
  variant,
}: {
  publicView: boolean;
  statusLabel: string;
  variant: "pitch" | "sub";
}) {
  if (publicView) return null;
  if (variant === "pitch") {
    return <span className="player-card__status-dot" title={statusLabel} aria-hidden="true" />;
  }
  return (
    <span className="player-card__status">
      <i className="player-card__status-dot" aria-hidden="true" />
      {statusLabel}
    </span>
  );
}

export function PlayerCard({
  initials,
  name,
  position,
  squadNumber,
  status = "available",
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
  const group = positionGroup(position);
  const resolvedStatus = status ?? "available";
  const displayPosition = position.trim().toUpperCase() || "UN";
  const displayNumber = squadNumber ?? "—";
  const statusLabel = STATUS_LABELS[resolvedStatus];
  const accessibleLabel = `${name} — ${displayPosition}, number ${displayNumber}${
    publicView ? "" : ` · ${statusLabel}`
  }`;
  const family = name.trim().split(/\s+/).at(-1) ?? name;

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
          <PlayerCardStatus publicView={publicView} statusLabel={statusLabel} variant="pitch" />
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
        <PlayerCardStatus publicView={publicView} statusLabel={statusLabel} variant="sub" />
      </div>

      <div className="player-card__jersey">
        <span className="player-card__sub-number">{displayNumber}</span>
        <span className="player-card__sub-name">{name || initials}</span>
      </div>
    </article>
  );
}
