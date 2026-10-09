import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Mail, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "react-router-dom";

import dugoutBg from "@/assets/dugout-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { ApiError } from "@/lib/api";
import { requestPasswordReset } from "@/services/password-reset";

export default function ForgotPasswordPage() {
  const location = useLocation();
  const initialEmail =
    (location.state as { email?: string } | null)?.email?.trim() ?? "";

  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      if (!wasDark) root.classList.remove("dark");
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await requestPasswordReset(email.trim());
      setSent(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't request a password reset. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-background">
      <img
        src={dugoutBg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="animate-fade-in pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none lg:object-right"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/15" />

      <div className="relative z-10 mx-auto w-full max-w-sm px-4 py-8 sm:ml-[8%] md:ml-[12%] lg:ml-[15%]">
        <Link
          to="/login"
          className="mb-4 inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:bg-card/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" />
          Back to sign in
        </Link>

        <div className="rounded-xl border border-border bg-card p-8 shadow-lg sm:p-10">
          <div className="mb-8 flex flex-col items-center gap-2.5 text-center">
            <SportLogo size={56} className="rounded-lg" />
            <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
              RESET PASSWORD
            </h1>
            <p className="text-sm text-muted-foreground">
              Enter your account email and we&apos;ll send you a secure reset link.
            </p>
          </div>

          {sent ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-2">
                <h2 className="font-semibold text-foreground">Check your email</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  If an account exists for <span className="font-medium text-foreground">{email.trim()}</span>, we&apos;ve sent a password reset link. The link expires in 1 hour.
                </p>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">Return to sign in</Link>
              </Button>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setError(null);
                }}
                className="text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                Send another link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FloatingLabelInput
                label="Email address"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError(null);
                }}
                autoComplete="email"
                required
                rightSlot={<Mail className="size-4 text-muted-foreground" aria-hidden="true" />}
              />

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" disabled={isSubmitting} className="w-full font-semibold tracking-wide">
                {isSubmitting ? "SENDING…" : "SEND RESET LINK"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
