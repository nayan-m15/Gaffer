import type { SyncedMatchReview } from "./match-store";

type ReviewSources = {
  online: boolean;
  fetch: () => Promise<SyncedMatchReview[]>;
  synced: () => Promise<SyncedMatchReview[]>;
  cached: () => Promise<SyncedMatchReview[] | null>;
  cache: (rows: SyncedMatchReview[]) => Promise<unknown>;
};

/** A broken local store must not prevent an online coach from seeing reviews. */
export async function loadEventReviews(sources: ReviewSources) {
  let warning: string | null = null;
  if (sources.online) {
    try {
      const reviews = await sources.fetch();
      // Failure to save an offline copy does not invalidate the server response.
      void sources.cache(reviews).catch(() => undefined);
      return { reviews, warning };
    } catch (cause) {
      if (cause && typeof cause === "object" && "status" in cause &&
        [401, 403, 404].includes(Number(cause.status))) throw cause;
      warning = `Could not refresh reviews. ${cause instanceof Error ? cause.message : "Try again."}`;
    }
  }
  const [synced, cached] = await Promise.allSettled([sources.synced(), sources.cached()]);
  const previous = cached.status === "fulfilled" ? cached.value : null;
  if (synced.status === "fulfilled" && synced.value.length > 0) {
    const reviews = synced.value.map(row => {
      const old = previous?.find(item => item.id === row.id);
      return { ...old, ...row, locked: row.locked ?? old?.locked,
        observations: row.observations.map(observation => ({
          ...old?.observations.find(item => item.id === observation.id), ...observation,
        })),
      };
    });
    return { reviews, warning };
  }
  if (previous) return { reviews: previous, warning };
  if (synced.status === "fulfilled") return { reviews: synced.value, warning };
  throw new Error(warning ?? "Reviews are unavailable offline. Reconnect and try again.");
}
