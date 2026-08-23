import { useState, useEffect, useId, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import signupBg from "@/assets/signup-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { GoogleSignInButton } from "@/components/ui/google-sign-in-button";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * SignUpPage — Dugout registration page for new coaches and assistants.
 *
 * Forces dark theme on mount so the signup experience is always consistent.
 * The form collects the user's command role, name, email, password
 * and terms agreement.  The actual authentication integration is intentionally
 * left as a clean TODO boundary — the UI is fully wired and validated, ready
 * to be connected to the backend auth flow.
 */
export default function SignUpPage() {
  /* ── Form state ──────────────────────────────────────────────────────── */
  const [role, setRole] = useState<"coach" | "assistant">("coach");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { signUp, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  const baseId = useId();
  const fullNameErrorId = `${baseId}-fullName-error`;
  const emailErrorId = `${baseId}-email-error`;
  const passwordErrorId = `${baseId}-password-error`;
  const confirmPasswordErrorId = `${baseId}-confirmPassword-error`;
  const termsErrorId = `${baseId}-terms-error`;

  /* ── Force dark theme for the signup page ────────────────────────────── */
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");

    root.classList.add("dark");

    return () => {
      if (!wasDark) {
        root.classList.remove("dark");
      }
    };
  }, []);

  /* ── Validation ──────────────────────────────────────────────────────── */
  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!fullName.trim()) {
      nextErrors.fullName = "Full name is required.";
    }

    if (!email.trim()) {
      nextErrors.email = "Email address is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = "Please enter a valid email address.";
    }

    if (!password) {
      nextErrors.password = "Password is required.";
    } else if (password.length < 8) {
      nextErrors.password = "Password must be at least 8 characters.";
    }

    if (!confirmPassword) {
      nextErrors.confirmPassword = "Please confirm your password.";
    } else if (confirmPassword !== password) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }

    if (!termsAccepted) {
      nextErrors.terms = "You must agree to the terms to continue.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    // Sprint 1 only supports coaches registering and owning their own team —
    // the role selector above is left in place for the invite flow planned
    // for a later sprint, but every sign-up here creates the account as the
    // coach. A coach will be able to add teams on their dashboard once logged in.
    try {
      const { emailVerificationRequired } = await signUp({
        name: fullName,
        email,
        password,
      });
      if (emailVerificationRequired) {
        navigate("/verify-email", { replace: true, state: { email } });
      } else {
        navigate("/dashboard", { replace: true });
      }
    } catch (error) {
      if (error instanceof ApiError && /email/i.test(error.message)) {
        setErrors((prev) => ({ ...prev, email: error.message }));
      } else {
        const message =
          error instanceof ApiError
            ? error.message
            : "Something went wrong creating your account. Please try again.";
        setErrors((prev) => ({ ...prev, form: message }));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google sign-in failed:", err);
      const message =
        err instanceof ApiError
          ? err.message
          : "Couldn't start Google sign-in. Please try again.";
      setErrors((prev) => ({ ...prev, form: message }));
    }
  };

  /* ── Render helpers ──────────────────────────────────────────────────── */
  const roleOptions = [
    { value: "coach" as const, label: "Coach" },
    { value: "assistant" as const, label: "Assistant" },
  ];

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-background">
      {/* ── Dugout background layer ─────────────────────────────────────── */}
      <img
        src={signupBg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="animate-fade-in pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none lg:object-right"
    />

    {/* ── Readability overlays ────────────────────────────────────────── */}
    <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/75 via-background/35 to-transparent"
    />

    <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 bg-background/5"
    />

      {/* ── Signup card ─────────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-8 sm:ml-[8%] md:ml-[12%] lg:ml-[15%]">
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg sm:p-10">
          {/* ── Brand header ───────────────────────────────────────────── */}
          <div className="mb-8 flex flex-col items-center gap-2.5">
            <SportLogo size={56} className="rounded-lg" />

            <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
              GAFFER
            </h1>

            <p className="text-[11px] font-semibold tracking-[0.2em] text-brand">
              LIVE SIDELINE ASSISTANT
            </p>
          </div>

          {/* ── Signup form ────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
            {/* ── Command role selector ────────────────────────────────── */}
            <div className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Your command role
              </span>

              <div
                role="group"
                aria-label="Your command role"
                className="grid grid-cols-2 gap-3"
              >
                {roleOptions.map((option) => {
                  const selected = role === option.value;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setRole(option.value)}
                      className={cn(
                        "rounded-md border px-4 py-3 text-sm font-medium outline-none transition-all duration-200",
                        "focus-visible:ring-2 focus-visible:ring-ring/50",
                        selected
                          ? "border-brand bg-accent text-brand"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Full name ────────────────────────────────────────────── */}
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

            {/* ── Email address ────────────────────────────────────────── */}
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

            {/* ── Password ─────────────────────────────────────────────── */}
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
                    onClick={() => setShowPassword((prev) => !prev)}
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

            {/* ── Confirm password ─────────────────────────────────────── */}
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
                aria-describedby={errors.confirmPassword ? confirmPasswordErrorId : undefined}
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
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
                <p id={confirmPasswordErrorId} className="text-xs text-destructive">
                  {errors.confirmPassword}
                </p>
              )}
            </div>

            {/* ── Terms agreement ──────────────────────────────────────── */}
            <div className="space-y-1.5">
              <div className="flex items-start gap-3">
                <input
                  id={`${baseId}-terms`}
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-border bg-card accent-primary focus:ring-2 focus:ring-ring focus:ring-offset-0"
                  aria-invalid={!!errors.terms}
                  aria-describedby={errors.terms ? termsErrorId : undefined}
                />
                <label
                  htmlFor={`${baseId}-terms`}
                  className="cursor-pointer text-sm leading-relaxed text-muted-foreground"
                >
                  I agree to the{" "}
                  <span className="text-primary hover:underline">
                    Terms of Service
                  </span>{" "}
                  and{" "}
                  <span className="text-primary hover:underline">
                    Privacy Policy
                  </span>
                </label>
              </div>
              {errors.terms && (
                <p id={termsErrorId} className="text-xs text-destructive">
                  {errors.terms}
                </p>
              )}
            </div>

            {/* ── Form-level error ─────────────────────────────────────── */}
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}

            {/* ── Submit button ────────────────────────────────────────── */}
            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full font-semibold tracking-wide"
            >
              {isSubmitting ? "JOINING…" : "JOIN THE DUGOUT"}
            </Button>
          </form>

          {/* ── Divider ────────────────────────────────────────────────── */}
          <div className="my-6 flex items-center gap-3" role="separator">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ── Google signup ──────────────────────────────────────────── */}
          <GoogleSignInButton onClick={handleGoogleSignUp}>
            Sign up with Google
          </GoogleSignInButton>
        </div>

        {/* ── Footer navigation ───────────────────────────────────────── */}
        <div className="mt-6 space-y-2 text-center text-sm text-muted-foreground">
          <p>
            Have an invite code?{" "}
            <button
              type="button"
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              // TODO: Navigate to the team-invite flow when it exists.
            >
              Join an existing team instead
            </button>
          </p>
          <p>
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}