import { useEffect } from "react";
import { CheckCircle2, LogIn, ShieldCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import dugoutBg from "@/assets/dugout-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";

function friendlyVerificationError(code: string | null) {
  if (!code) return null;
  if (code === "TOKEN_EXPIRED") return "This verification link has expired. Start the email change again from your profile.";
  if (code === "INVALID_TOKEN") return "This verification link is invalid or has already been used.";
  return "We couldn't finish changing your email. Start the process again from your profile.";
}

export default function EmailChangeCompletePage() {
  const [searchParams] = useSearchParams();
  const newEmail = searchParams.get("email")?.trim() ?? "";
  const error = friendlyVerificationError(searchParams.get("error"));

  useEffect(() => {
    // The backend has already revoked every server session. Clear the two
    // client-side session caches as well so an old remembered/offline session
    // can never be presented after the security-sensitive email change.
    localStorage.removeItem("gaffer-offline-session");
    localStorage.removeItem("gaffer-remember-session");
    sessionStorage.removeItem("gaffer-google-callback-path");

    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.add("dark");
    return () => {
      if (!wasDark) root.classList.remove("dark");
    };
  }, []);

  return (
    <main className="relative flex min-h-screen items-center overflow-hidden bg-background">
      <img
        src={dugoutBg}
        alt=""
        aria-hidden="true"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center select-none lg:object-right"
      />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background via-background/60 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-background/15" />

      <div className="relative z-10 mx-auto w-full max-w-md px-4 py-8 sm:ml-[8%] md:ml-[12%] lg:ml-[15%]">
        <div className="rounded-xl border border-border bg-card p-8 shadow-lg sm:p-10">
          <div className="mb-8 flex flex-col items-center gap-2.5 text-center">
            <SportLogo size={56} className="rounded-lg" />
            <h1 className="mt-1 font-display text-2xl font-bold tracking-wide text-foreground">
              {error ? "EMAIL CHANGE FAILED" : "EMAIL CHANGED"}
            </h1>
          </div>

          {error ? (
            <div className="space-y-5 text-center">
              <p role="alert" className="text-sm leading-6 text-destructive">{error}</p>
              <Button asChild className="w-full">
                <Link to="/login">Go to sign in</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CheckCircle2 className="size-6" />
              </div>

              <div className="space-y-2">
                <h2 className="font-semibold text-foreground">Your new email is active</h2>
                <p className="text-sm leading-6 text-muted-foreground">
                  Your Gaffer account now uses{" "}
                  {newEmail ? (
                    <span className="font-medium text-foreground">{newEmail}</span>
                  ) : (
                    "your new email address"
                  )}.
                </p>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-left">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                <p className="text-xs leading-5 text-muted-foreground">
                  For security, you&apos;ve been signed out of Gaffer on every device. Sign in again with your new email and password, or choose Google using the Google account for the new email address.
                </p>
              </div>

              <Button asChild className="w-full gap-2">
                <Link to="/login">
                  <LogIn className="size-4" />
                  Sign in to Gaffer
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
