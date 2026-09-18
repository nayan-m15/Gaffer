import {
  createContext,
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
import { clearPendingClaimToken } from "@/services/claims";
import { setOfflineUserScope } from "@/offline/match-store";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
}

export interface SessionTeam {
  id: string;
  name: string;
  role: "coach" | "assistant";
  primaryColor: string | null;
}

/**
 * A single athlete row the signed-in user has claimed as themselves.
 * Returned by `GET /auth/session` alongside `user` and `team`.
 */
export interface ClaimedAthleteSummary {
  id: string;
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
}

export type AccountKind = "coach" | "player" | "new";

export type AuthStatus =
  | "loading"
  | "authenticated"
  | "offline"
  | "unauthenticated"
  | "unavailable";

/** Payload of `GET /auth/session` — what `refreshSession` resolves to. */
export interface SessionPayload {
  user: SessionUser;
  team: SessionTeam | null;
  claimedAthletes: ClaimedAthleteSummary[];
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
  /**
   * Team-invite token when the sign-up originates from /join-team/:token —
   * makes the verification email land the user back on the invite.
   */
  inviteToken?: string;
  inviteKind?: "team" | "competition";
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpResult {
  /**
   * True when the account was created but no session was issued because the
   * address still needs to be verified (email/password sign-up). False for
   * Google sign-up, which is auto-verified and signs in immediately.
   */
  emailVerificationRequired: boolean;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  team: SessionTeam | null;
  claimedAthletes: ClaimedAthleteSummary[];
  /** Derived account type: coach (has team), player (has claimed athletes), new (neither). */
  accountKind: AccountKind;
  sessionError: string | null;
  retrySession: () => Promise<void>;
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<SessionPayload | null>;
  resendVerificationEmail: (
    email: string,
    inviteToken?: string,
    inviteKind?: "team" | "competition",
  ) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

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

  const refresh = useCallback(async (): Promise<SessionPayload | null> => {
    try {
      const data = await apiFetch<SessionPayload>("/auth/session");
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
      localStorage.setItem(cachedSessionKey, JSON.stringify(data));
      return data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setTeam(null);
        setClaimedAthletes([]);
        queryClient.clear();
        activeUserIdRef.current = null;
        localStorage.removeItem(cachedSessionKey);
        setSessionError(null);
        setStatus("unauthenticated");
        return null;
      }

      // Distinguish service transport/connectivity failure (network drop,
      // timeout, 503) from invalid credentials so users can retry without
      // falsely treating active sessions as signed out.
      console.error("Failed to load the current session:", error);
      const cachedRaw = localStorage.getItem(cachedSessionKey);
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

  const signUp = useCallback(
    async (input: SignUpInput): Promise<SignUpResult> => {
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
      const session = await refresh();
      if (!session) {
        throw new Error(
          "Session verification failed. Please check your network connection and try again.",
        );
      }
    },
    [refresh],
  );

  const signInWithGoogle = useCallback(async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/dashboard`,
      errorCallbackURL: `${window.location.origin}/login?error=google`,
    });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await apiFetch("/auth/sign-out", { method: "POST" });
    } catch {
      // Clear client state even if server logout request fails.
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    activeUserIdRef.current = null;
    await setOfflineUserScope(null);
    clearPendingClaimToken();
    localStorage.removeItem(cachedSessionKey);
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
