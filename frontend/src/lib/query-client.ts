import { QueryClient } from "@tanstack/react-query";
import { subscribeToDataChanges } from "./data-changes.ts";

export const DATA_REFRESH_INTERVAL_MS = 5_000;

export function createAppQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Mounted pages and dialogs refresh quietly, retaining their current data.
        // Feature-specific intervals (live matches, weather) still take precedence.
        refetchInterval: DATA_REFRESH_INTERVAL_MS,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: "always",
        refetchOnReconnect: "always",
        refetchOnMount: "always",
      },
    },
  });
}

/** Refresh related views after writes without interrupting optimistic mutations. */
export function connectAutomaticRefresh(client: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const channel = typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("gaffer-data-changes")
    : undefined;

  const refresh = () => {
    timer = undefined;
    if (client.isMutating()) {
      scheduleRefresh();
      return;
    }
    // Inactive data is marked stale for its next mount. Disabled queries stay idle.
    // Let existing fetches finish instead of cancelling live/offline match reads.
    void client.invalidateQueries({}, { cancelRefetch: false });
  };
  const scheduleRefresh = () => {
    if (timer === undefined) timer = setTimeout(refresh, 100);
  };
  const unsubscribe = subscribeToDataChanges(() => {
    scheduleRefresh();
    channel?.postMessage("changed");
  });
  if (channel) channel.onmessage = scheduleRefresh;

  return () => {
    unsubscribe();
    if (timer !== undefined) clearTimeout(timer);
    channel?.close();
  };
}
