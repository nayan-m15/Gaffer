import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { StandingsDisplay } from "@/components/standings/StandingsDisplay";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { fetchPlayerStandings } from "@/services/player";

/**
 * PlayerStandingsPage — read-only competition standings for the claimed
 * athlete's team. Shares the same `StandingsDisplay` component used by
 * the coach's StatisticsPage.
 */
export default function PlayerStandingsPage() {
  const { claimedAthletes } = useAuth();

  const standingsQuery = useQuery({
    queryKey: ["player", "standings"],
    queryFn: () => fetchPlayerStandings(claimedAthletes[0]?.id),
    enabled: claimedAthletes.length > 0,
  });

  return (
    <>
      <PageHeader
        title="Standings"
        subtitle="League and cup standings for your team."
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Error */}
        {standingsQuery.isError && (
          <div className="rounded-xl border border-border bg-card p-6">
            <p className="text-sm text-destructive">
              {standingsQuery.error instanceof ApiError
                ? standingsQuery.error.message
                : "Could not load standings."}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void standingsQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </div>
        )}

        <StandingsDisplay
          competitions={standingsQuery.data ?? []}
          isLoading={standingsQuery.isLoading}
          emptyMessage="No competitions added yet by your coach."
        />
      </div>
    </>
  );
}
