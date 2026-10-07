import { CalendarClock, CheckCircle2, Clock3, RefreshCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFixtureScheduleAlerts } from "./hooks";
import type { CompetitionFixtureScheduleAlert } from "./types";

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function alertPriority(alert: CompetitionFixtureScheduleAlert) {
  if (alert.state === "action_required") return 0;
  if (alert.state === "awaiting_response") return 1;
  return 2;
}

function alertCopy(alert: CompetitionFixtureScheduleAlert) {
  if (alert.state === "action_required") {
    return {
      title: `${alert.opponentName} proposed a new fixture date`,
      detail: "Your team needs to accept this date or propose another one.",
      tone: "amber" as const,
      action: "Review proposal",
      Icon: RefreshCcw,
    };
  }
  if (alert.state === "awaiting_response") {
    return {
      title: `Waiting for ${alert.opponentName}`,
      detail: "Your reschedule proposal is waiting for the other team to respond.",
      tone: "neutral" as const,
      action: "View fixture",
      Icon: Clock3,
    };
  }
  return {
    title: `New fixture date confirmed with ${alert.opponentName}`,
    detail: "Both teams have agreed to the rescheduled date.",
    tone: "green" as const,
    action: "View fixture",
    Icon: CheckCircle2,
  };
}

export function FixtureScheduleAlertsBanner({
  compact = false,
  showConfirmed = true,
}: {
  compact?: boolean;
  showConfirmed?: boolean;
}) {
  const alertsQuery = useFixtureScheduleAlerts();
  const alerts = [...(alertsQuery.data ?? [])]
    .filter((alert) => showConfirmed || alert.state !== "confirmed")
    .sort(
    (a, b) =>
      alertPriority(a) - alertPriority(b) ||
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  if (alerts.length === 0) return null;

  const actionCount = alerts.filter((alert) => alert.state === "action_required").length;
  const visible = compact ? alerts.slice(0, 3) : alerts;

  return (
    <section
      aria-label="Fixture reschedule notifications"
      className={cn(
        "rounded-xl border",
        actionCount > 0
          ? "border-amber-500/30 bg-amber-500/5"
          : "border-primary/25 bg-card",
        compact ? "px-3 py-3" : "p-4",
      )}
    >
      <div className="flex items-center gap-2">
        <CalendarClock
          className={cn("size-4", actionCount > 0 ? "text-amber-500" : "text-primary")}
          aria-hidden="true"
        />
        <h2
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.14em]",
            actionCount > 0 ? "text-amber-500" : "text-muted-foreground",
          )}
        >
          Fixture schedule updates{actionCount > 0 ? ` · ${actionCount} action required` : ""}
        </h2>
      </div>

      <ul className={cn("mt-3 space-y-2", compact && "max-h-52 overflow-y-auto [scrollbar-width:thin]")}> 
        {visible.map((alert) => {
          const copy = alertCopy(alert);
          const Icon = copy.Icon;
          return (
            <li
              key={alert.id}
              className={cn(
                "flex flex-col gap-3 rounded-lg border bg-background px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between",
                copy.tone === "amber" && "border-amber-500/25",
                copy.tone === "green" && "border-emerald-500/25 bg-emerald-500/[0.035]",
              )}
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    copy.tone === "amber"
                      ? "text-amber-500"
                      : copy.tone === "green"
                        ? "text-emerald-500"
                        : "text-muted-foreground",
                  )}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{copy.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {alert.competitionName} · {DATE_TIME.format(new Date(alert.scheduledAt))}
                  </p>
                  {!compact && <p className="mt-1 text-xs text-muted-foreground">{copy.detail}</p>}
                  {!compact && alert.proposalNote && (
                    <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                      “{alert.proposalNote}”
                    </p>
                  )}
                </div>
              </div>
              <Link
                to={`/competitions/${alert.competitionId}#fixture-${alert.fixtureId}`}
                className={cn(
                  buttonVariants({
                    size: "sm",
                    variant: alert.state === "action_required" ? "default" : "outline",
                  }),
                  "shrink-0",
                )}
              >
                {copy.action}
              </Link>
            </li>
          );
        })}
      </ul>
      {compact && alerts.length > visible.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          +{alerts.length - visible.length} more fixture {alerts.length - visible.length === 1 ? "update" : "updates"}
        </p>
      )}
    </section>
  );
}
