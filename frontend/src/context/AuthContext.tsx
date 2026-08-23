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

  const refresh = useCallback(async () => {
    try {
      const data = await apiFetch<{ user: SessionUser; team: SessionTeam | null }>(
        "/auth/session",
      );
      setUser(data.user);
      setTeam(data.team);
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
    setUser(null);
    setTeam(null);
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

    const value = useMemo(
      () => ({
        status,
        user,
        team,
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
