import { useState, useEffect, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";

import dugoutBg from "@/assets/dugout-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { GoogleSignInButton } from "@/components/ui/google-sign-in-button";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

/**
 * LoginPage — Pitchside authentication page.
 *
 * Forces the dark theme on mount so the login experience is always consistent
 * regardless of the visitor's previously chosen theme.  The original theme is
 * restored on unmount.
 *
 * The form exposes email / password fields, a "Sign in with Google" button
 * (replacing the earlier command-role selector), and a primary "SIGN IN TO
 * DUGOUT" submit action.  No authentication logic is wired up yet — the
 * handlers are clean boundaries ready for a future auth integration.
 */
export default function LoginPage() {
  /* ── Form state ──────────────────────────────────────────────────────── */
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent">(
    "idle",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const { signIn, signInWithGoogle, resendVerificationEmail } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawFrom = (location.state as { from?: string | { pathname?: string } } | null)?.from;
  const from =
    typeof rawFrom === "string"
      ? rawFrom
      : typeof rawFrom === "object" && rawFrom?.pathname
        ? rawFrom.pathname
        : "/dashboard";
  
  
  const errorParam = searchParams.get("error");
  const verifiedParam = searchParams.get("verified");

  useEffect(() => {
    if (errorParam === "google") {
      setError(
        "That Google account's email is already registered. Sign in with your password instead, or contact support to link it.",
      );
    }
    if (verifiedParam === "1") {
      setNotice("Email verified — you can sign in now.");
    }
  }, [errorParam, verifiedParam]);

  /* ── Force dark theme for the login page ─────────────────────────────── */
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

  /* ── Handlers ────────────────────────────────────────────────────────── */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setNeedsVerification(false);
    setIsSubmitting(true);

    try {
      await signIn({ email, password });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setNeedsVerification(true);
        setError(
          "Your email isn't verified yet. Check your inbox for the verification link, or resend it below.",
        );
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : "Something went wrong signing you in. Please try again.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    setResendStatus("sending");
    try {
      await resendVerificationEmail(email);
      setResendStatus("sent");
    } catch (err) {
      console.error("Failed to resend the verification email:", err);
      setResendStatus("idle");
      setError("Couldn't resend the verification email. Please try again.");
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error("Google sign-in failed:", err);
      setIsGoogleLoading(false);
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't start Google sign-in. Please try again.",
      );
    }
  };

  /* ── Render ──────────────────────────────────────────────────────────── */
  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-background">
      {/* ── Dugout background layer ─────────────────────────────────────── */}
      <img
        src={dugoutBg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="animate-fade-in pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none lg:object-right"
      />

      {/* ── Readability overlays ────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-background/15"
      />

      {/* ── Login card ───────────────────────────────────────────────── */}
      <div className="relative z-10 mx-auto w-full max-w-sm px-4 py-8 sm:ml-[8%] md:ml-[12%] lg:ml-[15%]">
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg sm:p-10">
          {/* ── Brand header ─────────────────────────────────────────── */}
          <div className="mb-8 flex flex-col items-center gap-2.5">
            <SportLogo size={56} className="rounded-lg" />

            <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
              GAFFER
            </h1>

            <p className="text-[11px] font-semibold tracking-[0.2em] text-brand">
              LIVE SIDELINE ASSISTANT
            </p>
          </div>

          {/* ── Email / password form ────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <FloatingLabelInput
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <FloatingLabelInput
              label="Password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
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

            {notice && !error && (
              <p role="status" className="text-sm text-brand">
                {notice}
              </p>
            )}

            {error && (
              <div role="alert" className="space-y-2">
                <p className="text-sm text-destructive">{error}</p>
                {needsVerification && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={resendStatus === "sending" || resendStatus === "sent"}
                    onClick={handleResendVerification}
                  >
                    {resendStatus === "sent"
                      ? "Verification email sent"
                      : resendStatus === "sending"
                        ? "Sending…"
                        : "Resend verification email"}
                  </Button>
                )}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              disabled={isSubmitting}
              className="w-full font-semibold tracking-wide"
            >
              {isSubmitting ? "SIGNING IN…" : "SIGN IN TO DUGOUT"}
            </Button>
          </form>

          {/* ── Divider ──────────────────────────────────────────────── */}
          <div className="my-6 flex items-center gap-3" role="separator">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              or
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* ── Google sign-in ───────────────────────────────────────── */}
          <GoogleSignInButton
            onClick={handleGoogleSignIn}
            isLoading={isGoogleLoading}
            disabled={isSubmitting}
          />
        </div>

        {/* ── Footer navigation ───────────────────────────────────────── */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            to="/signup"
            className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            Register
          </Link>
        </p>
      </div>
    </main>
  );
}
