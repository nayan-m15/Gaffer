/**
 * Secure-logout decision logic, kept dependency-free so Node's built-in test
 * runner can exercise it directly (the app bundle uses `@/` aliases Node
 * cannot resolve).
 *
 * The session cookie is HttpOnly, so only the server can end a session. A
 * sign-out whose HTTP request never completed leaves the session in an
 * unknown-but-possibly-live state, and clearing the client in that window
 * would make the UI claim "signed out" while the browser still carries a
 * valid session cookie.
 */

/** What AuthContext should do after a sign-out attempt failed. */
export interface LogoutAction {
  /**
   * True when the server session is known to be gone (or never existed), so
   * clearing local auth state cannot desynchronise the UI from the server.
   */
  clearLocalState: boolean;
  /** User-facing explanation; null when clearing is safe (nothing to say). */
  message: string | null;
}

/**
 * Shown while the UI keeps the user signed in pending the automatic retry
 * once connectivity returns.
 */
export const LOGOUT_PENDING_RETRY_MESSAGE =
  "We couldn't reach the server to sign you out, so you're still signed in on this device. We'll finish signing you out once the connection is back.";

/**
 * Decides how to treat a failed sign-out request.
 *
 * @param httpStatus The HTTP status the server answered with, or `null` when
 * the request never completed (offline, network drop, timeout) or the error
 * shape is unknown.
 */
export function resolveLogoutAction(httpStatus: number | null): LogoutAction {
  // The backend's auth guard answers 401 only when no valid session exists
  // server-side — there is nothing left to revoke, so the client may safely
  // become signed out.
  if (httpStatus === 401) {
    return { clearLocalState: true, message: null };
  }
  // Offline, 5xx, and every other failure leave the HttpOnly session's fate
  // unknown: keep the signed-in UI and retry when connectivity returns.
  return {
    clearLocalState: false,
    message: LOGOUT_PENDING_RETRY_MESSAGE,
  };
}

/**
 * Whether an armed logout retry should still run. The user may have signed
 * out successfully on a later attempt or signed in as a different account
 * since the failure — a stale retry must never sign out the wrong session.
 */
export function shouldRetryLogout(
  armed: { userId: string } | null,
  activeUserId: string | null,
): boolean {
  return armed !== null && armed.userId === activeUserId;
}
