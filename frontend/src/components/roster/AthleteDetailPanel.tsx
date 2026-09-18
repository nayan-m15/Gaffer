import { useEffect, useState } from "react";
import { Archive, ArrowLeft, BarChart3, Pencil, RotateCcw, UserPlus } from "lucide-react";
import { StatusBadge } from "@/components/roster/StatusBadge";
import type { Athlete, RecentAppearance } from "@/components/roster/data";
import { AthleteStatsPanel } from "@/features/statistics/AthleteStatsPanel";
import { useAthleteStatistics } from "@/features/statistics/hooks";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AthleteDetailPanelProps {
  athlete: Athlete;
  onEdit: (athlete: Athlete) => void;
  onArchive: (athlete: Athlete) => void;
  onRestore: (athlete: Athlete) => void;
  onInviteClaim?: (athlete: Athlete) => void;
  /** When true, hides the Edit / Archive / Restore / Invite buttons — used
   * for assistants, who can view the roster but not mutate it. */
  readOnly?: boolean;
}

/**
 * AthleteDetailPanel — right-hand panel showing the selected athlete.
 *
 * Displays profile summary, quick info cards, season performance and recent
 * appearances using mock data only.  Active athletes can be edited or archived;
 * archived athletes can be restored. "View Statistics" swaps this panel to the
 * shared AthleteStatsPanel (same query as the Statistics page).
 */
export function AthleteDetailPanel({
  athlete,
  onEdit,
  onArchive,
  onRestore,
  onInviteClaim,
  readOnly = false,
}: AthleteDetailPanelProps) {
  const [showingStats, setShowingStats] = useState(false);
  const statsQuery = useAthleteStatistics(showingStats ? athlete.id : null);

  useEffect(() => {
    setShowingStats(false);
  }, [athlete.id]);

  const showClaimInvite =
    !athlete.isArchived &&
    athlete.claimStatus === "Unclaimed" &&
    Boolean(onInviteClaim);

  if (showingStats) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowingStats(false)}
          className="w-fit gap-1.5"
        >
          <ArrowLeft className="size-4" />
          Back to Profile
        </Button>
        <div className="min-h-0 flex-1">
          <AthleteStatsPanel athleteId={athlete.id} query={statsQuery} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto rounded-2xl border border-border bg-card p-6">
      {/* Profile header */}
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div
            className={cn(
              "flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/50 ring-2 ring-offset-2 ring-offset-card",
              athlete.isArchived ? "ring-muted-foreground/30" : "ring-brand/30",
            )}
          >
            <span className="text-3xl font-bold text-foreground">
              {athlete.initials}
            </span>
          </div>
          <span
            className={cn(
              "absolute -bottom-1 -right-1 flex h-7 items-center justify-center rounded-full px-2 text-xs font-bold",
              athlete.isArchived ? "bg-muted-foreground text-background" : "bg-brand text-brand-foreground",
            )}
          >
            #{athlete.jerseyNumber}
          </span>
        </div>

        <h2 className="text-xl font-bold text-foreground">{athlete.name}</h2>
        <p className="text-sm font-medium text-cyan-400">
          {athlete.positionLong} ({athlete.position})
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <StatusBadge status={athlete.status} />
          {athlete.isArchived && (
            <span className="inline-flex items-center rounded-full border border-muted-foreground/30 bg-muted/50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Archived
            </span>
          )}
        </div>

        {/* Action buttons — mutation controls (Edit / Archive / Restore) are
            hidden for assistants via readOnly; the player claim invite stays
            available to every team member, mirroring the backend where the
            claim-invite routes are not coach-gated. */}
        {(!readOnly || showClaimInvite) && (
          <div className="mt-4 flex items-center gap-2">
            {!readOnly &&
              (athlete.isArchived ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onRestore(athlete)}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-4 text-brand" />
                  Restore
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onEdit(athlete)}
                    className="gap-1.5"
                  >
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onArchive(athlete)}
                    className="gap-1.5 border-amber-400/30 text-amber-400 hover:bg-amber-400/10 hover:text-amber-400"
                  >
                    <Archive className="size-4" />
                    Archive
                  </Button>
                </>
              ))}
            {showClaimInvite && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onInviteClaim?.(athlete)}
                className="gap-1.5"
              >
                <UserPlus className="size-4" />
                Invite
              </Button>
            )}
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowingStats(true)}
          className="mt-4 gap-1.5"
        >
          <BarChart3 className="size-4" />
          View Statistics
        </Button>
      </div>

      {/* Quick info cards */}
      <div className="grid grid-cols-3 gap-3">
        <InfoCard label="AGE" value={`${athlete.age} Years`} />
        <InfoCard label="JOINED" value={athlete.joinedDate} />
        <InfoCard
          label="FOOT"
          value={athlete.preferredFoot}
          valueClassName="text-brand"
        />
      </div>

      {/* Season performance */}
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Season Performance
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Goals" value={athlete.goals} valueClassName="text-brand" />
          <StatCard label="Assists" value={athlete.assists} valueClassName="text-brand" />
          <StatCard
            label="Yellow Cards"
            value={athlete.yellowCards}
            valueClassName="text-amber-400"
          />
          <StatCard
            label="Red Cards"
            value={athlete.redCards}
            valueClassName="text-red-400"
          />
        </div>
      </section>

      {/* Recent appearances */}
      <section className="flex-1">
        <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Recent Logged Appearances
        </h3>
        <div className="flex flex-col gap-2.5">
          {athlete.recentAppearances.map((appearance, index) => (
            <AppearanceRow key={`${appearance.opponent}-${index}`} appearance={appearance} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ── Private sub-components ─────────────────────────────────────────────── */

interface InfoCardProps {
  label: string;
  value: string;
  valueClassName?: string;
}

function InfoCard({ label, value, valueClassName }: InfoCardProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-sm font-bold text-foreground", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  valueClassName?: string;
}

function StatCard({ label, value, valueClassName }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", valueClassName)}>
        {value}
      </p>
    </div>
  );
}

interface AppearanceRowProps {
  appearance: RecentAppearance;
}

function AppearanceRow({ appearance }: AppearanceRowProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-background p-3">
      <div>
        <p className="text-sm font-semibold text-foreground">
          vs. {appearance.opponent}
        </p>
        <p className="text-xs text-brand">{appearance.contribution}</p>
      </div>
      <span className="text-sm font-bold tabular-nums text-muted-foreground">
        {appearance.minutes}&apos;
      </span>
    </div>
  );
}
