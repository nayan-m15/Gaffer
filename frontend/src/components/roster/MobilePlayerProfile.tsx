import { useMemo, useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import { Archive, BarChart3, Pencil, RotateCcw, UserPlus } from "lucide-react";
import type { Athlete } from "@/components/roster/data";
import { getPositionLabel } from "@/components/roster/position";
import { StatusBadge } from "@/components/roster/StatusBadge";
import { Button } from "@/components/ui/button";
import { useAthleteStatistics } from "@/features/statistics/hooks";
import type { AthleteMatchBreakdown } from "@/features/statistics/types";
import { cn } from "@/lib/utils";

type ProfileTab = "stats" | "form";

const COMPACT_MATCH_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
});

interface MobilePlayerProfileProps {
  athlete: Athlete;
  onEdit: (athlete: Athlete) => void;
  onArchive: (athlete: Athlete) => void;
  onRestore: (athlete: Athlete) => void;
  onInviteClaim?: (athlete: Athlete) => void;
  showClaimStatus?: boolean;
  readOnly?: boolean;
}

export function MobilePlayerProfile({
  athlete,
  onEdit,
  onArchive,
  onRestore,
  onInviteClaim,
  showClaimStatus = false,
  readOnly = false,
}: MobilePlayerProfileProps) {
  const [tab, setTab] = useState<ProfileTab>("stats");
  const statsQuery = useAthleteStatistics(athlete.id);
  const showClaimInvite =
    !athlete.isArchived && athlete.claimStatus === "Unclaimed" && Boolean(onInviteClaim);
  const hasNumber = athlete.jerseyNumber > 0;

  return (
    <div className="min-w-0 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <header className="flex flex-col items-center px-4 pb-6 pt-5 text-center">
        <div className="relative mb-3">
          <div
            className={cn(
              "flex size-24 items-center justify-center rounded-2xl border bg-surface-nested text-2xl font-bold text-foreground shadow-sm",
              athlete.isArchived ? "border-border-default" : "border-brand/35",
            )}
            role="img"
            aria-label={`${athlete.name} avatar`}
          >
            {athlete.initials}
          </div>
          {hasNumber && (
            <span className="absolute -bottom-2 -right-2 flex min-h-8 min-w-8 items-center justify-center rounded-full bg-brand px-2 text-xs font-bold text-brand-foreground ring-4 ring-background">
              #{athlete.jerseyNumber}
            </span>
          )}
        </div>
        <h1 className="max-w-full truncate text-xl font-bold text-foreground">{athlete.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {hasNumber ? `#${athlete.jerseyNumber} · ` : ""}
          {getPositionLabel(athlete.position)}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <StatusBadge status={athlete.status} />
          {showClaimStatus && <StatusBadge status={athlete.claimStatus} />}
          {athlete.isArchived && (
            <span className="rounded-full border border-border-default bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
              Archived
            </span>
          )}
        </div>
        <dl className="mt-5 grid w-full max-w-sm grid-cols-2 gap-2">
          {athlete.age > 0 && <ProfileFact label="Age" value={`${athlete.age} years`} />}
          {athlete.joinedDate && <ProfileFact label="Joined" value={athlete.joinedDate} />}
        </dl>
      </header>

      <Tabs.Root value={tab} onValueChange={(value) => setTab(value as ProfileTab)}>
        <Tabs.List
          className="sticky top-0 z-10 grid grid-cols-2 border-y border-border-subtle bg-background/95 px-3 backdrop-blur"
          aria-label="Player profile sections"
        >
          <ProfileTabTrigger value="stats">Stats</ProfileTabTrigger>
          <ProfileTabTrigger value="form">Recent Form</ProfileTabTrigger>
        </Tabs.List>

        <Tabs.Content value="stats" className="outline-none">
          <StatsTab query={statsQuery} />
        </Tabs.Content>
        <Tabs.Content value="form" className="outline-none">
          <RecentFormTab query={statsQuery} />
        </Tabs.Content>
      </Tabs.Root>

      <section className="mx-3 mt-2 border-t border-border-subtle pt-5">
        <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Player Actions
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {!readOnly &&
            (athlete.isArchived ? (
              <Button type="button" variant="outline" onClick={() => onRestore(athlete)} className="col-span-2 min-h-11 gap-2">
                <RotateCcw className="size-4 text-brand" /> Restore Player
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => onEdit(athlete)} className={cn("min-h-11 gap-2", !showClaimInvite && "col-span-2")}>
                <Pencil className="size-4" /> Edit Player
              </Button>
            ))}
          {showClaimInvite && (
            <Button type="button" variant="outline" onClick={() => onInviteClaim?.(athlete)} className={cn("min-h-11 gap-2", readOnly && "col-span-2")}>
              <UserPlus className="size-4" /> Invite
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => setTab("stats")} className="col-span-2 min-h-11 gap-2">
            <BarChart3 className="size-4" /> View Statistics
          </Button>
          {!readOnly && !athlete.isArchived && (
            <Button type="button" variant="outline" onClick={() => onArchive(athlete)} className="col-span-2 min-h-11 gap-2 border-danger/40 text-danger hover:bg-danger/10 hover:text-danger">
              <Archive className="size-4" /> Archive Player
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}

function ProfileFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface-nested px-3 py-2.5 text-center">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-bold text-foreground">{value}</dd>
    </div>
  );
}

function ProfileTabTrigger({ value, children }: { value: ProfileTab; children: string }) {
  return (
    <Tabs.Trigger
      value={value}
      className="relative min-h-12 px-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=active]:text-brand after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:origin-center after:scale-x-0 after:rounded-full after:bg-brand after:transition-transform data-[state=active]:after:scale-x-100"
    >
      {children}
    </Tabs.Trigger>
  );
}

type StatsQuery = ReturnType<typeof useAthleteStatistics>;

function StatsTab({ query }: { query: StatsQuery }) {
  if (query.isLoading) return <ProfileLoading />;
  if (query.isError || !query.data) return <ProfileError />;

  const stats = query.data;
  return (
    <section className="px-3 py-5">
      <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        Season Performance
      </h2>
      <div className="grid grid-cols-6 overflow-hidden rounded-xl border border-border-subtle bg-surface-nested">
        <MobileStat className="col-span-2" label="Apps" value={stats.appearances} />
        <MobileStat className="col-span-2" label="Starts" value={stats.starts} />
        <MobileStat className="col-span-2" label="Goals" value={stats.goals} accent />
        <MobileStat className="col-span-2" label="Assists" value={stats.assists} accent />
        <MobileStat className="col-span-2" label="Yellow" value={stats.yellowCards} tone="warning" />
        <MobileStat className="col-span-2" label="Red" value={stats.redCards} tone="danger" />
      </div>
    </section>
  );
}

function MobileStat({ className, label, value, accent, tone }: { className?: string; label: string; value: number; accent?: boolean; tone?: "warning" | "danger" }) {
  return (
    <div className={cn("border-b border-r border-border-subtle p-3 text-center [&:nth-last-child(-n+3)]:border-b-0 [&:nth-child(3n)]:border-r-0", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums text-foreground", accent && "text-brand", tone === "warning" && "text-warning", tone === "danger" && "text-danger")}>{value}</p>
    </div>
  );
}

function RecentFormTab({ query }: { query: StatsQuery }) {
  const matches = useMemo(
    () => [...(query.data?.matches ?? [])].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)),
    [query.data?.matches],
  );

  if (query.isLoading) return <ProfileLoading />;
  if (query.isError || !query.data) return <ProfileError />;

  return (
    <section className="px-3 py-5">
      {matches.length === 0 ? (
        <EmptyProfileState>No recent matches recorded for this player.</EmptyProfileState>
      ) : (
        <>
          <div className="mb-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Recent Form</h2>
            <div className="flex flex-wrap gap-2" aria-label="Last five match results">
              {matches.slice(0, 5).map((match) => <FormResult key={match.matchId} match={match} />)}
            </div>
          </div>
          <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface-nested">
            {matches.map((match) => <RecentMatchRow key={match.matchId} match={match} />)}
          </div>
        </>
      )}
    </section>
  );
}

function FormResult({ match }: { match: AthleteMatchBreakdown }) {
  const label = match.result === "W" ? "Win" : match.result === "D" ? "Draw" : "Loss";
  return (
    <span title={`${label} against ${match.opponent}`} className={cn("flex size-9 items-center justify-center rounded-lg text-xs font-bold", match.result === "W" && "bg-brand text-brand-foreground", match.result === "D" && "bg-warning/15 text-warning", match.result === "L" && "bg-danger/15 text-danger")}>
      {match.result}<span className="sr-only">: {label}</span>
    </span>
  );
}

function RecentMatchRow({ match }: { match: AthleteMatchBreakdown }) {
  const details = [
    match.minutesPlayed !== null ? `${match.minutesPlayed} min` : null,
    match.goals > 0 ? `${match.goals} ${match.goals === 1 ? "goal" : "goals"}` : null,
    match.assists > 0 ? `${match.assists} ${match.assists === 1 ? "assist" : "assists"}` : null,
  ].filter(Boolean);

  return (
    <article className="flex min-w-0 items-center gap-3 px-3 py-3.5">
      <div className="w-12 shrink-0 text-[10px] font-bold uppercase leading-tight tracking-wide text-muted-foreground">
        {COMPACT_MATCH_DATE.format(new Date(match.date))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">vs {match.opponent}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{match.started ? "Started" : "Substitute"}{details.length > 0 ? ` · ${details.join(" · ")}` : ""}</p>
        {(match.yellowCards > 0 || match.redCards > 0) && (
          <p className="mt-1 text-[11px] text-muted-foreground">{match.yellowCards > 0 ? `${match.yellowCards} yellow` : ""}{match.yellowCards > 0 && match.redCards > 0 ? " · " : ""}{match.redCards > 0 ? `${match.redCards} red` : ""}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <span className={cn("inline-flex size-7 items-center justify-center rounded-md text-[11px] font-bold", match.result === "W" && "bg-brand/15 text-brand", match.result === "D" && "bg-warning/15 text-warning", match.result === "L" && "bg-danger/15 text-danger")}>{match.result}</span>
        <p className="mt-1 text-xs font-bold tabular-nums text-foreground">{match.teamScore}–{match.opponentScore}</p>
      </div>
    </article>
  );
}

function ProfileLoading() {
  return <div className="grid grid-cols-3 gap-2 px-3 py-5" aria-label="Loading player statistics" aria-busy="true">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-muted" />)}</div>;
}

function ProfileError() {
  return <div className="px-3 py-5"><EmptyProfileState error>Could not load player statistics. Please try again.</EmptyProfileState></div>;
}

function EmptyProfileState({ children, error = false }: { children: string; error?: boolean }) {
  return <p className={cn("rounded-xl border border-dashed border-border-default px-4 py-10 text-center text-sm text-muted-foreground", error && "border-danger/30 text-danger")}>{children}</p>;
}
