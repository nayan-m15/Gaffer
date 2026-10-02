import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { flushOfflineMatchEvents } from "@/features/matches/api";
import {
  enqueueOperation,
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
}: {
  matchId: string;
  onClose: () => void;
}) {
  const { team } = useAuth();
  const [reviews, setReviews] = useState<SyncedMatchReview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [queuedDecisions, setQueuedDecisions] = useState<
    Record<string, { state: string; error: string | null }>
  >({});

  const load = useCallback(async () => {
    try {
      const synced = await readSyncedMatchReviews(matchId);
      const rows =
        synced.length > 0 || !navigator.onLine
          ? synced
          : await apiFetch<SyncedMatchReview[]>(
              `/matches/${matchId}/event-reviews`,
            );
      setReviews(rows);
      const queue = await listQueuedEvents(matchId);
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
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load reviews.",
      );
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
      .catch((cause: unknown) => {
        setError(
          cause instanceof Error ? cause.message : "Could not watch reviews.",
        );
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, [load]);

  useEffect(() => {
    const stop = subscribeToOfflineQueueChanges(() => void load());
    const refresh = () => void load();
    window.addEventListener("online", refresh);
    return () => {
      stop();
      window.removeEventListener("online", refresh);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-review-title"
    >
      <section className="themed-scrollbar max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-default bg-popover p-5 text-popover-foreground shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2
            id="event-review-title"
            className="font-oswald text-xl tracking-wide text-foreground"
          >
            Event review
          </h2>
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
        {openReviews.length === 0 ? (
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
                {review.reason.replaceAll("_", " ")}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-secondary-foreground">
                {review.observations.map((observation) => (
                  <li key={observation.id}>
                    {observation.team}{" "}
                    {observation.eventType.replaceAll("_", " ")} ·{" "}
                    {Math.floor(observation.matchElapsedMs / 60_000)}:
                    {String(
                      Math.floor((observation.matchElapsedMs % 60_000) / 1000),
                    ).padStart(2, "0")}
                    {observation.athleteId
                      ? ` · player ${observation.athleteId.slice(0, 8)}`
                      : ""}
                    {observation.opponentLabel
                      ? ` · ${observation.opponentLabel}`
                      : ""}
                    {` · observer ${observation.loggedByUserId.slice(0, 8)}`}
                  </li>
                ))}
              </ul>
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
              <div className="mt-4 flex gap-2">
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
                    team?.role !== "coach"
                  }
                  onClick={() => void resolve(review.id, "same_event")}
                  className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/88 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-text-disabled"
                >
                  Same event
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
                    team?.role !== "coach"
                  }
                  onClick={() => void resolve(review.id, "separate_events")}
                  className="rounded-md border border-border-default bg-surface-elevated px-3 py-2 text-xs font-bold text-foreground hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-text-disabled"
                >
                  Separate events
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
                    {review.resolution?.replaceAll("_", " ") ?? "resolved"}
                    {review.resolvedByUserId
                      ? ` · resolved by coach ${review.resolvedByUserId.slice(0, 8)}`
                      : ""}
                    {review.disputedByUserId
                      ? ` · disputed by coach ${review.disputedByUserId.slice(0, 8)}`
                      : ""}
                  </span>
                  {team?.role === "coach" && !review.disputedAt ? (
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
                  review.reviewVersion === 2 &&
                  review.resolution ? (
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
      </section>
    </div>
  );
}
