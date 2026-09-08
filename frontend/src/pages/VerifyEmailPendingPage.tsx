import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { MailCheck } from "lucide-react";

import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const RESEND_COOLDOWN_SECONDS = 60;

/**
 * VerifyEmailPendingPage — shown right after email/password sign-up, since
 * `requireEmailVerification` means no session exists yet at that point.
 *
 * Expects the email address via router state (set by SignUpPage). Landing
 * here directly without it (e.g. a bookmarked/shared link) redirects to
 * sign-up instead of rendering a blank "check your email for..." card.
 */
export default function VerifyEmailPendingPage() {
  const { resendVerificationEmail } = useAuth();
  const location = useLocation();
  const email = (location.state as { email?: string } | null)?.email;
  // JoinTeamPage passes the invite token along so a resend from here keeps
  // routing the verification email back to the invitation.
  const inviteToken = (location.state as { inviteToken?: string } | null)
    ?.inviteToken;

  const [status, setStatus] = useState<"idle" | "sending" | "error">("idle");
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!email) {
    return <Navigate to="/signup" replace />;
  }

  const handleResend = async () => {
    setStatus("sending");
    try {
      await resendVerificationEmail(email, inviteToken);
      setStatus("idle");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      timerRef.current = setInterval(() => {
        setCooldown((prev) => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      setStatus("error");
      console.error("Failed to resend the verification email:", err);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-8">
        <div className="rounded-xl border border-border bg-card p-8 text-center shadow-lg sm:p-10">
          <div className="mb-6 flex flex-col items-center gap-2.5">
            <SportLogo size={56} className="rounded-lg" />
            <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
              GAFFER
            </h1>
          </div>

          <MailCheck className="mx-auto mb-4 size-10 text-brand" aria-hidden="true" />

          <h2 className="text-lg font-semibold text-foreground">
            Check your email
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{email}</span>.
            Click it to finish setting up your account.
          </p>

          {inviteToken && (
            <p className="mt-2 text-sm text-muted-foreground">
              After verifying, you&apos;ll return to your team invitation to
              finish joining.
            </p>
          )}

          {status === "error" && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              Couldn't resend the email. Please try again.
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            className="mt-6 w-full"
            disabled={status === "sending" || cooldown > 0}
            onClick={handleResend}
          >
            {cooldown > 0
              ? `Resend link (${cooldown}s)`
              : status === "sending"
                ? "Sending…"
                : "Resend verification link"}
          </Button>

          <p className="mt-6 text-sm text-muted-foreground">
            Wrong email?{" "}
            <Link
              to="/signup"
              className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              Sign up again
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
