/**
 * User-facing copy for a failed "Remove assistant" attempt.
 *
 * Dependency-free by design: it duck-types the ApiError `status` field
 * instead of importing `@/lib/api`, so Node's built-in test runner can
 * import this module directly (Node never resolves the `@/` alias).
 */

function errorStatus(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * Maps a removal failure to the message shown in the confirmation dialog.
 * 403 is the coach-only guard, 404 covers both unknown ids and assistants
 * already removed from a stale list, and everything else — including
 * offline `TypeError`s from `fetch` — asks the coach to retry.
 */
export function assistantRemovalErrorCopy(error: unknown): string {
  switch (errorStatus(error)) {
    case 403:
      return "Only coaches can remove assistants.";
    case 404:
      return "This assistant is no longer on your team.";
    default:
      return "Could not remove the assistant. Check your connection and try again.";
  }
}
