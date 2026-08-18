import { StatusBadge } from "@/components/roster/StatusBadge";
import type { Athlete, RecentAppearance } from "@/components/roster/data";
import { cn } from "@/lib/utils";

interface AthleteDetailPanelProps {
  athlete: Athlete;
}

/**
 * AthleteDetailPanel — right-hand panel showing the selected athlete.
 *
 * Displays profile summary, quick info cards, season performance and recent
 * appearances using mock data only.
 */
export function AthleteDetailPanel({ athlete }: AthleteDetailPanelProps) {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto rounded-2xl border border-border bg-card p-6">
      {/* Profile header */}
      <div className="flex flex-col items-center text-center">
        <div className="relative mb-4">
          <div className="flex size-28 items-center justify-center rounded-full bg-gradient-to-br from-muted to-muted/50 ring-2 ring-brand/30 ring-offset-2 ring-offset-card">
            <span className="text-3xl font-bold text-foreground">
              {athlete.initials}
            </span>
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-7 items-center justify-center rounded-full bg-brand px-2 text-xs font-bold text-brand-foreground">
            #{athlete.jerseyNumber}
          </span>
        </div>

        <h2 className="text-xl font-bold text-foreground">{athlete.name}</h2>
        <p className="text-sm font-medium text-cyan-400">
          {athlete.positionLong} ({athlete.position})
        </p>
        <div className="mt-3">
          <StatusBadge status={athlete.status} />
        </div>
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
