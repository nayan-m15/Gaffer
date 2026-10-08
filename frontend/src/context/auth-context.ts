import { createContext } from "react";

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
  rememberMe?: boolean;
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
  signInWithGoogle: (callbackPath?: string) => Promise<void>;
  signOut: (options?: { pendingData?: "retain" | "discard" }) => Promise<void>;
  refreshSession: () => Promise<SessionPayload | null>;
  resendVerificationEmail: (
    email: string,
    inviteToken?: string,
    inviteKind?: "team" | "competition",
  ) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

