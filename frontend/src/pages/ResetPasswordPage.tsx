import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import dugoutBg from "@/assets/dugout-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { PasswordRequirements } from "@/components/ui/password-requirements";
import { ApiError } from "@/lib/api";
import { getNewPasswordValidationError } from "@/lib/password-policy";
import { resetPassword } from "@/services/password-reset";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const invalidFromLink = searchParams.get("error") === "INVALID_TOKEN";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    invalidFromLink ? "This password reset link is invalid or has expired." : null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(
    () => Boolean(token) && Boolean(newPassword) && Boolean(confirmPassword),
    [token, newPassword, confirmPassword],
  );

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

    if (!token) {
      setError("This password reset link is invalid or has expired.");
      return;
    }

    const validationError = getNewPasswordValidationError(newPassword);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const message = err.message.toLowerCase();
        if (message.includes("token") || message.includes("expired")) {
          setError("This password reset link is invalid or has expired. Request a new one and try again.");
        } else {
          setError(err.message);
        }
      } else {
        setError("Couldn't reset your password. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const passwordToggle = (visible: boolean, toggle: () => void, label: string) => (
    <button
      type="button"
      onClick={toggle}
      className="rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
    >
      {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
    </button>
  );

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

      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-8 sm:ml-[8%] md:ml-[12%] lg:ml-[15%]">
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
              CHOOSE A NEW PASSWORD
            </h1>
            <p className="text-sm text-muted-foreground">
              Your new password must meet every security requirement below.
            </p>
          </div>

          {!token || invalidFromLink ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <ShieldCheck className="size-6" />
              </div>
              <p role="alert" className="text-sm leading-6 text-destructive">
                This password reset link is invalid or has expired.
              </p>
              <Button asChild className="w-full">
                <Link to="/forgot-password">Request a new reset link</Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <FloatingLabelInput
                label="New password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setError(null);
                }}
                autoComplete="new-password"
                required
                rightSlot={passwordToggle(showNewPassword, () => setShowNewPassword((value) => !value), "new password")}
              />

              <PasswordRequirements password={newPassword} />

              <FloatingLabelInput
                label="Confirm new password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setError(null);
                }}
                autoComplete="new-password"
                required
                rightSlot={passwordToggle(showConfirmPassword, () => setShowConfirmPassword((value) => !value), "confirmed password")}
              />

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" disabled={isSubmitting || !canSubmit} className="w-full font-semibold tracking-wide">
                {isSubmitting ? "RESETTING…" : "RESET PASSWORD"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
