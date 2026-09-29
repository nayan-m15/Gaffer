import type { PageTourKey } from "./pageTourDefinitions";

export function pageTourSeenKey(userId: string, pageKey: PageTourKey): string {
  return `gaffer:page-tour:${userId}:${pageKey}`;
}

export function isPageTourSeen(
  userId: string | undefined,
  pageKey: PageTourKey,
): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(pageTourSeenKey(userId, pageKey)) === "seen";
  } catch {
    return false;
  }
}

export function markPageTourSeen(userId: string, pageKey: PageTourKey): void {
  try {
    localStorage.setItem(pageTourSeenKey(userId, pageKey), "seen");
  } catch {
    // Ignore quota / private-mode failures.
  }
}
