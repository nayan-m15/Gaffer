import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { clearPendingClaimToken } from "@/services/claims";

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

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
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
  signUp: (input: SignUpInput) => Promise<SignUpResult>;
  signIn: (input: SignInInput) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
  resendVerificationEmail: (email: string) => Promise<void>;
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
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<SessionUser | null>(null);
  const [team, setTeam] = useState<SessionTeam | null>(null);
  const [claimedAthletes, setClaimedAthletes] = useState<ClaimedAthleteSummary[]>([]);

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{
        user: SessionUser;
        team: SessionTeam | null;
        claimedAthletes: ClaimedAthleteSummary[];
      }>("/auth/session");
      setUser(data.user);
      setTeam(data.team);
      setClaimedAthletes(data.claimedAthletes ?? []);
      setStatus("authenticated");
    } catch (error) {
      // Treat "no session" (401) and "couldn't reach the API at all" (e.g.
      // the backend isn't running — a plain network error, not an ApiError)
      // the same way: fall back to signed-out rather than leaving `status`
      // stuck on "loading" forever, which would hang every protected page.
      if (!(error instanceof ApiError && error.status === 401)) {
        console.error("Failed to load the current session:", error);
      }
      setUser(null);
      setTeam(null);
      setClaimedAthletes([]);
      setStatus("unauthenticated");
    }
  }, []);

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

  const signIn = useCallback(
    async (input: SignInInput) => {
      await apiFetch("/auth/sign-in", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
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
    await apiFetch("/auth/sign-out", { method: "POST" });
    clearPendingClaimToken();
    setUser(null);
    setTeam(null);
    setClaimedAthletes([]);
    setStatus("unauthenticated");
  }, []);

  // Fire-and-forget from the caller's point of view: the backend always
  // returns success here regardless of whether the address has an account,
  // so there's nothing meaningful to branch on beyond network/validation
  // errors, which `apiFetch` still throws as an `ApiError`.
  const resendVerificationEmail = useCallback(async (email: string) => {
    await apiFetch("/auth/send-verification-email", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }, []);

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
