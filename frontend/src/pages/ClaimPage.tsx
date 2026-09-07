import { useState, useEffect, useId, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";

import signupBg from "@/assets/SignUp-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import {
  acceptClaim,
  previewClaim,
  storePendingClaimToken,
  type ClaimPreview,
} from "@/services/claims";

type ViewMode = "sign-up" | "sign-in";

const INVALID_LINK_MESSAGE =
  "This invite link is no longer valid — ask your coach to send a new one.";

const CONSENT_LABEL =
  "I confirm I am the player named above, or their parent/guardian, and consent to this account accessing their sport data.";

/**
 * ClaimPage — public route at /claim/:token.
 *
 * A player opens this link from a coach-generated invite.  The page previews
 * the athlete/team, then offers inline sign-up or sign-in.  On success the
 * claim is accepted and the browser navigates to the player dashboard.
 *
 * Styling mirrors SignUpPage: forced dark theme, SportLogo + GAFFER header,
 * card container, FloatingLabelInput fields, and identical consent checkbox.
 */
export default function ClaimPage() {
  const { token = "" } = useParams<{ token: string }>();

  /* ── Preview state ─────────────────────────────────────────────────── */
  const [preview, setPreview] = useState<ClaimPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState(false);

  /* ── Auth state ────────────────────────────────────────────────────── */
  const { status: authStatus, signUp, signIn, refreshSession } = useAuth();
  const isSignedIn = authStatus === "authenticated";

  /* ── Form state ────────────────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState<ViewMode>("sign-up");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const baseId = useId();
  const fullNameErrorId = `${baseId}-fullName-error`;
  const emailErrorId = `${baseId}-email-error`;
  const passwordErrorId = `${baseId}-password-error`;
  const confirmPasswordErrorId = `${baseId}-confirmPassword-error`;
  const consentErrorId = `${baseId}-consent-error`;
  const navigate = useNavigate();

  /* ── Force dark theme (mirrors SignUpPage) ─────────────────────────── */
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
    previewClaim(token)
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

  /* ── Validation (sign-up only) ─────────────────────────────────────── */
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
    if (!consentAccepted) {
      next.consent = "You must confirm consent to continue.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /* ── Validation (sign-in) ──────────────────────────────────────────── */
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

  /* ── Accept the claim after auth is settled ────────────────────────── */
  const doAccept = async () => {
    try {
      await acceptClaim(token);
      await refreshSession();
      // Player dashboard doesn't exist yet (later commit) — redirect there
      // so the network tab shows the accept call succeeded.
      window.location.href = "/player/dashboard";
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong accepting the invite. Please try again.";
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
      });
      if (emailVerificationRequired) {
        storePendingClaimToken(token);
        navigate("/verify-email", { replace: true, state: { email } });
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

  const handleConfirmAccept = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!consentAccepted) {
      setErrors({ consent: "You must confirm consent to continue." });
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    setFormError(null);
    await doAccept();
    setIsSubmitting(false);
  };

  /* ── Render: loading ───────────────────────────────────────────────── */
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

  const athleteLabel = `${preview.athlete!.firstName} ${preview.athlete!.lastName}`;
  const teamLabel = preview.athlete!.teamName;

  /* ── Render: already signed in — confirm screen ────────────────────── */
  if (isSignedIn) {
    return (
      <Shell>
        <PreviewHeader athleteLabel={athleteLabel} teamLabel={teamLabel} />

        <form
          onSubmit={(e) => void handleConfirmAccept(e)}
          noValidate
          className="flex flex-col gap-5"
        >
          <p className="text-sm leading-relaxed text-muted-foreground">
            You&apos;re signed in. Confirm below to claim this profile as
            yourself.
          </p>

          <ConsentCheckbox
            baseId={baseId}
            checked={consentAccepted}
            onChange={setConsentAccepted}
            error={errors.consent}
            errorId={consentErrorId}
          />

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full font-semibold tracking-wide"
          >
            {isSubmitting ? "CLAIMING…" : "CLAIM MY PROFILE"}
          </Button>
        </form>
      </Shell>
    );
  }

  /* ── Render: sign-up / sign-in ─────────────────────────────────────── */
  return (
    <Shell>
      <PreviewHeader athleteLabel={athleteLabel} teamLabel={teamLabel} />

      {viewMode === "sign-up" ? (
        <form
          onSubmit={(e) => void handleSignUp(e)}
          noValidate
          className="flex flex-col gap-5"
        >
          {/* Full name */}
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-fullName`}
              label="Full name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoComplete="name"
              required
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? fullNameErrorId : undefined}
            />
            {errors.fullName && (
              <p id={fullNameErrorId} className="text-xs text-destructive">
                {errors.fullName}
              </p>
            )}
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-email`}
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? emailErrorId : undefined}
            />
            {errors.email && (
              <p id={emailErrorId} className="text-xs text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-password`}
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? passwordErrorId : undefined}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              }
            />
            {errors.password && (
              <p id={passwordErrorId} className="text-xs text-destructive">
                {errors.password}
              </p>
            )}
          </div>

          {/* Confirm password */}
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-confirmPassword`}
              label="Confirm password"
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword ? confirmPasswordErrorId : undefined
              }
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((p) => !p)}
                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={
                    showConfirmPassword ? "Hide confirm password" : "Show confirm password"
                  }
                >
                  {showConfirmPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              }
            />
            {errors.confirmPassword && (
              <p
                id={confirmPasswordErrorId}
                className="text-xs text-destructive"
              >
                {errors.confirmPassword}
              </p>
            )}
          </div>

          {/* Consent checkbox — sign-up branch only */}
          <ConsentCheckbox
            baseId={baseId}
            checked={consentAccepted}
            onChange={setConsentAccepted}
            error={errors.consent}
            errorId={consentErrorId}
          />

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full font-semibold tracking-wide"
          >
            {isSubmitting ? "JOINING…" : "CLAIM MY PROFILE"}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={(e) => void handleSignIn(e)}
          noValidate
          className="flex flex-col gap-5"
        >
          {/* Email */}
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-email`}
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? emailErrorId : undefined}
            />
            {errors.email && (
              <p id={emailErrorId} className="text-xs text-destructive">
                {errors.email}
              </p>
            )}
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-password`}
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? passwordErrorId : undefined}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              }
            />
            {errors.password && (
              <p id={passwordErrorId} className="text-xs text-destructive">
                {errors.password}
              </p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-destructive">
              {formError}
            </p>
          )}

          <Button
            type="submit"
            size="lg"
            disabled={isSubmitting}
            className="w-full font-semibold tracking-wide"
          >
            {isSubmitting ? "SIGNING IN…" : "SIGN IN & CLAIM"}
          </Button>
        </form>
      )}

      {/* ── Toggle between sign-up / sign-in ─────────────────────────── */}
      <div className="my-6 flex items-center gap-3" role="separator">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
          or
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <div className="text-center text-sm text-muted-foreground">
        {viewMode === "sign-up" ? (
          <p>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setViewMode("sign-in");
                setErrors({});
                setFormError(null);
              }}
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Sign in
            </button>
          </p>
        ) : (
          <p>
            Don&apos;t have an account?{" "}
            <button
              type="button"
              onClick={() => {
                setViewMode("sign-up");
                setErrors({});
                setFormError(null);
              }}
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Sign up
            </button>
          </p>
        )}
      </div>
    </Shell>
  );
}

/* ── Private sub-components ─────────────────────────────────────────────── */

/**
 * Shell — page wrapper matching SignUpPage's layout: background, overlays,
 * back-to-home link, and card container.
 */
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
          <div className="mb-8 flex flex-col items-center gap-2.5">
            <SportLogo size={56} className="rounded-lg" />
            <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
              GAFFER
            </h1>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-brand">
              LIVE SIDELINE ASSISTANT
            </p>
          </div>

          {children}
        </div>
      </div>
    </main>
  );
}

/** Athlete/team preview shown above the forms. */
function PreviewHeader({
  athleteLabel,
  teamLabel,
}: {
  athleteLabel: string;
  teamLabel: string;
}) {
  return (
    <div className="mb-6 rounded-lg border border-border bg-background p-4 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Claim your profile
      </p>
      <p className="mt-1 text-lg font-bold text-foreground">{athleteLabel}</p>
      <p className="text-sm font-medium text-brand">{teamLabel}</p>
    </div>
  );
}

/** Consent checkbox — identical styling to SignUpPage's terms block. */
function ConsentCheckbox({
  baseId,
  checked,
  onChange,
  error,
  errorId,
}: {
  baseId: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  errorId: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-start gap-3">
        <input
          id={`${baseId}-consent`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-card accent-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
        />
        <label
          htmlFor={`${baseId}-consent`}
          className="cursor-pointer text-sm leading-relaxed text-muted-foreground"
        >
          {CONSENT_LABEL}
        </label>
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
