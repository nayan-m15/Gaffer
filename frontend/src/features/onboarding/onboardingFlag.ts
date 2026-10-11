import { useCallback, useSyncExternalStore } from "react";

const ONBOARDING_FLAG_EVENT = "gaffer:onboarding-flag";

export function onboardingFlagKey(userId: string): string {
  return `gaffer:onboarding:${userId}`;
}

function emitOnboardingFlagChange() {
  window.dispatchEvent(new Event(ONBOARDING_FLAG_EVENT));
}

function subscribeOnboardingFlag(onStoreChange: () => void) {
  window.addEventListener(ONBOARDING_FLAG_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(ONBOARDING_FLAG_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

export function readOnboardingActive(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(onboardingFlagKey(userId)) === "active";
  } catch {
    return false;
  }
}

/** True when the onboarding key exists with any value ("active" or "complete"). */
export function hasOnboardingFlag(userId: string | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(onboardingFlagKey(userId)) !== null;
  } catch {
    return false;
  }
}

/** First-time tour after team creation. Never overwrites "complete". */
export function markOnboardingActive(userId: string): void {
  try {
    const key = onboardingFlagKey(userId);
    if (localStorage.getItem(key) === "complete") return;
    localStorage.setItem(key, "active");
    emitOnboardingFlagChange();
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function completeOnboarding(userId: string): void {
  try {
    localStorage.setItem(onboardingFlagKey(userId), "complete");
    emitOnboardingFlagChange();
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export function useOnboardingRoadActive(userId: string | undefined): boolean {
  const getSnapshot = useCallback(
    () => readOnboardingActive(userId),
    [userId],
  );
  return useSyncExternalStore(subscribeOnboardingFlag, getSnapshot, () => false);
}

export function useHasOnboardingFlag(userId: string | undefined): boolean {
  const getSnapshot = useCallback(
    () => hasOnboardingFlag(userId),
    [userId],
  );
  return useSyncExternalStore(subscribeOnboardingFlag, getSnapshot, () => false);
}
