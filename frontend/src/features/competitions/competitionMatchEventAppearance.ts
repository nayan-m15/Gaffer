import type { ComponentType } from "react";
import {
  Activity, ArrowLeftRight, CircleHelp, Cross, Goal, Hand, Link2,
  ShieldAlert, Target, Zap,
} from "lucide-react";

type EventIcon = ComponentType<{ className?: string; strokeWidth?: number }>;
type EventAppearance = { label: string; icon: EventIcon; text: string; background: string; border: string; card?: "yellow" | "red" };

const appearances: Record<string, EventAppearance> = {
  goal: { label: "Goal", icon: Goal, text: "text-emerald-600 dark:text-emerald-300", background: "bg-emerald-500/10", border: "border-emerald-500/25" },
  assist: { label: "Assist", icon: Link2, text: "text-teal-600 dark:text-teal-300", background: "bg-teal-500/10", border: "border-teal-500/25" },
  key_pass: { label: "Key pass", icon: Zap, text: "text-blue-600 dark:text-blue-300", background: "bg-blue-500/10", border: "border-blue-500/25" },
  yellow_card: { label: "Yellow card", icon: ShieldAlert, text: "text-amber-700 dark:text-amber-300", background: "bg-amber-500/10", border: "border-amber-500/25", card: "yellow" },
  red_card: { label: "Red card", icon: ShieldAlert, text: "text-red-600 dark:text-red-300", background: "bg-red-500/10", border: "border-red-500/25", card: "red" },
  substitution: { label: "Substitution", icon: ArrowLeftRight, text: "text-violet-600 dark:text-violet-300", background: "bg-violet-500/10", border: "border-violet-500/25" },
  goalkeeper_save: { label: "Goalkeeper save", icon: Hand, text: "text-cyan-700 dark:text-cyan-300", background: "bg-cyan-500/10", border: "border-cyan-500/25" },
  penalty: { label: "Penalty", icon: Target, text: "text-sky-700 dark:text-sky-300", background: "bg-sky-500/10", border: "border-sky-500/25" },
  injury: { label: "Injury", icon: Cross, text: "text-orange-700 dark:text-orange-300", background: "bg-orange-500/10", border: "border-orange-500/25" },
  own_goal: { label: "Own goal", icon: Goal, text: "text-amber-700 dark:text-amber-300", background: "bg-amber-500/10", border: "border-amber-500/25" },
  tactical_change: { label: "Tactical change", icon: Activity, text: "text-muted-foreground", background: "bg-muted", border: "border-border" },
};

const fallback: EventAppearance = { label: "Match event", icon: CircleHelp, text: "text-muted-foreground", background: "bg-muted", border: "border-border" };

export function getCompetitionMatchEventAppearance(type: string): EventAppearance {
  return appearances[type] ?? { ...fallback, label: type.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase()) };
}

