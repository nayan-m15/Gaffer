import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiFetch, ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { subscribeToDataChanges } from "@/lib/data-changes";
import { clearPendingClaimToken } from "@/services/claims";
import { discardQueuedItems, setOfflineUserScope } from "@/offline/match-store";

import {
  AuthContext,
  type SessionUser,
  type SessionTeam,
  type ClaimedAthleteSummary,
  type AuthStatus,
  type SessionPayload,
  type SignUpInput,
  type SignInInput,
  type SignUpResult,
  type AccountKind,
} from "./auth-context";
export type {
  SessionUser,
  SessionTeam,
  ClaimedAthleteSummary,
  AuthStatus,
  SessionPayload,
  SignUpInput,
  SignInInput,
  SignUpResult,
  AccountKind,
} from "./auth-context";

/**
 * Owns the coach's authentication state for the whole app.
 *
 * Session state lives server-side (Better Auth's httpOnly cookie) — this
 * provider just hydrates from `GET /auth/session` on mount and after each
 * sign-up/sign-in/sign-out so the UI has something to render against.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [team, setTeam] = useState<SessionTeam | null>(null);
  const [claimedAthletes, setClaimedAthletes] = useState<ClaimedAthleteSummary[]>([]);
  const activeUserIdRef = useRef<string | null>(null);
  const cachedSessionKey = "gaffer-offline-session";
  const rememberedSessionKey = "gaffer-remember-session";

  const refresh = useCallback(async (background = false): Promise<SessionPayload | null> => {
    const startedForUserId = activeUserIdRef.current;
    try {
      const data = await apiFetch<SessionPayload>("/auth/session");
      if (background && activeUserIdRef.current !== startedForUserId) return null;
      if (activeUserIdRef.current && activeUserIdRef.current !== data.user.id) {
        queryClient.clear();
      }
      activeUserIdRef.current = data.user.id;
      await setOfflineUserScope(data.user.id);
      setUser(data.user);
      setTeam(data.team);
      setClaimedAthletes(data.claimedAthletes ?? []);
      setSessionError(null);
      setStatus("authenticated");
      if (localStorage.getItem(rememberedSessionKey) === "true") {
        localStorage.setItem(cachedSessionKey, JSON.stringify(data));
      } else {
        // Do not let the offline cache outlive a session that the user chose
        // not to remember. The server cookie remains the source of truth.
        localStorage.removeItem(cachedSessionKey);
      }
      return data;
    } catch (error) {
      if (background && activeUserIdRef.current !== startedForUserId) return null;
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setTeam(null);
        setClaimedAthletes([]);
        queryClient.clear();
        activeUserIdRef.current = null;
        localStorage.removeItem(cachedSessionKey);
        localStorage.removeItem(rememberedSessionKey);
        setSessionError(null);
        setStatus("unauthenticated");
        return null;
      }

      // A temporary background failure must not unmount the page or its drafts.
      if (background && activeUserIdRef.current) return null;

      // Distinguish service transport/connectivity failure (network drop,
      // timeout, 503) from invalid credentials so users can retry without
      // falsely treating active sessions as signed out.
      console.error("Failed to load the current session:", error);
      const cachedRaw =
        localStorage.getItem(rememberedSessionKey) === "true"
          ? localStorage.getItem(cachedSessionKey)
          : null;
      if (cachedRaw) {
        try {
          const cached = JSON.parse(cachedRaw) as SessionPayload;
          activeUserIdRef.current = cached.user.id;
          await setOfflineUserScope(cached.user.id);
          setUser(cached.user);
          setTeam(cached.team);
          setClaimedAthletes(cached.claimedAthletes ?? []);
          setSessionError("Offline mode: server permissions will be checked when changes synchronise.");
          setStatus("offline");
          return cached;
        } catch {
          localStorage.removeItem(cachedSessionKey);
        }
      }
      setSessionError(
        error instanceof Error
          ? error.message
          : "Authentication service is currently unavailable.",
      );
      setStatus("unavailable");
      return null;
    }
  }, [queryClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sessionUserId = user?.id;
  useEffect(() => {
    if (!sessionUserId) return;
    let pending = false;
    const refreshInBackground = () => {
      if (pending || !navigator.onLine || document.visibilityState === "hidden") return;
      pending = true;
      void refresh(true).finally(() => { pending = false; });
    };
    const interval = window.setInterval(refreshInBackground, 15_000);
    window.addEventListener("focus", refreshInBackground);
    window.addEventListener("online", refreshInBackground);
    document.addEventListener("visibilitychange", refreshInBackground);
    const unsubscribe = subscribeToDataChanges((path) => {
      if (/^\/(profile|teams|claims|team-invites)(\/|$)/.test(path)) refreshInBackground();
    });
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshInBackground);
      window.removeEventListener("online", refreshInBackground);
      document.removeEventListener("visibilitychange", refreshInBackground);
      unsubscribe();
    };
  }, [sessionUserId, refresh]);

  const signUp = useCallback(
    async (input: SignUpInput): Promise<SignUpResult> => {
      // Sign-up and verification auto-sign-in have no remember-me choice.
      localStorage.removeItem(rememberedSessionKey);
      localStorage.removeItem(cachedSessionKey);
      const data = await apiFetch<{ emailVerificationRequired: boolean }>(
        "/auth/sign-up",
        {
          method: "POST",
          body: JSON.stringify(input),
        },
      );

      // No session is issued until the address is verified, so there's
      // nothing to hydrate yet — skip the session fetch in that case.
      if (!data.emailVerificationRequired) {
        await refresh();
      }

      return { emailVerificationRequired: data.emailVerificationRequired };
    },
    [refresh],
  );

  const retrySession = useCallback(async () => {
    setStatus("loading");
    await refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      await apiFetch("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(input),
      });
      if (input.rememberMe) {
        localStorage.setItem(rememberedSessionKey, "true");
      } else {
        localStorage.removeItem(rememberedSessionKey);
        localStorage.removeItem(cachedSessionKey);
      }
      const session = await refresh();
      if (!session) {
        throw new Error(
          "Session verification failed. Please check your network connection and try again.",
        );
      }
    },
    [refresh],
  );

  const signInWithGoogle = useCallback(async (callbackPath = "/dashboard") => {
    // Google sign-in has no rememberMe option in Better Auth's social flow;
    // do not retain an offline session cache for it implicitly.
    localStorage.removeItem(rememberedSessionKey);
    localStorage.removeItem(cachedSessionKey);
    // OAuth returns to a dedicated page so the app can finish hydrating the
    // session before mounting protected routes.
    const safeCallbackPath =
      callbackPath.startsWith("/") &&
      !callbackPath.startsWith("//") &&
      !callbackPath.includes("\\")
        ? callbackPath
        : "/dashboard";
    sessionStorage.setItem("gaffer-google-callback-path", safeCallbackPath);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/oauth/callback`,
      errorCallbackURL: `${window.location.origin}/login?error=google`,
    });
  }, []);

  const signOut = useCallback(async (options?: {
    pendingData?: "retain" | "discard";
  }) => {
    try {
      await apiFetch("/auth/sign-out", { method: "POST" });
    } catch {
      // Clear client state even if server logout request fails.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    activeUserIdRef.current = null;
    if (options?.pendingData === "discard") await discardQueuedItems();
    await setOfflineUserScope(null);
    clearPendingClaimToken();
    localStorage.removeItem(cachedSessionKey);
    localStorage.removeItem(rememberedSessionKey);
    setUser(null);
    setTeam(null);
    setClaimedAthletes([]);
    setSessionError(null);
    setStatus("unauthenticated");
  }, [queryClient]);

  // Fire-and-forget from the caller's point of view: the backend always
  // returns success here regardless of whether the address has an account,
  // so there's nothing meaningful to branch on beyond network/validation
  // errors, which `apiFetch` still throws as an `ApiError`.
  //
  // `inviteToken`, when the resend happens mid-team-invite flow, makes the
  // fresh verification email route back to /join-team/:token as well.
  const resendVerificationEmail = useCallback(
    async (email: string, inviteToken?: string, inviteKind?: "team" | "competition") => {
      await apiFetch("/auth/send-verification-email", {
        method: "POST",
        body: JSON.stringify({ email, inviteToken, inviteKind }),
      });
    },
    [],
  );

  // Derived: coach (has team) > player (has claimed athletes) > new (neither).
  const accountKind: AccountKind = team
    ? "coach"
    : claimedAthletes.length > 0
      ? "player"
      : "new";

  const value = useMemo(
    () => ({
      status,
      user,
      team,
      claimedAthletes,
      accountKind,
      sessionError,
      retrySession,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      refreshSession: refresh,
      resendVerificationEmail,
    }),
    [
      status,
      user,
      team,
      claimedAthletes,
      accountKind,
      sessionError,
      retrySession,
      signUp,
      signIn,
      signInWithGoogle,
      signOut,
      refresh,
      resendVerificationEmail,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
