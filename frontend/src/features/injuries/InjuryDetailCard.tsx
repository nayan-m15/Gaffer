import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock,
  Dumbbell,
  Repeat,
  Stethoscope,
} from "lucide-react";
import { AppCard } from "@/components/app/AppCard";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SEVERITY_GRADES, SEVERITY_LABELS, injuryTitle } from "./body-regions";
import {
  INJURY_STATUS_LABELS,
  SEVERITY_TONES,
  daysUntilProjectedReturn,
  formatDate,
  recoveryProgress,
  returnWindowLabel,
  varianceLabel,
} from "./injury-model";
import type { InjuryDetail, InjuryListItem } from "./types";

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof CalendarDays;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/60 text-muted-foreground"
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-foreground">
          {children}
        </p>
      </div>
    </div>
  );
}

interface InjuryDetailCardProps {
  injury: InjuryDetail | InjuryListItem;
  today: string;
  /** Omitted (or the injury already closed) hides the action entirely. */
  onMarkReturned?: () => void;
  className?: string;
}

/**
 * The diagnosis panel: what the injury is, when it happened, and when the
 * athlete is expected back.
 *
 * The return window is always shown as the range it is, never a single
 * date — a guidance range presented as one figure invites a promise the
 * estimate cannot keep.
 */
export function InjuryDetailCard({
  injury,
  today,
  onMarkReturned,
  className,
}: InjuryDetailCardProps) {
  const progress = recoveryProgress(injury, today);
  const remaining = daysUntilProjectedReturn(injury, today);
  const isRecurrence = "isRecurrence" in injury && injury.isRecurrence;

  return (
    <AppCard className={cn("space-y-5", className)}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[11px] font-semibold",
                SEVERITY_TONES[injury.severity],
              )}
            >
              {SEVERITY_LABELS[injury.severity]}
            </span>
            <span className="rounded-md border border-border/60 bg-card/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {SEVERITY_GRADES[injury.severity]}
            </span>
            {isRecurrence && (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                <Repeat className="size-3" aria-hidden="true" />
                Recurrence
              </span>
            )}
            {!injury.isOpen && (
              <span className="rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                Returned
              </span>
            )}
          </div>
          {injury.isOpen && onMarkReturned && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onMarkReturned}
            >
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Mark as returned
            </Button>
          )}
        </div>

        <div>
          <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-foreground">
            {injuryTitle(injury)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {injury.athleteFirstName} {injury.athleteLastName}
            {injury.athleteSquadNumber != null &&
              ` · #${injury.athleteSquadNumber}`}
            {injury.athletePosition && ` · ${injury.athletePosition}`}
          </p>
        </div>

        {injury.description && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {injury.description}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field icon={CalendarDays} label="Date of injury">
          {formatDate(injury.occurredOn)}
          {injury.context === "match" && injury.minute != null && (
            <span className="text-muted-foreground">
              {" "}
              &middot; {injury.minute}&apos;
            </span>
          )}
        </Field>
        <Field icon={Stethoscope} label="Diagnosed by">
          {injury.diagnosedBy ?? "Not recorded"}
        </Field>
        <Field icon={Clock} label={injury.isOpen ? "Estimated return" : "Returned"}>
          {injury.actualReturnOn
            ? formatDate(injury.actualReturnOn)
            : returnWindowLabel(
                injury.estimatedReturnMinDays,
                injury.estimatedReturnMaxDays,
              )}
        </Field>
        <Field icon={Activity} label="Rehab status">
          <span
            className={cn(
              injury.isOpen ? "text-primary" : "text-emerald-400",
            )}
          >
            {INJURY_STATUS_LABELS[injury.status]}
          </span>
        </Field>
      </div>

      {/* Progress against the projection. A closed record shows how the
          actual return compared with it instead. */}
      <div className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {injury.isOpen ? "Progress against projection" : "Outcome"}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {injury.isOpen
              ? remaining !== null && remaining >= 0
                ? `${remaining} day${remaining === 1 ? "" : "s"} to projected return`
                : "Past the projected window"
              : `${injury.daysOut} days out · ${varianceLabel(
                  injury.returnVarianceDays,
                )}`}
          </p>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-border/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          aria-label="Recovery progress against the projected window"
        >
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none",
              injury.isOpen ? "bg-primary" : "bg-emerald-500",
            )}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{formatDate(injury.occurredOn)}</span>
          <span>
            {injury.isOpen
              ? `${formatDate(injury.estimatedReturnFrom)} – ${formatDate(
                  injury.estimatedReturnTo,
                )}`
              : formatDate(injury.actualReturnOn ?? injury.estimatedReturnTo)}
          </span>
        </div>
        {injury.isOpen && (
          <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <Dumbbell className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
            Return windows are conventional recovery ranges for planning, not
            medical advice. Confirm every return with your physio.
          </p>
        )}
      </div>

      {injury.notes && (
        <div className="rounded-xl border border-border/60 bg-card/50 p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Notes
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">
            {injury.notes}
          </p>
        </div>
      )}
    </AppCard>
  );
}
