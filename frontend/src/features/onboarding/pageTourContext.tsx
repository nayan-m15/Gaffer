import { useCallback, useEffect, useMemo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { START_TOUR_STORAGE_KEY } from "./constants";
import { pageTourKeyFromPath } from "./pageTourDefinitions";
import { useHasOnboardingFlag } from "./onboardingFlag";
import { isPageTourSeen } from "./pageTourStorage";
import { isGoalUnlockCelebrationRunning } from "./goalUnlockCelebration";
import {
  destroyPageTour,
  pageTourPrimaryTargetReady,
  startPageTour as drivePageTour,
} from "./startPageTour";
import { isCoachTourActive } from "./tourLock";
import { PageTourContext } from "./usePageTour";

const PAGE_TOUR_RETRY_MS = 250;
const PAGE_TOUR_MAX_ATTEMPTS = 24;
const PAGE_TOUR_IDLE_TIMEOUT_MS = 400;

function pageTourIsBlocked(
  showingGate: boolean,
  celebrationActive: boolean,
): boolean {
  return (
    showingGate ||
    celebrationActive ||
    isGoalUnlockCelebrationRunning() ||
    isCoachTourActive() ||
    sessionStorage.getItem(START_TOUR_STORAGE_KEY) === "1"
  );
}

function whenBrowserIdle(callback: () => void): () => void {
  if (typeof requestIdleCallback === "function") {
    const idleId = requestIdleCallback(callback, {
      timeout: PAGE_TOUR_IDLE_TIMEOUT_MS,
    });
    return () => cancelIdleCallback(idleId);
  }
  let second = 0;
  const first = requestAnimationFrame(() => {
    second = requestAnimationFrame(callback);
  });
  return () => {
    cancelAnimationFrame(first);
    cancelAnimationFrame(second);
  };
}

export function PageTourProvider({
  userId,
  showingGate,
  celebrationActive,
  children,
}: {
  userId: string | undefined;
  showingGate: boolean;
  celebrationActive: boolean;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const pageTourKey = pageTourKeyFromPath(pathname);
  const hasOnboarding = useHasOnboardingFlag(userId);

  const startPageTour = useCallback(() => {
    if (!userId || !pageTourKey) return;
    if (pageTourIsBlocked(showingGate, celebrationActive)) return;
    drivePageTour({ pageKey: pageTourKey, userId });
  }, [userId, pageTourKey, showingGate, celebrationActive]);

  useEffect(() => {
    return () => {
      destroyPageTour({ persistSeen: false });
    };
  }, [pageTourKey]);

  useEffect(() => {
    if (!userId || !pageTourKey) return;
    if (!hasOnboarding) return;
    if (isPageTourSeen(userId, pageTourKey)) return;

    let cancelled = false;
    let attempts = 0;
    let idlePending = false;
    let cancelIdle: (() => void) | null = null;
    let intervalId = 0;

    const tryStart = () => {
      if (cancelled) return true;
      if (pageTourIsBlocked(showingGate, celebrationActive)) return false;
      if (isPageTourSeen(userId, pageTourKey)) return true;
      const primaryReady = pageTourPrimaryTargetReady(pageTourKey);
      if (!primaryReady && attempts < PAGE_TOUR_MAX_ATTEMPTS) return false;
      if (idlePending) return false;
      idlePending = true;
      cancelIdle = whenBrowserIdle(() => {
        idlePending = false;
        cancelIdle = null;
        if (cancelled) return;
        if (pageTourIsBlocked(showingGate, celebrationActive)) return;
        if (isPageTourSeen(userId, pageTourKey)) {
          window.clearInterval(intervalId);
          return;
        }
        if (drivePageTour({ pageKey: pageTourKey, userId })) {
          window.clearInterval(intervalId);
        }
      });
      return false;
    };

    intervalId = window.setInterval(() => {
      if (pageTourIsBlocked(showingGate, celebrationActive)) return;
      attempts += 1;
      if (tryStart() || attempts >= PAGE_TOUR_MAX_ATTEMPTS) {
        window.clearInterval(intervalId);
      }
    }, PAGE_TOUR_RETRY_MS);

    if (tryStart()) window.clearInterval(intervalId);

    return () => {
      cancelled = true;
      cancelIdle?.();
      window.clearInterval(intervalId);
    };
  }, [userId, pageTourKey, hasOnboarding, showingGate, celebrationActive]);

  const value = useMemo(
    () => ({ pageTourKey, startPageTour }),
    [pageTourKey, startPageTour],
  );

  return (
    <PageTourContext.Provider value={value}>{children}</PageTourContext.Provider>
  );
}
