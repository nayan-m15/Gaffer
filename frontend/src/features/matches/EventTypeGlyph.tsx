import {
  ArrowLeftRight,
  ChevronsRight,
  HeartPulse,
  Target,
} from "lucide-react";
import type { MatchEventType } from "./types";
import { EVENT_COLOR } from "./event-visuals";
import { BootIcon, SoccerBallIcon } from "./match-icons";

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
        <span className="absolute left-0 top-0 h-3.5 w-2.5 rounded-[2px] bg-[#f5c518]" />
        <span className="absolute bottom-0 right-0 h-3.5 w-2.5 rounded-[2px] bg-[#ff5b5f]" />
      </span>
    );
  }

  if (eventType === "yellow_card") {
    return <CardGlyph color="#f5c518" />;
  }
  if (eventType === "red_card") {
    return <CardGlyph color="#ff5b5f" />;
  }

  const color = EVENT_COLOR[eventType];
  const icon =
    eventType === "goal" ? (
      <SoccerBallIcon className="size-4" />
    ) : eventType === "assist" ? (
      <BootIcon className="size-[18px]" />
    ) : eventType === "key_pass" ? (
      <ChevronsRight className="size-4" />
    ) : eventType === "substitution" ? (
      <ArrowLeftRight className="size-3.5" />
    ) : eventType === "penalty" ? (
      <Target className="size-3.5" />
    ) : eventType === "injury" ? (
      <HeartPulse className="size-3.5" />
    ) : null;

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
