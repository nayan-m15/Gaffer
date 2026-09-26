import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { formatEventDateTime } from "./event-utils";
import {
  useAcceptFriendlyFixture,
  useDeclineFriendlyFixture,
  useIncomingFriendlyFixtures,
} from "./hooks";

/**
 * Coach-only inbox for inbound friendly-fixture requests. Another Gaffer
 * coach proposed a match; until the coach here accepts, the fixture is not
 * confirmed for this team. Accepting mirrors the match onto this team's
 * calendar (both sides stay linked to the same fixture); declining leaves
 * the requester with their own event and adds nothing here.
 *
 * Renders nothing while there are no pending requests, so it can sit at the
 * top of the events page without adding noise.
 */
export function FixtureRequestsBanner() {
  const incomingQuery = useIncomingFriendlyFixtures();
  const acceptFixture = useAcceptFriendlyFixture();
  const declineFixture = useDeclineFriendlyFixture();
  const [responding, setResponding] = useState<{
    id: string;
    action: "accept" | "decline";
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const requests = incomingQuery.data ?? [];
  if (requests.length === 0) {
    return null;
  }

  const respond = async (fixtureId: string, action: "accept" | "decline") => {
    setResponding({ id: fixtureId, action });
    setError(null);
    try {
      if (action === "accept") {
        await acceptFixture.mutateAsync(fixtureId);
      } else {
        await declineFixture.mutateAsync(fixtureId);
      }
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Could not respond to this fixture request. Please try again.",
      );
    } finally {
      setResponding(null);
    }
  };

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-amber-500">
        Friendly fixture requests ({requests.length})
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Another coach wants to play your team. The fixture is only confirmed
        once you accept it.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <ul className="mt-3 space-y-2">
        {requests.map((request) => (
          <li
            key={request.id}
            className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {request.requesterTeamName} has invited your team to a friendly
                fixture
              </p>
              <p className="text-xs text-muted-foreground">
                {request.scheduledAt
                  ? formatEventDateTime(request.scheduledAt)
                  : "Date to be confirmed"}
                {request.location ? ` · ${request.location}` : ""}
              </p>
              {request.notes && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {request.notes}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                disabled={responding !== null}
                onClick={() => void respond(request.id, "accept")}
              >
                <Check className="size-4" />
                {responding?.id === request.id && responding.action === "accept"
                  ? "Accepting…"
                  : "Accept"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={responding !== null}
                onClick={() => void respond(request.id, "decline")}
              >
                {responding?.id === request.id && responding.action === "decline"
                  ? "Declining…"
                  : "Decline"}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
