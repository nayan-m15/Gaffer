import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { flushOfflineMatchEvents } from "@/features/matches/api";
import { enqueueOperation } from "./match-store";

interface Observation {
  id: string;
  eventType: string;
  team: string;
  matchElapsedMs: number;
  loggedByUserId: string;
}

interface Review {
  id: string;
  reason: string;
  status: string;
  observations: Observation[];
}

export function EventReviewPanel({
  matchId,
  onClose,
}: {
  matchId: string;
  onClose: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch<Review[]>(`/matches/${matchId}/event-reviews`);
      setReviews(rows.filter((row) => row.status === "open"));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load reviews.");
    }
  }, [matchId]);

  useEffect(() => void load(), [load]);

  const resolve = async (reviewId: string, resolution: "same_event" | "separate_events") => {
    setBusy(reviewId);
    try {
      await enqueueOperation({
        kind: "operation",
        id: crypto.randomUUID(),
        matchId,
        operationType: "resolve_review",
        reviewId,
        resolution,
        causalParentIds: [],
      });
      setReviews((current) => current.filter((review) => review.id !== reviewId));
      if (navigator.onLine) {
        await flushOfflineMatchEvents();
        await load();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resolve review.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#090a0b]/80 p-4 backdrop-blur-sm">
      <section className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#2a2e31] bg-[#111315] p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-oswald text-xl tracking-wide text-white">Duplicate review</h2>
          <button type="button" onClick={onClose} className="text-sm text-[#c7ccc9]">Close</button>
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-[#e36a6d]">{error}</p> : null}
        {!error && reviews.length === 0 ? (
          <p className="mt-5 text-sm text-[#9ca39f]">No events need review.</p>
        ) : null}
        <div className="mt-4 space-y-3">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-xl border border-[#d6a447]/35 bg-[#0d0f10] p-4">
              <p className="text-sm font-semibold text-[#d6a447]">Possible duplicate event</p>
              <ul className="mt-2 space-y-1 text-xs text-[#c7ccc9]">
                {review.observations.map((observation) => (
                  <li key={observation.id}>
                    {observation.eventType.replaceAll("_", " ")} · {Math.floor(observation.matchElapsedMs / 60_000)}:{String(Math.floor((observation.matchElapsedMs % 60_000) / 1000)).padStart(2, "0")}
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={busy === review.id}
                  onClick={() => void resolve(review.id, "same_event")}
                  className="rounded-md bg-[#00a878] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  Same event
                </button>
                <button
                  type="button"
                  disabled={busy === review.id}
                  onClick={() => void resolve(review.id, "separate_events")}
                  className="rounded-md border border-white/20 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  Separate events
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
