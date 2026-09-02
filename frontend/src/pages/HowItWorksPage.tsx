/**
 * HowItWorksPage — Informational onboarding page that explains how the
 * Sport Coaching Tool works.
 *
 * Sections:
 *   1. Hero / Introduction (always-dark cinematic treatment)
 *   2. Getting Started (5-step progression)
 *   3. Dashboard overview
 *   4. Athlete Roster Management
 *   5. Events Management
 *   6. Team & Lineup Management
 *   7. Coaching Workflow summary
 *   8. Final CTA
 *
 * Accessible as a section of the Home page (`/#how-it-works`). Uses the existing Navbar
 * and supports both light and dark modes via CSS variables from index.css.
 * Sections 2-8 respond to the visitor's theme; the Hero stays dark for a
 * cinematic landing feel.
 *
 * Animations:
 *   - Scroll-triggered section reveals (Intersection Observer)
 *   - Hover card lift effect on step and feature cards
 *   Both respect `prefers-reduced-motion` via the global media query.
 */

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Home,
  LayoutGrid,
  LogIn,
  MapPin,
  Shield,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 *  CONSTANTS
 * ═══════════════════════════════════════════════════════════════════════════ */

const STEPS = [
  {
    num: "01",
    title: "Set Up Your Team",
    desc: "Create your team and configure basic information to get started.",
  },
  {
    num: "02",
    title: "Build Your Roster",
    desc: "Add athletes, assign positions and jersey numbers, and maintain squad details.",
  },
  {
    num: "03",
    title: "Organise Events",
    desc: "Schedule matches, training sessions and meetings with dates, times and locations.",
  },
  {
    num: "04",
    title: "Prepare Your Lineup",
    desc: "Select your starting XI, choose a formation and position players on the pitch.",
  },
  {
    num: "05",
    title: "Coach & Track",
    desc: "Use the platform during your football activities to manage and track your team.",
  },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
 *  SCROLL-REVEAL HOOK
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Attaches an Intersection Observer to every `.animate-on-scroll` descendant
 * of the given ref. When an element enters the viewport the `is-visible` class
 * is added, triggering the CSS transition defined in index.css.
 */
function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = root.querySelectorAll<HTMLElement>(".animate-on-scroll");
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.15 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * HowItWorksSection — How It Works content as an embeddable section.
 *
 * Used by LandingPage to render the How It Works content inline within the
 * combined Home page. The stadium background uses `absolute` positioning
 * (instead of `fixed`) so it scrolls with the section rather than remaining
 * anchored to the viewport.
 */
export function HowItWorksSection() {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="scroll-mt-16 relative bg-[#0B1218] text-white"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <img
          src="/hero-stadium-bg.png"
          alt=""
          className="size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/15 to-black/45" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 via-transparent to-emerald-900/5" />
      </div>

      <div className="relative z-10">
        <HeroSection />
        <GettingStartedSection />
        <DashboardSection />
        <RosterSection />
        <EventsSection />
        <LineupSection />
        <WorkflowSection />
        <CtaSection />
      </div>
    </section>
  );
}

export default function HowItWorksPage() {
  const pageRef = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={pageRef} className="relative flex min-h-screen flex-col bg-[#0B1218] text-white">
      {/* ── Fixed stadium background ──────────────────────────────────────
       * The image and its overlays are anchored to the viewport with
       * `position: fixed`.  Every section scrolls *over* this single layer,
       * so the stadium is never duplicated.  Sections use semi-transparent
       * dark backgrounds to keep text readable while letting the photo
       * peek through at the edges and during scroll transitions.
       */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/hero-stadium-bg.png"
          alt=""
          className="size-full object-cover object-center"
        />
        {/* Dark gradient — heavier at top/bottom for legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/15 to-black/45" />
        {/* Radial vignette — focuses attention centre */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
        {/* Subtle brand-tinted wash */}
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 via-transparent to-emerald-900/5" />
      </div>

      <Navbar />

      <main className="relative z-10 flex-1">
        <HeroSection />
        <GettingStartedSection />
        <DashboardSection />
        <RosterSection />
        <EventsSection />
        <LineupSection />
        <WorkflowSection />
        <CtaSection />
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 1 — HERO / INTRODUCTION  (always dark for cinematic feel)
 * ═══════════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  return (
    <section
      aria-labelledby="hiw-heading"
      className="relative isolate flex min-h-[70svh] flex-col items-center justify-center overflow-hidden"
    >
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6 sm:pb-32 sm:pt-20 lg:px-8 lg:pb-40 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-5 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur-sm animate-fade-in">
            <span className="size-1.5 rounded-full bg-brand animate-pulse-subtle" />
            Getting Started Guide
          </span>

          <h1
            id="hiw-heading"
            className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white drop-shadow-lg sm:text-5xl lg:text-[3.5rem] xl:text-6xl animate-fade-in-up"
          >
            How It Works
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 drop-shadow-md sm:text-lg animate-fade-in-up animation-delay-150">
            Everything you need to organise, manage and coach your team, all
            in one place. From squad setup to matchday lineups, {brand.name}{" "}
            guides you through every step.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center animate-fade-in-up animation-delay-300">
            <a
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-brand text-brand-foreground font-semibold hover:bg-brand-light shadow-lg shadow-brand/20 sm:w-auto",
              )}
            >
              Get Started
              <ArrowRight className="size-4" />
            </a>
            <a
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full gap-2 border-white/20 bg-black/30 text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:w-auto",
              )}
            >
              <LogIn className="size-4" />
              Log In
            </a>
          </div>
        </div>
      </div>

      {/* Scroll-down indicator — bouncing chevron near bottom of viewport */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-slow" aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="28"
          height="28"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-white/50"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 2 — GETTING STARTED STEPS
 * ═══════════════════════════════════════════════════════════════════════════ */

function GettingStartedSection() {
  return (
    <section
      aria-labelledby="gs-heading"
      className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-16 backdrop-blur-sm sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="gs-heading"
            className="font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl lg:text-4xl"
          >
            Five Steps to Kick Off
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground dark:text-white/60 sm:text-base">
            Get your team up and running in minutes. Follow this simple
            progression to start coaching smarter.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-5 sm:mt-16">
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="hover-lift relative rounded-xl border dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-6 shadow-sm"
            >
              <span className="font-display text-3xl font-bold text-brand/30">
                {step.num}
              </span>
              <h3 className="mt-3 text-base font-semibold text-foreground dark:text-white">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground dark:text-white/60">
                {step.desc}
              </p>

              {/* Connector arrow — hidden on mobile, between cards on desktop */}
              {i < STEPS.length - 1 && (
                <ArrowRight
                  className="absolute -right-3 top-1/2 hidden size-4 -translate-y-1/2 text-brand/40 lg:block"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 3 — DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════ */

function DashboardSection() {
  return (
    <FeatureSection
      id="dashboard-heading"
      icon={<LayoutGrid className="size-5 text-brand" />}
      title="Your Command Centre"
      eyebrow="Dashboard"
      description="The Dashboard gives you a central overview of everything happening with your team. See active athlete counts, total events, and upcoming fixtures at a glance."
      bullets={[
        "View active athlete and total event counts at a glance",
        "See upcoming matches, training sessions and meetings",
        "Track event details — dates, times and locations",
        "Quick access to every major coaching function",
      ]}
      visual={<DashboardMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 4 — ATHLETE ROSTER MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function RosterSection() {
  return (
    <FeatureSection
      id="roster-heading"
      icon={<Users className="size-5 text-brand" />}
      title="Your Digital Squad"
      eyebrow="Roster"
      description="Build and maintain a complete digital roster. Add athletes, record their details, and keep your squad information organised and accessible."
      bullets={[
        "Add athletes with name, position and jersey number",
        "Search and filter your squad instantly",
        "View detailed athlete information at a glance",
        "Archive and restore players as your squad evolves",
      ]}
      visual={<RosterMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 5 — EVENTS MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function EventsSection() {
  return (
    <FeatureSection
      id="events-heading"
      icon={<Calendar className="size-5 text-brand" />}
      title="Never Miss a Session"
      eyebrow="Events"
      description="Organise every football activity from a single place. Create matches, training sessions and meetings with all the details your team needs."
      bullets={[
        "Create matches, training sessions and meetings",
        "Set dates, times and locations for every event",
        "View your full schedule at a glance",
        "Edit or cancel events as plans change",
      ]}
      visual={<EventsMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 6 — TEAM & LINEUP MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function LineupSection() {
  return (
    <FeatureSection
      id="lineup-heading"
      icon={<Shield className="size-5 text-brand" />}
      title="Build Your Starting XI"
      eyebrow="Team & Lineup"
      description="Prepare your team before every event. Select your starting eleven, choose a formation, position players on the pitch and manage substitutes — all through an interactive tactical board."
      bullets={[
        "Select 11 players for your starting lineup",
        "Exactly 1 goalkeeper is always required",
        "Choose from multiple formations (4-3-3, 4-4-2, 3-5-2 and more)",
        "Drag and drop players between the pitch and substitutes bench",
      ]}
      visual={<FormationMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 7 — COACHING WORKFLOW
 * ═══════════════════════════════════════════════════════════════════════════ */

function WorkflowSection() {
  return (
    <section
      aria-labelledby="workflow-heading"
      className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-16 backdrop-blur-sm sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="workflow-heading"
            className="font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl lg:text-4xl"
          >
            One Connected Workflow
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground dark:text-white/60 sm:text-base">
            Every part of {brand.name} works together. Your team, athletes,
            events and lineup are connected — so you can focus on coaching.
          </p>
        </div>

        {/* Desktop: horizontal flow — Mobile: vertical stack */}
        <div className="mt-12 flex flex-col items-center gap-4 sm:mt-16 lg:flex-row lg:justify-center lg:gap-0">
          {[
            { icon: Shield, label: "Team" },
            { icon: Users, label: "Athletes" },
            { icon: Calendar, label: "Events" },
            { icon: Home, label: "Lineup" },
            { icon: CheckCircle2, label: "Coach" },
          ].map((step, i, arr) => (
            <div key={step.label} className="flex items-center">
              <div className="hover-lift flex flex-col items-center gap-2">
                <div className="flex size-14 items-center justify-center rounded-full border dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] shadow-sm">
                  <step.icon className="size-6 text-brand" />
                </div>
                <span className="text-xs font-semibold text-foreground dark:text-white/60">
                  {step.label}
                </span>
              </div>
              {i < arr.length - 1 && (
                <ArrowRight
                  className="mx-2 hidden size-4 text-brand/40 lg:block"
                  aria-hidden="true"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 8 — FINAL CTA
 * ═══════════════════════════════════════════════════════════════════════════ */

function CtaSection() {
  return (
    <section className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-16 backdrop-blur-sm sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl border dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] p-8 text-center shadow-sm backdrop-blur-sm sm:p-12">
          <h2 className="font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">
            Ready to Take Command?
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground dark:text-white/60 sm:text-base">
            Join {brand.name} and start organising, managing and coaching your
            team — all from one place.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <a
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-brand text-brand-foreground font-semibold hover:bg-brand-light shadow-lg shadow-brand/20 sm:w-auto",
              )}
            >
              Get Started Free
              <ArrowRight className="size-4" />
            </a>
            <a
              href="/"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full gap-2 text-foreground backdrop-blur-sm sm:w-auto dark:border-white/20 dark:bg-black/30 dark:text-white dark:hover:bg-white/15 dark:hover:text-white",
              )}
            >
              Back to Home
            </a>
          </div>
          <p className="mt-4 text-xs text-foreground dark:text-white/40">
            Free to get started. No credit card required.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHARED — Feature Section (alternating text + visual layout)
 * ═══════════════════════════════════════════════════════════════════════════ */

function FeatureSection({
  id,
  icon,
  title,
  eyebrow,
  description,
  bullets,
  visual,
  reversed = false,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  eyebrow: string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-16 backdrop-blur-sm sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "grid items-center gap-10 lg:grid-cols-2 lg:gap-16",
            reversed && "lg:[&>*:first-child]:order-2",
          )}
        >
          {/* Text content */}
          <div>
            <div className="mb-4 flex items-center gap-2">
              {icon}
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-brand">
                {eyebrow}
              </span>
            </div>
            <h2
              id={id}
              className="font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl"
            >
              {title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-foreground dark:text-white/60 sm:text-base">
              {description}
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-3 text-sm text-foreground dark:text-white/60"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Visual */}
          <div className="flex justify-center lg:justify-end">
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  VISUAL MOCKUPS — lightweight representations of actual application UI
 *
 *  Mockups use a "terminal-style" dark card that looks good in both themes.
 *  This mirrors the actual app (which forces dark mode) and avoids the
 *  complexity of theming every nested element.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Dashboard Mockup ──────────────────────────────────────────────────── */

function DashboardMockup() {
  return (
    <MockupFrame className="hover-lift">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">
          Dashboard
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-white/30">
          <span className="size-1.5 rounded-full bg-brand" />
          Sideline Inactive
        </span>
      </div>

      {/* Stat cards */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded bg-brand/10">
              <Users className="size-3.5 text-brand" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-white">&mdash;</p>
              <p className="text-[10px] text-white/40">Active Athletes</p>
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded bg-brand/10">
              <Calendar className="size-3.5 text-brand" />
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums text-white">&mdash;</p>
              <p className="text-[10px] text-white/40">Total Events</p>
            </div>
          </div>
        </div>
      </div>

      {/* Upcoming events area */}
      <div className="rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Upcoming Events
        </p>
        <div className="flex flex-col items-center py-4 text-white/20">
          <Calendar className="size-5" />
          <p className="mt-1.5 text-xs">No upcoming events</p>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Roster Mockup ─────────────────────────────────────────────────────── */

function RosterMockup() {
  return (
    <MockupFrame className="hover-lift">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">
          Squad Management
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-brand">
          0 Active
        </span>
      </div>
      <div className="space-y-2">
        {[
          "Add your first athlete to the roster",
          "Record position and jersey number",
          "Search and filter your squad",
        ].map((text, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand">
              {i + 1}
            </div>
            <span className="text-xs text-white/50">{text}</span>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

/* ─── Events Mockup ─────────────────────────────────────────────────────── */

function EventsMockup() {
  return (
    <MockupFrame className="hover-lift">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-widest text-white/70">
          Events
        </span>
        <span className="rounded-md bg-brand px-2 py-0.5 text-[10px] font-semibold text-brand-foreground">
          + New Event
        </span>
      </div>

      <div className="space-y-2.5">
        {/* Example match event */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">League Match</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Match
              </p>
            </div>
            <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
              Upcoming
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/40">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              Sat, 24 Aug
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              Home Ground
            </span>
          </div>
        </div>

        {/* Example training event */}
        <div className="rounded-lg border border-white/10 bg-white/5 p-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-white">Team Training</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">
                Training
              </p>
            </div>
            <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/50">
              Scheduled
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/40">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" />
              Wed, 21 Aug
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3" />
              Training Facility
            </span>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Formation / Lineup Mockup ─────────────────────────────────────────── */

/** Player dot positions for a 4-3-3 formation in a 100 × 150 viewBox.
 *  Own goal at the bottom, attack upward.                                  */
const FORMATION_PLAYERS = [
  { x: 50, y: 90, label: "GK" },
  { x: 18, y: 72, label: "LB" },
  { x: 38, y: 74, label: "CB" },
  { x: 62, y: 74, label: "CB" },
  { x: 82, y: 72, label: "RB" },
  { x: 30, y: 52, label: "CM" },
  { x: 50, y: 48, label: "CM" },
  { x: 70, y: 52, label: "CM" },
  { x: 22, y: 30, label: "LW" },
  { x: 50, y: 25, label: "ST" },
  { x: 78, y: 30, label: "RW" },
] as const;

function FormationMockup() {
  return (
    <div className="hover-lift w-full max-w-[260px] sm:max-w-[300px]">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg border border-white/10 shadow-lg">
        {/* Grass stripes */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(to bottom, var(--pitch-grass-light) 0, var(--pitch-grass-light) 7%, var(--pitch-grass-dark) 7%, var(--pitch-grass-dark) 14%)",
          }}
        />

        {/* Pitch markings */}
        <svg
          viewBox="0 0 100 150"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            x="2" y="2" width="96" height="146"
            fill="none" stroke="white" strokeWidth="0.4" opacity="0.5"
          />
          <line x1="2" y1="75" x2="98" y2="75" stroke="white" strokeWidth="0.3" opacity="0.35" />
          <circle cx="50" cy="75" r="12" fill="none" stroke="white" strokeWidth="0.3" opacity="0.35" />
          <rect x="17" y="2" width="66" height="24" fill="none" stroke="white" strokeWidth="0.3" opacity="0.35" />
          <rect x="30" y="2" width="40" height="10" fill="none" stroke="white" strokeWidth="0.3" opacity="0.35" />
          <rect x="17" y="124" width="66" height="24" fill="none" stroke="white" strokeWidth="0.3" opacity="0.35" />
          <rect x="30" y="138" width="40" height="10" fill="none" stroke="white" strokeWidth="0.3" opacity="0.35" />
        </svg>

        {/* Player dots */}
        <svg
          viewBox="0 0 100 150"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {FORMATION_PLAYERS.map((p) => (
            <g key={p.label}>
              <circle
                cx={p.x} cy={p.y} r="3.5"
                fill="#00D99A" stroke="#07110F" strokeWidth="0.5"
              />
              <text
                x={p.x} y={p.y + 0.5}
                textAnchor="middle" dominantBaseline="central"
                fill="#07110F" fontSize="2.8" fontWeight="bold"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <p className="mt-3 text-center text-xs text-foreground dark:text-white/50">
        4-3-3 formation &middot; 11 players on the pitch
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHARED — Mockup frame (dark card that looks correct in both themes)
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A dark-themed container for mockup visuals. The actual application forces
 * dark mode, so mockups intentionally show the dark UI regardless of the
 * visitor's current theme — this is accurate and avoids a confusing dual-mode
 * preview.
 */
function MockupFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "w-full max-w-md rounded-xl border border-white/10 bg-[#0F1820] p-4 shadow-lg sm:p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}
