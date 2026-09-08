import { useState, useEffect, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import signupBg from "@/assets/SignUp-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import {
  acceptTeamInvite,
  classifyInviteAcceptError,
  clearPendingTeamInviteToken,
  previewTeamInvite,
  storePendingTeamInviteToken,
  type TeamInvitePreview,
} from "@/services/team-invites";

type ViewMode = "sign-up" | "sign-in";

const INVALID_LINK_MESSAGE =
  "This invite link is no longer valid — ask your coach to send a new one.";

/**
 * JoinTeamPage — public route at /join-team/:token.
 *
 * An assistant opens this link from a coach-generated invite.  The page
 * previews the team name, then offers inline sign-up or sign-in.  On
 * success the invite is accepted and the browser navigates to the dashboard.
 *
 * Mirrors ClaimPage architecture: force dark theme, Shell wrapper,
 * FloatingLabelInput fields, identical auth handling.
 */
export default function JoinTeamPage() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();

  /* ── Preview state ─────────────────────────────────────────────────── */
  const [preview, setPreview] = useState<TeamInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);

  /* ── Auth state ────────────────────────────────────────────────────── */
  const { status: authStatus, user, signUp, signIn, signOut, refreshSession } =
    useAuth();
  const isSignedIn = authStatus === "authenticated";

  /* ── Form state ────────────────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState<ViewMode>("sign-up");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  /** Set when an accept failed with the email-mismatch 403 — drives the
   * sign-out-and-retry guidance rather than treating the invite as dead. */
  const [emailMismatch, setEmailMismatch] = useState(false);

  /* ── Force dark theme (mirrors ClaimPage / SignUpPage) ─────────────── */
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      if (!wasDark) root.classList.remove("dark");
    };
  }, []);

  /* ── Fetch preview on mount ────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    setPreviewLoading(true);
    previewTeamInvite(token)
      .then((data) => {
        if (cancelled) return;
        if (!data.valid) {
          setPreviewError(true);
        } else {
          setPreview(data);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewError(true);
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  /* ── Validation ────────────────────────────────────────────────────── */
  const validateSignUp = (): boolean => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.fullName = "Full name is required.";
    if (!email.trim()) {
      next.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Please enter a valid email address.";
    }
    if (!password) {
      next.password = "Password is required.";
    } else if (password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }
    if (!confirmPassword) {
      next.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      next.confirmPassword = "Passwords do not match.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateSignIn = (): boolean => {
    const next: Record<string, string> = {};
    if (!email.trim()) {
      next.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      next.email = "Please enter a valid email address.";
    }
    if (!password) next.password = "Password is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ── Accept the invite after auth is settled ──────────────────────── */
  const doAccept = async () => {
    try {
      await acceptTeamInvite(token);
      // The invitation is consumed — drop any persisted copy so the resumer
      // and dashboard stop treating it as pending.
      clearPendingTeamInviteToken();
      await refreshSession();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong accepting the invite. Please try again.";
      const kind = classifyInviteAcceptError(err);

      if (kind === "email-mismatch") {
        // Signed in as a different account than the invited email. Keep the
        // invitation fully recoverable — persist the token and guide the
        // user to sign out and sign in with the invited email. The invite
        // URL itself also stays right here in the address bar.
        storePendingTeamInviteToken(token);
        setEmailMismatch(true);
      } else {
        setEmailMismatch(false);
        if (kind === "definitive") {
          clearPendingTeamInviteToken();
        } else {
          // Transient failure: keep the invitation context so the user (or
          // the resumer, on a later sign-in) can retry without losing it.
          storePendingTeamInviteToken(token);
        }
      }
      setFormError(message);
    }
  };

  /* ── Handlers ──────────────────────────────────────────────────────── */
  const handleSignUp = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateSignUp()) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      const { emailVerificationRequired } = await signUp({
        name: fullName,
        email,
        password,
        // Riding the invite token along makes the verification email land
        // the user back on this page once they click the link.
        inviteToken: token,
      });
      if (emailVerificationRequired) {
        storePendingTeamInviteToken(token);
        navigate("/verify-email", {
          replace: true,
          state: { email, inviteToken: token },
        });
        return;
      }
      await doAccept();
    } catch (err) {
      if (err instanceof ApiError && /email/i.test(err.message)) {
        setErrors((prev) => ({ ...prev, email: err.message }));
      } else {
        const message =
          err instanceof ApiError
            ? err.message
            : "Something went wrong creating your account. Please try again.";
        setFormError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validateSignIn()) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await signIn({ email, password });
      await doAccept();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong signing in. Please try again.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAlreadySignedInAccept = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFormError(null);
    await doAccept();
    setIsSubmitting(false);
  };

  /* ── Email-mismatch recovery: sign out, stay on the invite, sign in
   * again with the email the coach actually invited. ────────────────── */
  const handleSignOutAndRetry = async () => {
    setIsSubmitting(true);
    setFormError(null);
    try {
      await signOut();
      // The invitation survives in this page's URL and localStorage — only
      // the wrong-account session goes away. The auth forms below are where
      // the invited email signs in.
      setViewMode("sign-in");
      setEmail("");
      setPassword("");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong signing you out. Please try again.";
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ── Render: loading ──────────────────────────────────────────────── */
  if (previewLoading) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 py-12 text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
          <p className="text-sm">Checking your invite link…</p>
        </div>
      </Shell>
    );
  }

  /* ── Render: invalid link ──────────────────────────────────────────── */
  if (previewError || !preview?.valid) {
    return (
      <Shell>
        <div className="py-8 text-center">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {INVALID_LINK_MESSAGE}
          </p>
        </div>
      </Shell>
    );
  }

  const teamName = preview.teamName ?? "the team";

  /* ── Render: already signed in — confirm accept ────────────────────── */
  if (isSignedIn) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-6 py-4 text-center">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Assistant Invite
            </p>
            <h1 className="text-xl font-bold text-foreground">{teamName}</h1>
          </div>

          <p className="text-sm leading-relaxed text-muted-foreground">
            You're signed in — confirm below to join as an assistant.
          </p>

          {formError && (
            <div role="alert" className="space-y-3 text-center">
              <p className="text-sm text-destructive">{formError}</p>
              {emailMismatch && (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    You&apos;re signed in as{" "}
                    <span className="font-medium text-foreground">{user?.email}</span>,
                    but this invite was issued to a different email address.
                    Sign out and sign in with the invited email to join{" "}
                    {teamName}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isSubmitting}
                    onClick={() => void handleSignOutAndRetry()}
                  >
                    Sign out and use the invited email
                  </Button>
                </>
              )}
            </div>
          )}

          <form onSubmit={(e) => void handleAlreadySignedInAccept(e)} className="w-full">
            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full"
            >
              {isSubmitting ? "Joining…" : `Join ${teamName}`}
            </Button>
          </form>
        </div>
      </Shell>
    );
  }

  /* ── Render: auth forms ────────────────────────────────────────────── */
  return (
    <Shell>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Assistant Invite
          </p>
          <h1 className="mt-1 text-xl font-bold text-foreground">{teamName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {viewMode === "sign-up"
              ? "Create your account to join as an assistant."
              : "Sign in to accept the assistant invite."}
          </p>
        </div>

        {/* Tab toggle */}
        <div className="flex rounded-lg border border-border bg-background p-1">
          <button
            type="button"
            onClick={() => { setViewMode("sign-up"); setErrors({}); setFormError(null); }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "sign-up"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => { setViewMode("sign-in"); setErrors({}); setFormError(null); }}
            className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
              viewMode === "sign-in"
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign In
          </button>
        </div>

        {formError && (
          <p role="alert" className="text-sm text-destructive">{formError}</p>
        )}

        {emailMismatch && (
          <div
            role="alert"
            className="rounded-lg border border-border bg-secondary/40 p-3 text-sm leading-relaxed text-muted-foreground"
          >
            This invite was issued to a different email address. Sign in — or
            create an account — with the email address your coach invited to
            join {teamName}.
          </div>
        )}

        {/* ── Sign-up form ────────────────────────────────────────────── */}
        {viewMode === "sign-up" && (
          <form onSubmit={(e) => void handleSignUp(e)} className="flex flex-col gap-4">
            <div>
              <FloatingLabelInput
                id="jt-fullName"
                label="Full name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
              {errors.fullName && (
                <p className="mt-1 text-xs text-destructive">{errors.fullName}</p>
              )}
            </div>
            <div>
              <FloatingLabelInput
                id="jt-email"
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="relative">
              <FloatingLabelInput
                id="jt-password"
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password}</p>
              )}
            </div>
            <div className="relative">
              <FloatingLabelInput
                id="jt-confirmPassword"
                label="Confirm password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showConfirmPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              {errors.confirmPassword && (
                <p className="mt-1 text-xs text-destructive">{errors.confirmPassword}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Creating account…" : "Create Account & Join"}
            </Button>
          </form>
        )}

        {/* ── Sign-in form ────────────────────────────────────────────── */}
        {viewMode === "sign-in" && (
          <form onSubmit={(e) => void handleSignIn(e)} className="flex flex-col gap-4">
            <div>
              <FloatingLabelInput
                id="jt-si-email"
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-xs text-destructive">{errors.email}</p>
              )}
            </div>
            <div className="relative">
              <FloatingLabelInput
                id="jt-si-password"
                label="Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/3 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
              {errors.password && (
                <p className="mt-1 text-xs text-destructive">{errors.password}</p>
              )}
            </div>

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? "Signing in…" : "Sign In & Join"}
            </Button>
          </form>
        )}
      </div>
    </Shell>
  );
}

/* ── Shell wrapper (mirrors ClaimPage) ───────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-background">
      {/* Dugout background layer */}
      <img
        src={signupBg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="animate-fade-in pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none lg:object-right"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/75 via-background/35 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-background/5"
      />

      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-8 sm:ml-[8%] md:ml-[12%] lg:ml-[15%]">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>

        <div className="rounded-xl border border-border bg-card p-8 shadow-lg sm:p-10">
          {/* Brand header */}
          <div className="mb-6 flex flex-col items-center gap-2">
            <SportLogo className="h-8 text-foreground" />
            <span className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground">
              Gaffer
            </span>
          </div>

          {children}
        </div>
      </div>
    </main>
  );
}
