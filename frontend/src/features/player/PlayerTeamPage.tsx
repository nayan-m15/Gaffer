import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { RosterTable } from "@/components/roster/RosterTable";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { fetchPlayerTeam } from "@/services/player";
import { toUiAthlete } from "@/services/athletes";
import type { Athlete } from "@/components/roster/data";

/**
 * PlayerTeamPage — read-only view of the claimed athlete's team roster.
 *
 * Reuses `RosterTable` with `readOnly` to strip all edit / archive / add
 * affordances; the player sees the squad but can only select rows to
 * highlight them.
 */
export default function PlayerTeamPage() {
  const { claimedAthletes } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const teamQuery = useQuery({
    queryKey: ["player", "team"],
    queryFn: () => fetchPlayerTeam(claimedAthletes[0]?.id),
    enabled: claimedAthletes.length > 0,
  });

  const athletes: Athlete[] = useMemo(
    () => (teamQuery.data ?? []).map(toUiAthlete),
    [teamQuery.data],
  );

  const selectedAthlete = athletes.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Your squad roster — read-only view."
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Loading */}
        {teamQuery.isLoading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Loading roster…
          </div>
        )}

        {/* Error */}
        {teamQuery.isError && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {teamQuery.error instanceof ApiError
                ? teamQuery.error.message
                : "Could not load team roster."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void teamQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        )}

        {/* Roster */}
        {teamQuery.data && (
          <>
            {athletes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center">
                <Users className="mx-auto size-8 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium text-foreground">
                  No athletes on the roster yet
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your coach hasn't added any players yet.
                </p>
              </div>
            ) : (
              <section className="rounded-2xl border border-border bg-card shadow-sm">
                <RosterTable
                  athletes={athletes}
                  selectedId={selectedId}
                  showArchived={false}
                  readOnly
                  onSelect={(athlete) => setSelectedId(athlete.id)}
                />
              </section>
            )}

            {/* Selected athlete detail */}
            {selectedAthlete && (
              <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-bold text-foreground">
                  {selectedAthlete.name}
                </h2>
                <p className="text-sm text-cyan-400">
                  {selectedAthlete.position}
                  {selectedAthlete.jerseyNumber
                    ? ` · #${selectedAthlete.jerseyNumber}`
                    : ""}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
                  <MiniStat label="Apps" value={selectedAthlete.appearances} />
                  <MiniStat label="Goals" value={selectedAthlete.goals} />
                  <MiniStat label="Assists" value={selectedAthlete.assists} />
                  <MiniStat label="Age" value={selectedAthlete.age} />
                  <MiniStat label="Status" value={selectedAthlete.status} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-background p-3 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-foreground">
        {value}
      </p>
    </div>
  );
}
