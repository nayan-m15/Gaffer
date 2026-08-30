import type { MatchEventType } from "./types";
import { EVENT_COLOR } from "./event-visuals";

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
  const symbol =
    eventType === "goal"
      ? "●"
      : eventType === "key_pass"
        ? "»"
        : eventType === "substitution"
          ? "⇄"
          : eventType === "penalty"
            ? "P"
            : eventType === "injury"
              ? "+"
              : eventType === "assist"
                ? "A"
                : "•";

  return (
    <span
      className="inline-flex size-5 shrink-0 items-center justify-center font-oswald text-[11px] leading-none"
      style={{ color }}
      aria-hidden="true"
    >
      {symbol}
    </span>
  );
}
