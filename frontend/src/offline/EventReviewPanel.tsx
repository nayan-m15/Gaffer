import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { flushOfflineMatchEvents } from "@/features/matches/api";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { loadEventReviews } from "./event-review-loader";
import {
  enqueueOperation,
  cacheResponse,
  readCachedResponse,
  listQueuedEvents,
  readSyncedReviewDecisionIds,
  readSyncedMatchReviews,
  subscribeToSyncedMatchReviewChanges,
  subscribeToOfflineQueueChanges,
  type SyncedMatchReview,
} from "./match-store";

export function EventReviewPanel({
  matchId,
  onClose,
  expectedReviewCount = 0,
}: {
  matchId: string;
  onClose: () => void;
  expectedReviewCount?: number;
}) {
  const { team } = useAuth();
  const [reviews, setReviews] = useState<SyncedMatchReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestVersion = useRef(0);
  const [explanations, setExplanations] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [queuedDecisions, setQueuedDecisions] = useState<
    Record<string, { state: string; error: string | null }>
  >({});

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    try {
      const result = await loadEventReviews({
        online: navigator.onLine,
        fetch: () => apiFetch<SyncedMatchReview[]>(`/matches/${matchId}/event-reviews`),
        synced: () => readSyncedMatchReviews(matchId),
        cached: () => readCachedResponse<SyncedMatchReview[]>(`reviews:${matchId}`),
        cache: rows => cacheResponse(`reviews:${matchId}`, rows),
      });
      if (version !== requestVersion.current) return;
      setReviews(result.reviews);
      setError(result.warning);
      setLoading(false);
      const queue = await listQueuedEvents(matchId).catch(() => []);
      if (version !== requestVersion.current) return;
      const decisions: Record<string, { state: string; error: string | null }> =
        {};
      for (const item of queue) {
        if (item.kind !== "operation") continue;
        const operation = JSON.parse(item.payload) as {
          operationType?: string;
          reviewId?: string;
        };
        if (
          operation.operationType === "resolve_review" &&
          operation.reviewId
        ) {
          decisions[operation.reviewId] = {
            state: item.state,
            error: item.error,
          };
        }
      }
      setQueuedDecisions(decisions);
    } catch (cause) {
      if (cause && typeof cause === "object" && "status" in cause &&
        [401, 403, 404].includes(Number(cause.status)) && version === requestVersion.current) setReviews([]);
      if (version === requestVersion.current) setError(
        cause instanceof Error ? cause.message : "Could not load reviews.",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [matchId]);

  useEffect(() => void load(), [load]);
  useEffect(() => {
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    void subscribeToSyncedMatchReviewChanges(() => void load())
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch((cause: unknown) => console.warn("Could not watch reviews.", cause));
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [load]);

  useEffect(() => {
    const stop = subscribeToOfflineQueueChanges(() => void load());
    const refresh = () => void load();
    window.addEventListener("online", refresh);
    const interval = window.setInterval(() => {
      if (navigator.onLine && document.visibilityState === "visible") refresh();
    }, 5_000);
    return () => {
      stop();
      window.removeEventListener("online", refresh);
      window.clearInterval(interval);
    };
  }, [load]);

  const resolve = async (
    reviewId: string,
    resolution: "same_event" | "separate_events",
  ) => {
    if (team?.role !== "coach") return;
    setBusy(reviewId);
    try {
      const review = reviews.find((row) => row.id === reviewId);
      let causalParentIds: string[] = [];
      if (review?.reason === "conflicting_resolution") {
        causalParentIds = await readSyncedReviewDecisionIds(matchId, reviewId);
        if (navigator.onLine) {
          const operations = await apiFetch<
            Array<{ id: string; decision: { reviewId?: string } }>
          >(`/matches/${matchId}/event-operations`);
          causalParentIds = operations
            .filter((operation) => operation.decision.reviewId === reviewId)
            .map((operation) => operation.id)
            .sort((left, right) => left.localeCompare(right));
        }
        if (causalParentIds.length === 0) {
          throw new Error("The conflicting decisions have not synced yet.");
        }
      }
      await enqueueOperation({
        kind: "operation",
        id: crypto.randomUUID(),
        matchId,
        operationType: "resolve_review",
        reviewId,
        resolution,
        explanation: explanations[reviewId]?.trim() || undefined,
        causalParentIds,
      });
      await load();
      if (navigator.onLine) {
        await flushOfflineMatchEvents();
        await load();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not resolve review.",
      );
    } finally {
      setBusy(null);
    }
  };

  const dispute = async (reviewId: string) => {
    try {
      await apiFetch(`/matches/${matchId}/event-reviews/${reviewId}/dispute`, {
        method: "POST",
      });
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not flag dispute.",
      );
    }
  };

  const openReviews = reviews.filter((review) => review.status === "open");
  const history = reviews.filter((review) => review.status === "resolved");
  return (
    <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="themed-scrollbar block max-h-[85dvh] w-full overflow-y-auto rounded-2xl p-5 sm:max-w-lg">
        <div className="flex items-center justify-between gap-3">
          <DialogTitle
            className="font-oswald text-xl tracking-wide text-foreground"
          >
            Event review
          </DialogTitle>
          <button type="button" onClick={() => void load()} disabled={loading} className="ml-auto rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-surface-hover disabled:opacity-50">Refresh</button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Close
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {loading && reviews.length === 0 ? <p role="status" className="mt-5 text-sm text-muted-foreground">Loading reviews…</p> : null}
        {!loading && expectedReviewCount > openReviews.length ? <p role="alert" className="mt-3 text-sm text-warning">The report lists {expectedReviewCount} unresolved reviews. Refresh to load the latest queue.</p> : null}
        {!loading && !error && expectedReviewCount === 0 && openReviews.length === 0 ? (
          <p className="mt-5 text-sm text-muted-foreground">
            No events need review.
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {openReviews.map((review) => (
            <article
              key={review.id}
              className="rounded-xl border border-warning/35 bg-surface-nested p-4"
            >
              <p className="text-sm font-semibold text-warning">
                {review.reason === "possible_duplicate" ? "Possible duplicate" : review.reason.replaceAll("_", " ")}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-secondary-foreground">
                {review.observations.map((observation) => (
                  <li key={observation.id}>
                    {observation.eventTeamName ?? observation.team}{" "}
                    {observation.eventType.replaceAll("_", " ")} ·{" "}
                    {Math.floor(observation.matchElapsedMs / 60_000)}:
                    {String(
                      Math.floor((observation.matchElapsedMs % 60_000) / 1000),
                    ).padStart(2, "0")}
                    {observation.playerLabel ? ' - ' + observation.playerLabel : observation.opponentLabel ? ' - ' + observation.opponentLabel : ''}
                    {' - recorded by ' + (observation.sourceTeamName ?? 'your team') + (observation.observerName ? ' (' + observation.observerName + ')' : '')}
                  </li>
                ))}
              </ul>
              {review.crossTeam ? <div className="mt-3 text-xs text-muted-foreground">
                <p>Both teams must agree before this changes the shared report.</p>
                {(["home", "away"] as const).map(side => <p key={side}>
                  {review.teamNames?.[side] ?? side}: {review.teamDecisions?.[side] === "same_event" ? "Count as one event" : review.teamDecisions?.[side] === "separate_events" ? "Keep as two events" : "Awaiting decision"}
                  {review.teamDecisionNotes?.[side] ? ` - ${review.teamDecisionNotes[side]}` : ""}
                </p>)}
                {review.teamDecisions?.home && review.teamDecisions?.away && review.teamDecisions.home !== review.teamDecisions.away
                  ? <p className="mt-2 text-warning">Teams disagree. Review the observations and submit a revised decision.</p> : null}
              </div> : <p className="mt-2 text-xs text-muted-foreground">Your coach can resolve observations recorded within your team.</p>}
              {review.observations.every(observation => observation.eventType === "goal") ? <p className="mt-2 text-xs text-muted-foreground">Count as one: one goal. Keep as two: two goals.</p> : null}
              {review.locked ? <p className="mt-2 text-xs text-warning">The confirmed report is locked. Request an amendment from the match report.</p> : null}
              {queuedDecisions[review.id] &&
              queuedDecisions[review.id].state !== "rejected" ? (
                <p className="mt-2 text-xs text-warning">
                  Resolution{" "}
                  {queuedDecisions[review.id].state.replaceAll("_", " ")}.
                </p>
              ) : null}
              {queuedDecisions[review.id]?.state === "rejected" ? (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {queuedDecisions[review.id].error ??
                    "The server rejected this decision. Refresh the review."}
                </p>
              ) : null}
              {team?.role !== "coach" ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  A coach resolves this review.
                </p>
              ) : null}
              {!review.locked ? <label className="mt-3 block text-xs text-muted-foreground">Explanation (optional)<textarea maxLength={500} value={explanations[review.id] ?? ""} onChange={event => setExplanations({ ...explanations, [review.id]: event.target.value })} className="mt-1 w-full rounded border border-border-default bg-surface-elevated p-2 text-foreground" /></label> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={
                    busy === review.id ||
                    [
                      "queued",
                      "uploading",
                      "dependency_pending",
                      "quarantined",
                    ].includes(queuedDecisions[review.id]?.state ?? "") ||
                    team?.role !== "coach" || Boolean(review.locked)
                  }
                  onClick={() => void resolve(review.id, "same_event")}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-text-disabled"
                >
                  Count as one event
                </button>
                <button
                  type="button"
                  disabled={
                    busy === review.id ||
                    [
                      "queued",
                      "uploading",
                      "dependency_pending",
                      "quarantined",
                    ].includes(queuedDecisions[review.id]?.state ?? "") ||
                    team?.role !== "coach" || Boolean(review.locked)
                  }
                  onClick={() => void resolve(review.id, "separate_events")}
                  className="rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-text-disabled"
                >
                  Keep as two events
                </button>
              </div>
            </article>
          ))}
        </div>
        {history.length > 0 ? (
          <section className="mt-6 border-t border-border-subtle pt-4">
            <h3 className="text-sm font-semibold text-foreground">
              Review history
            </h3>
            <ul className="mt-2 space-y-1 text-xs text-secondary-foreground">
              {history.map((review) => (
                <li
                  key={review.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span>
                    {review.reason.replaceAll("_", " ")} ·{" "}
                    {review.resolution === "event_removed" ? "Closed because an event was removed" : review.resolution === "events_changed" ? "Closed because the events changed" : review.resolution?.replaceAll("_", " ") ?? "resolved"}
                    {review.resolvedByUserId
                      ? ` · resolved by coach ${review.resolvedByUserId.slice(0, 8)}`
                      : ""}
                    {review.disputedByUserId
                      ? ` · disputed by coach ${review.disputedByUserId.slice(0, 8)}`
                      : ""}
                  </span>
                  {team?.role === "coach" && !review.disputedAt && !review.locked && !review.crossTeam && ["same_event", "separate_events"].includes(review.resolution ?? "") ? (
                    <button
                      type="button"
                      disabled={!navigator.onLine}
                      onClick={() => void dispute(review.id)}
                      className="rounded border border-warning/50 px-2 py-1 text-warning hover:bg-warning/10 disabled:opacity-50"
                    >
                      Flag dispute
                    </button>
                  ) : null}
                  {team?.role === "coach" &&
                  !review.locked &&
                  review.reviewVersion === 2 &&
                  ["same_event", "separate_events"].includes(review.resolution ?? "") ? (
                    <button
                      type="button"
                      disabled={
                        busy === review.id ||
                        [
                          "queued",
                          "uploading",
                          "dependency_pending",
                          "quarantined",
                        ].includes(queuedDecisions[review.id]?.state ?? "")
                      }
                      onClick={() =>
                        void resolve(
                          review.id,
                          review.resolution === "same_event"
                            ? "separate_events"
                            : "same_event",
                        )
                      }
                      className="rounded border border-border-default bg-surface-elevated px-2 py-1 text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-text-disabled"
                    >
                      Reconsider
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
