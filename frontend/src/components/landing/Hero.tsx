import { ArrowRight, BarChart3, LogIn } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

/** Primary marketing content displayed directly over the cinematic scene. */
export function Hero() {
  return (
    <section
      aria-labelledby="hero-heading"
      className="relative isolate flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center overflow-hidden bg-transparent pb-12"
    >
      <div className="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1
            id="hero-heading"
            className="landing-scene-copy font-display text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-[3.5rem] xl:text-6xl animate-fade-in-up"
          >
            {brand.tagline}
          </h1>

          <p className="landing-scene-copy-secondary mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg animate-fade-in-up animation-delay-150">
            {brand.description}
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center animate-fade-in-up animation-delay-300">
            <a
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-brand text-brand-foreground font-semibold shadow-lg shadow-black/25 hover:bg-brand-dark sm:w-auto",
              )}
            >
              Get Started
              <ArrowRight className="size-4" />
            </a>

            <a
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full gap-2 border-border-strong sm:w-auto",
              )}
            >
              <LogIn className="size-4" />
              Log In
            </a>

            <a
              href="/public-dashboard"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "landing-scene-accent w-full gap-2 hover:bg-black/35 hover:text-[var(--landing-scene-foreground)] sm:w-auto",
              )}
            >
              <BarChart3 className="size-4" />
              Public Dashboard
            </a>
          </div>

          <p className="landing-scene-copy-muted mt-5 text-xs animate-fade-in-up animation-delay-450">
            Free to get started — no credit card required.
          </p>
        </div>
      </div>

      <a
        href="#philosophy"
        className="landing-scene-copy-muted absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 text-[10px] font-mono tracking-widest uppercase transition-colors hover:text-[var(--landing-scene-foreground)] sm:text-xs animate-bounce-slow"
        aria-label="Scroll to explore"
      >
        <span>Scroll to enter</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </a>
    </section>
  );
}
