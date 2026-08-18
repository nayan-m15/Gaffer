import { useState, useEffect, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";

import dugoutBg from "@/assets/dugout-bg.png";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { GoogleSignInButton } from "@/components/ui/google-sign-in-button";

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
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // TODO: Connect to authentication service.
  };

  const handleGoogleSignIn = () => {
    // TODO: Connect to Google OAuth flow.
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

            <Button type="submit" size="lg" className="w-full font-semibold tracking-wide">
              SIGN IN TO DUGOUT
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
          <GoogleSignInButton onClick={handleGoogleSignIn} />
        </div>
      </div>
    </main>
  );
}
