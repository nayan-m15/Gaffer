import {
  ArrowLeftRight,
  ChevronsRight,
  HeartPulse,
  Target,
} from "lucide-react";
import type { MatchEventType } from "./types";
import { EVENT_COLOR } from "./event-visuals";
import { BootIcon, SoccerBallIcon } from "./match-icons";
import type { ReactNode } from "react";

function CardGlyph({ color }: { color: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 10,
        height: 14,
        borderRadius: 2,
        background: color,
      }}
    />
  );
}

function eventIcon(eventType: MatchEventType): ReactNode {
  switch (eventType) {
    case "goal":
      return <SoccerBallIcon className="size-4" />;
    case "assist":
      return <BootIcon className="size-[18px]" />;
    case "key_pass":
      return <ChevronsRight className="size-4" />;
    case "substitution":
      return <ArrowLeftRight className="size-3.5" />;
    case "penalty":
      return <Target className="size-3.5" />;
    case "injury":
      return <HeartPulse className="size-3.5" />;
    default:
      return null;
  }
}

export function EventTypeGlyph({
  eventType,
  secondYellow = false,
}: {
  eventType: MatchEventType;
  secondYellow?: boolean;
}) {
  if (secondYellow) {
    return (
      <span
        className="relative inline-block size-5 shrink-0"
        aria-label="Second yellow card"
      >
        <span className="absolute left-0 top-0 h-3.5 w-2.5 rounded-[2px] bg-[#d7ba55]" />
        <span className="absolute bottom-0 right-0 h-3.5 w-2.5 rounded-[2px] bg-[#e36a6d]" />
      </span>
    );
  }

  if (eventType === "yellow_card") return <CardGlyph color="#d7ba55" />;
  if (eventType === "red_card") return <CardGlyph color="#e36a6d" />;

  const color = EVENT_COLOR[eventType];
  const icon = eventIcon(eventType);

  return (
    <span
      className="inline-flex size-5 shrink-0 items-center justify-center"
      style={{ color }}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}
