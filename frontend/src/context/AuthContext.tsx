import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError } from "@/lib/api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
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
  teamName: string;
}

export interface SignInInput {
  email: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  team: SessionTeam | null;
  signUp: (input: SignUpInput) => Promise<void>;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
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
    async (input: SignUpInput) => {
      await apiFetch("/auth/sign-up", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh();
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

  const signOut = useCallback(async () => {
    await apiFetch("/auth/sign-out", { method: "POST" });
    setUser(null);
    setTeam(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo(
    () => ({ status, user, team, signUp, signIn, signOut }),
    [status, user, team, signUp, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
