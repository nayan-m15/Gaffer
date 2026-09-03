import { Dumbbell, Trophy, Users, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { eventTypeLabel } from "./event-utils";
import type { EventType } from "./types";

export interface EventTypeStyle {
  icon: LucideIcon;
  /** Solid colour classes — swatches and leading dots. */
  swatch: string;
  /** Compact calendar pill classes. */
  pill: string;
  /** Text-only accent classes. */
  text: string;
}

/**
 * Event-type presentation. Colours come from the --event-* design tokens so
 * they follow the app theme (emerald/amber/blue in both light and dark mode);
 * type is never communicated by colour alone — icons and labels accompany it.
 */
export const EVENT_TYPE_STYLES: Record<EventType, EventTypeStyle> = {
  training: {
    icon: Dumbbell,
    swatch: "bg-event-training",
    pill: "bg-event-training/15 text-foreground hover:bg-event-training/25 border-l-2 border-event-training",
    text: "text-event-training",
  },
  match: {
    icon: Trophy,
    swatch: "bg-event-match",
    pill: "bg-event-match/15 text-foreground hover:bg-event-match/25 border-l-2 border-event-match",
    text: "text-event-match",
  },
  meeting: {
    icon: Users,
    swatch: "bg-event-meeting",
    pill: "bg-event-meeting/15 text-foreground hover:bg-event-meeting/25 border-l-2 border-event-meeting",
    text: "text-event-meeting",
  },
};

export function getEventTypeStyle(type: EventType): EventTypeStyle {
  return EVENT_TYPE_STYLES[type];
}

/** Accessible pill label: "09:00 · Training · Saturday session". */
export function pillAriaLabel(
  timeLabel: string,
  type: EventType,
  title: string,
): string {
  return `${timeLabel} ${eventTypeLabel(type)}: ${title}`;
}

/** Class helper combining pill classes with optional extras. */
export function pillClasses(type: EventType, extra?: string): string {
  return cn(getEventTypeStyle(type).pill, extra);
}
