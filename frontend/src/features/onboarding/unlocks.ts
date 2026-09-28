import { useCallback, useSyncExternalStore } from "react";
import { useAthletes } from "@/features/team-management/api";
import { useGamePlans } from "@/features/team-tactics/api";
import { completeOnboarding } from "./onboardingFlag";

export type UnlockPageKey =
  | "dashboard"
  | "events"
  | "injuries"
  | "live-logger"
  | "statistics";

export interface UnlockPageConfig {
  key: UnlockPageKey;
  label: string;
  needsPlayers: boolean;
  needsGamePlan: boolean;
  description: string | ((ctx: { hasGamePlan: boolean }) => string);
}

export const PAGE_UNLOCKS: Record<UnlockPageKey, UnlockPageConfig> = {
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    needsPlayers: true,
    needsGamePlan: true,
    description:
      "Your home base: upcoming events, recent results, and any match that's live.",
  },
  events: {
    key: "events",
    label: "Events",
    needsPlayers: true,
    needsGamePlan: false,
    description: ({ hasGamePlan }) =>
      hasGamePlan
        ? "Schedule matches, training sessions, and meetings on the calendar."
        : "Schedule training sessions and meetings. Matches unlock once you save your first game plan.",
  },
  injuries: {
    key: "injuries",
    label: "Injuries",
    needsPlayers: true,
    needsGamePlan: false,
    description: "Log injuries and track each player's recovery.",
  },
  "live-logger": {
    key: "live-logger",
    label: "Live Logger",
    needsPlayers: true,
    needsGamePlan: true,
    description:
      "On match day, pick the match, confirm your squad, and log goals, cards, and subs as they happen.",
  },
  statistics: {
    key: "statistics",
    label: "Stats",
    needsPlayers: true,
    needsGamePlan: true,
    description:
      "Season totals and player breakdowns, built from what you log in matches.",
  },
};

export const UNLOCK_PAGE_KEYS = [
  "dashboard",
  "events",
  "injuries",
  "live-logger",
  "statistics",
] as const satisfies readonly UnlockPageKey[];

const UNLOCK_FLAG_EVENT = "gaffer:unlock-flag";

function emitUnlockFlagChange() {
  window.dispatchEvent(new Event(UNLOCK_FLAG_EVENT));
}

function subscribeUnlockFlag(onStoreChange: () => void) {
  window.addEventListener(UNLOCK_FLAG_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(UNLOCK_FLAG_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function unlockedFlagKey(userId: string, pageKey: UnlockPageKey): string {
  return `gaffer:unlocked:${userId}:${pageKey}`;
}

export function isPageCelebrated(
  userId: string,
  pageKey: UnlockPageKey,
): boolean {
  try {
    return localStorage.getItem(unlockedFlagKey(userId, pageKey)) === "1";
  } catch {
    return false;
  }
}

export function markPageCelebrated(
  userId: string,
  pageKey: UnlockPageKey,
): void {
  try {
    localStorage.setItem(unlockedFlagKey(userId, pageKey), "1");
    const allCelebrated = UNLOCK_PAGE_KEYS.every((key) =>
      isPageCelebrated(userId, key),
    );
    if (allCelebrated) completeOnboarding(userId);
    emitUnlockFlagChange();
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function usePageCelebrated(
  userId: string | undefined,
  pageKey: UnlockPageKey,
): boolean {
  const getSnapshot = useCallback(() => {
    if (!userId) return false;
    return isPageCelebrated(userId, pageKey);
  }, [userId, pageKey]);
  return useSyncExternalStore(subscribeUnlockFlag, getSnapshot, () => false);
}

export function pageUnlockDescription(
  pageKey: UnlockPageKey,
  hasGamePlan: boolean,
): string {
  const { description } = PAGE_UNLOCKS[pageKey];
  return typeof description === "function"
    ? description({ hasGamePlan })
    : description;
}

export function pageRequirementsMet(
  pageKey: UnlockPageKey,
  hasPlayers: boolean,
  hasGamePlan: boolean,
): boolean {
  const page = PAGE_UNLOCKS[pageKey];
  if (page.needsPlayers && !hasPlayers) return false;
  if (page.needsGamePlan && !hasGamePlan) return false;
  return true;
}

export function useUnlockRequirements(): {
  hasPlayers: boolean;
  hasGamePlan: boolean;
  isLoading: boolean;
} {
  const athletesQuery = useAthletes();
  const gamePlansQuery = useGamePlans();
  return {
    hasPlayers: (athletesQuery.data?.length ?? 0) > 0,
    hasGamePlan: (gamePlansQuery.data?.length ?? 0) > 0,
    isLoading: athletesQuery.isPending || gamePlansQuery.isPending,
  };
}
