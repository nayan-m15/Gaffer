/**
 * FeaturesPage — Comprehensive user-facing overview of all capabilities
 * available within the Sport Coaching Tool.
 *
 * Designed around the core grassroots football coaching philosophy:
 *   1. Grassroots-First (Built for 1 coach, 1 phone, zero budget)
 *   2. Offline-First (Survives dead phone signal on the pitch)
 *   3. Human-Confirmed (The system computes, the coach confirms)
 *
 * Sections:
 *   1. Hero / Cinematic Overview
 *   2. Feature Quick Jump Nav
 *   3. Core Pillars (Three Commitments)
 *   4. Athlete Roster Management (Profile, squad numbers, active/inactive)
 *   5. Events & Fixture Management (Matches, training, venues, notes)
 *   6. Team & Lineup Management (Starting XI, 1 GK rule, formation tactical pitch)
 *   7. Context-Aware Dashboard (Live match HUD vs general squad summary)
 *   8. Live Match Tracking (Single-tap events, match clock, undo/edit)
 *   9. Offline-First Sync Engine (Local queue, conflict-free background sync)
 *  10. Analytics, League Standings & Exports (Derived stats, tables, PDF/CSV)
 *  11. Final CTA
 *
 * Accessible as a section of the Home page (`/#features`). Follows the same aesthetic language as
 * `HowItWorksPage`, utilizing the stadium background, scroll reveal transitions,
 * brand emerald palette, and terminal-style interactive mockups.
 */

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  Globe,
  LayoutGrid,
  MapPin,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  WifiOff,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { buttonVariants } from "@/components/ui/button";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";

/* ═══════════════════════════════════════════════════════════════════════════
 *  SCROLL-REVEAL HOOK
 * ═══════════════════════════════════════════════════════════════════════════ */

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
      { threshold: 0.12 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  FEATURE QUICK JUMP LINKS
 * ═══════════════════════════════════════════════════════════════════════════ */

const FEATURE_NAV_ITEMS = [
  { id: "feature-roster", label: "Roster Management", icon: Users },
  { id: "feature-events", label: "Events & Scheduling", icon: Calendar },
  { id: "feature-lineup", label: "Tactical Lineups", icon: Shield },
  { id: "feature-dashboard", label: "Command Dashboard", icon: LayoutGrid },
  { id: "feature-live", label: "Live Match Tracking", icon: Clock },
  { id: "feature-offline", label: "Offline Sync", icon: WifiOff },
  { id: "feature-analytics", label: "Analytics & Reports", icon: BarChart3 },
] as const;

/* ═══════════════════════════════════════════════════════════════════════════
 *  PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * FeaturesSection — Features content as an embeddable section.
 *
 * Used by LandingPage to render the Features content inline within the
 * combined Home page. The stadium background uses `absolute` positioning
 * (instead of `fixed`) so it scrolls with the section rather than remaining
 * anchored to the viewport.
 */
export function FeaturesSection() {
  const sectionRef = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={sectionRef}
      id="features"
      className="scroll-mt-16 relative bg-[#0B1218] text-white selection:bg-brand selection:text-brand-foreground"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
        <img
          src="/features-stadium-bg.png"
          alt=""
          className="size-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/15 to-black/45" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_50%,rgba(0,0,0,0.4)_100%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-900/10 via-transparent to-emerald-900/5" />
      </div>

      <div className="relative z-10">
        <HeroSection />
        <JumpBarSection />
        <CorePillarsSection />
        <RosterFeatureSection />
        <EventsFeatureSection />
        <LineupFeatureSection />
        <DashboardFeatureSection />
        <LiveTrackingFeatureSection />
        <OfflineFeatureSection />
        <AnalyticsFeatureSection />
        <CtaSection />
      </div>
    </section>
  );
}

export default function FeaturesPage() {
  const pageRef = useScrollReveal<HTMLDivElement>();

  return (
    <div ref={pageRef} className="relative flex min-h-screen flex-col bg-[#0B1218] text-white selection:bg-brand selection:text-brand-foreground">
      {/* ── Fixed stadium background ──────────────────────────────────────
       * The image and its overlays are anchored to the viewport with
       * `position: fixed`. Every section scrolls *over* this single layer,
       * so the stadium is never duplicated.
       */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/features-stadium-bg.png"
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
        <JumpBarSection />
        <CorePillarsSection />
        <RosterFeatureSection />
        <EventsFeatureSection />
        <LineupFeatureSection />
        <DashboardFeatureSection />
        <LiveTrackingFeatureSection />
        <OfflineFeatureSection />
        <AnalyticsFeatureSection />
        <CtaSection />
      </main>

      <div className="relative z-10">
        <Footer />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 1 — HERO / INTRODUCTION
 * ═══════════════════════════════════════════════════════════════════════════ */

function HeroSection() {
  return (
    <section
      aria-labelledby="features-heading"
      className="relative isolate flex min-h-[70svh] flex-col items-center justify-center overflow-hidden"
    >
      <div className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-12 sm:px-6 sm:pb-32 sm:pt-20 lg:px-8 lg:pb-40 lg:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="mb-5 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 py-1.5 text-xs font-medium tracking-wide text-white/80 backdrop-blur-sm animate-fade-in">
            <Sparkles className="size-3.5 text-brand" />
            <span>Platform Capabilities &amp; Architecture</span>
          </span>

          <h1
            id="features-heading"
            className="font-display text-4xl font-bold leading-[1.1] tracking-tight text-white drop-shadow-lg sm:text-5xl lg:text-[3.5rem] xl:text-6xl animate-fade-in-up"
          >
            Built for Grassroots Coaches, Powered by Honest Data
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/70 drop-shadow-md sm:text-lg animate-fade-in-up animation-delay-150">
            From squad management and tactical formation planning to offline sideline match logging and automated season analytics — discover everything {brand.name} gives your team.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center animate-fade-in-up animation-delay-300">
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
              href="/#how-it-works"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "w-full gap-2 border-white/20 bg-black/30 text-white backdrop-blur-sm hover:bg-white/15 hover:text-white sm:w-auto",
              )}
            >
              <Zap className="size-4 text-brand" />
              How It Works
            </a>
          </div>
        </div>
      </div>

      {/* Scroll-down indicator — bouncing chevron near bottom of viewport */}
      <a
        href="#features-content"
        className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce-slow text-white/50 transition-colors hover:text-white/90"
        aria-label="Scroll to features content"
      >
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
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </a>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 2 — QUICK JUMP BAR
 * ═══════════════════════════════════════════════════════════════════════════ */

function JumpBarSection() {
  return (
    <div id="features-content" className="sticky top-16 z-40 border-y border-white/10 bg-[#0B1218]/90 backdrop-blur-md py-3 shadow-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-start gap-2 overflow-x-auto no-scrollbar sm:justify-center">
          {FEATURE_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/80 transition-all hover:border-brand/50 hover:bg-brand/10 hover:text-white"
              >
                <Icon className="size-3.5 text-brand" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 3 — THREE CORE PILLARS
 * ═══════════════════════════════════════════════════════════════════════════ */

function CorePillarsSection() {
  const PILLARS = [
    {
      icon: Users,
      title: "Grassroots-First Design",
      desc: "Designed for one coach, one phone, and zero enterprise budget. No camera rigs or complex setups required.",
    },
    {
      icon: WifiOff,
      title: "Offline Sideline Resilience",
      desc: "Event logging survives dead phone signal and remote pitches. Entries save locally and sync in the background.",
    },
    {
      icon: UserCheck,
      title: "System Computes, Coach Confirms",
      desc: "Derived stats, scores, and lineup suggestions are always starting points for human approval, never silent black boxes.",
    },
  ];

  return (
    <section className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-14 backdrop-blur-sm sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-xs font-semibold uppercase tracking-widest text-brand">
            Our Philosophy
          </span>
          <h2 className="mt-2 font-display text-2xl font-bold text-foreground dark:text-white sm:text-3xl">
            Engineered for the Realities of Amateur Football
          </h2>
          <p className="mt-3 text-sm text-foreground dark:text-white/60 sm:text-base">
            Every feature in {brand.name} sits on three non-negotiable principles.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <div
                key={pillar.title}
                className="hover-lift rounded-2xl border dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] p-7 shadow-sm transition-all"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-brand/10 border border-brand/20">
                  <Icon className="size-6 text-brand" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-foreground dark:text-white">
                  {pillar.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground dark:text-white/65">
                  {pillar.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 4 — ATHLETE ROSTER MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function RosterFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-roster"
      badge="Roster Management"
      icon={<Users className="size-5 text-brand" />}
      title="Complete Digital Squad & Athlete Profiles"
      description="Say goodbye to disorganized spreadsheets and fragmented chat groups. Build and maintain a single source of truth for your entire football squad."
      bullets={[
        "Detailed athlete records: full name, DOB, squad number, primary position, preferred foot, and contact details.",
        "Active squad lifecycle: easily mark players as active, inactive, or archived as your team evolves over the season.",
        "Individual match stats: appearances, goals, assists, minutes, cards, and clean sheets build up automatically from match event logs.",
        "Quick search & position filters: instantly locate goalkeepers, defenders, midfielders, or forwards for training and matchday selection.",
      ]}
      visual={<RosterMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 5 — EVENTS & FIXTURE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function EventsFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-events"
      badge="Events & Scheduling"
      icon={<Calendar className="size-5 text-brand" />}
      title="Match, Training & Session Planning"
      description="Plan and manage every coaching event from one place. Distinguish between competitive matches and training sessions with custom logistical details."
      bullets={[
        "Dedicated event categories: create League Matches, Cup Fixtures, Friendly Games, Training Sessions, and Team Meetings.",
        "Rich logistical metadata: specify exact kickoff dates, times, venue locations, pitch numbers, and custom coaching notes.",
        "Competitive fixture details: record opponent names, competition labels, and home/away designations.",
        "Upcoming vs. Completed views: track upcoming events with countdowns and preserve permanent history for completed sessions.",
      ]}
      visual={<EventsMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 6 — TEAM & LINEUP MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function LineupFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-lineup"
      badge="Team & Lineup"
      icon={<Shield className="size-5 text-brand" />}
      title="Interactive Tactical Pitch & Starting XI Builder"
      description="Prepare your match tactics visually before setting foot on the pitch. Position players, test tactical formations, and manage your substitute bench with confidence."
      bullets={[
        "Interactive tactical pitch board: drag and position squad members into exact pitch coordinates with realistic turf markings.",
        "Enforced matchday rules: starting XI builder strictly enforces standard rules (exactly 1 goalkeeper and 10 outfield athletes).",
        "Popular formation presets: toggle instantly between 4-3-3, 4-4-2, 3-5-2, 4-2-3-1, 5-3-2, and custom configurations.",
        "Substitutes bench drawer: manage reserve players and plan tactical substitution rotations prior to kickoff.",
      ]}
      visual={<LineupTacticalMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 7 — CONTEXT-AWARE COMMAND DASHBOARD
 * ═══════════════════════════════════════════════════════════════════════════ */

function DashboardFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-dashboard"
      badge="Command Dashboard"
      icon={<LayoutGrid className="size-5 text-brand" />}
      title="Adaptive Command Centre for Matchdays & Training"
      description="A dashboard that changes according to your current context. During a live match it prioritizes real-time tracking; outside of matches it delivers squad and season insights."
      bullets={[
        "Dynamic context switching: live match tracker banner takes centre stage during active events, reverting to season view when idle.",
        "Key squad metrics at a glance: monitor active athlete counts, scheduled events, seasonal win rates, and goal differentials.",
        "Upcoming fixture card: see your next opponent, venue, and countdown clock directly on the home screen.",
        "Recent results & quick shortcuts: instant single-tap access to log events, add players, or review past match summaries.",
      ]}
      visual={<DashboardMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 8 — LIVE EVENT TRACKING & SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════════════════════ */

function LiveTrackingFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-live"
      badge="Live Match Tracking"
      icon={<Clock className="size-5 text-brand" />}
      title="Sideline Match Tracking & Event Log Truth"
      description="Record what happens during the game as it happens. Treat the event log as the single source of truth — every team score and player stat is derived directly from individual taps."
      bullets={[
        "Best-effort match clock: start, pause, and adjust match elapsed minutes without needing complex referee sync.",
        "Single-tap action logging: tap to log Goals, Assists, Yellow Cards, Red Cards, Substitutions, Fouls, Shots on Target, and Saves.",
        "Player-attributed records: every logged action is linked to the responsible athlete and timestamped down to the minute.",
        "Instant undo & inline edit: made a mistake? Tap undo or edit the recorded event immediately without corrupting match totals.",
      ]}
      visual={<LiveMatchMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 9 — OFFLINE-FIRST OPERATION & SYNC
 * ═══════════════════════════════════════════════════════════════════════════ */

function OfflineFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-offline"
      badge="Offline Reliability"
      icon={<WifiOff className="size-5 text-brand" />}
      title="Offline-First Capture with Automatic Background Sync"
      description={`Amateur football pitches frequently have zero mobile signal or Wi-Fi. ${brand.name} guarantees that match logging never halts due to poor connectivity.`}
      bullets={[
        "Local on-device database: all live match entries are saved instantly to device storage (IndexedDB) with zero lag.",
        "Automatic background queue: once connectivity is detected, queued events automatically sync with the cloud database.",
        "Conflict-free multi-user logging: if assistants on both teams log events, the system merges timelines and flags potential duplicates for coach review.",
        "Clear sync status indicators: always know whether your device is online, offline, or actively syncing pending events.",
      ]}
      visual={<OfflineSyncMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 10 — ANALYTICS, LEAGUE STANDINGS & EXPORTS
 * ═══════════════════════════════════════════════════════════════════════════ */

function AnalyticsFeatureSection() {
  return (
    <FeatureSectionWrapper
      id="feature-analytics"
      badge="Analytics & Reports"
      icon={<BarChart3 className="size-5 text-brand" />}
      title="Automated Season Analytics, Standings & Exports"
      description="Zero manual re-typing. Because every action is logged during matches, your season totals, league standings, and exportable reports build themselves automatically."
      bullets={[
        "Zero-entry season statistics: goal charts, assist rankings, card tallies, and playing minutes compile from match logs.",
        "League table & standings: automatic calculation of Matches Played, Wins, Draws, Losses, Goals For, Goals Against, Goal Difference, and Points.",
        "Explainable selection recommendations: rule-based suggestions (e.g. form, minutes load, card accumulation) to assist coach decisions.",
        "One-click PDF & CSV exports: export formal match sheets, player profiles, and season summaries for parents, scouts, and league officials.",
      ]}
      visual={<AnalyticsMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 11 — FINAL CTA
 * ═══════════════════════════════════════════════════════════════════════════ */

function CtaSection() {
  return (
    <section className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-16 backdrop-blur-sm sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl rounded-3xl border dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] p-8 text-center shadow-lg backdrop-blur-md sm:p-14">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand/10 border border-brand/20">
            <Trophy className="size-7 text-brand" />
          </div>
          <h2 className="mt-6 font-display text-3xl font-bold text-foreground dark:text-white sm:text-4xl">
            Ready to Give Your Squad the Edge?
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-foreground dark:text-white/70 sm:text-base">
            Start organizing your roster, planning events, and tracking live matches with {brand.name}. Completely free to set up your team today.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3.5 sm:flex-row sm:justify-center">
            <a
              href="/signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "w-full gap-2 bg-brand text-brand-foreground font-semibold hover:bg-brand-light shadow-xl shadow-brand/20 sm:w-auto",
              )}
            >
              Create Your Free Team
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
          <p className="mt-5 text-xs text-foreground dark:text-white/45">
            Designed for amateur football clubs, grassroots teams, and schools.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHARED — Feature Section Wrapper (Alternating Layout)
 * ═══════════════════════════════════════════════════════════════════════════ */

function FeatureSectionWrapper({
  id,
  badge,
  icon,
  title,
  description,
  bullets,
  visual,
  reversed = false,
}: {
  id: string;
  badge: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
  reversed?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      className="animate-on-scroll border-t dark:border-white/10 bg-background/40 dark:bg-background/55 py-16 backdrop-blur-sm sm:py-24 scroll-mt-28"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "grid items-center gap-10 lg:grid-cols-12 lg:gap-14",
            reversed && "lg:[&>*:first-child]:order-2",
          )}
        >
          {/* Text content (5 cols) */}
          <div className="lg:col-span-5">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              {icon}
              <span>{badge}</span>
            </div>
            <h2
              id={`${id}-heading`}
              className="font-display text-2xl font-bold tracking-tight text-foreground dark:text-white sm:text-3xl lg:text-4xl"
            >
              {title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-foreground dark:text-white/65 sm:text-base">
              {description}
            </p>
            <ul className="mt-6 space-y-3.5">
              {bullets.map((bullet, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-3 text-sm text-foreground dark:text-white/70"
                >
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-brand"
                    aria-hidden="true"
                  />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual card mockup (7 cols) */}
          <div className="flex justify-center lg:col-span-7 lg:justify-end">
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  VISUAL MOCKUP FRAMES
 * ═══════════════════════════════════════════════════════════════════════════ */

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
        "hover-lift w-full max-w-lg rounded-2xl border border-white/10 bg-[#0F1820] p-5 shadow-2xl backdrop-blur-md sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─── Mockup 1: Roster ─────────────────────────────────────────────────── */

function RosterMockup() {
  const players = [
    { num: 1, name: "David Henderson", pos: "GK", foot: "Right", apps: 12, goals: 0, status: "Active" },
    { num: 4, name: "Marcus Walker", pos: "CB", foot: "Right", apps: 11, goals: 2, status: "Active" },
    { num: 8, name: "Lucas Vance", pos: "CM", foot: "Left", apps: 12, goals: 5, status: "Active" },
    { num: 9, name: "Alexander Cole", pos: "ST", foot: "Right", apps: 10, goals: 9, status: "Active" },
    { num: 11, name: "Noah Davies", pos: "LW", foot: "Left", apps: 9, goals: 4, status: "Active" },
  ];

  return (
    <MockupFrame>
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">Squad Roster</span>
          <p className="text-[11px] text-white/50">18 Players &bull; 100% Registered</p>
        </div>
        <span className="rounded-md bg-brand/10 border border-brand/30 px-2.5 py-1 text-[11px] font-semibold text-brand">
          + Add Athlete
        </span>
      </div>

      <div className="space-y-2">
        {players.map((p) => (
          <div
            key={p.num}
            className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs transition-colors hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-brand/15 text-[11px] font-bold text-brand">
                {p.num}
              </span>
              <div>
                <p className="font-semibold text-white">{p.name}</p>
                <p className="text-[10px] text-white/40">{p.foot}-footed &bull; {p.apps} apps</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                {p.pos}
              </span>
              <span className="text-[11px] font-bold text-brand">
                {p.goals} {p.goals === 1 ? "goal" : "goals"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </MockupFrame>
  );
}

/* ─── Mockup 2: Events ─────────────────────────────────────────────────── */

function EventsMockup() {
  return (
    <MockupFrame>
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">Fixture Schedule</span>
          <p className="text-[11px] text-white/50">Upcoming &amp; Past Sessions</p>
        </div>
        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/60">
          August 2026
        </span>
      </div>

      <div className="space-y-3">
        {/* Match Event */}
        <div className="rounded-xl border border-brand/30 bg-gradient-to-r from-brand/10 to-transparent p-3.5">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1 rounded bg-brand px-2 py-0.5 text-[10px] font-bold text-brand-foreground uppercase tracking-wide">
              Matchday &bull; League
            </span>
            <span className="text-[11px] font-semibold text-brand">In 2 Days</span>
          </div>
          <h4 className="mt-2 text-sm font-bold text-white">St. Jude FC vs Riverside United</h4>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/60">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3 text-brand" />
              Sat, Aug 25 &bull; 15:00
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3 text-brand" />
              Riverside Arena (Home)
            </span>
          </div>
        </div>

        {/* Training Event */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
          <div className="flex items-center justify-between">
            <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/80 uppercase tracking-wide">
              Training Session
            </span>
            <span className="text-[10px] text-white/40">Weekly Tactical</span>
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-white">Set Pieces &amp; Defensive Shape</h4>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/50">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3 text-white/40" />
              Tue, Aug 28 &bull; 18:30
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3 text-white/40" />
              Training Pitch B
            </span>
          </div>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Mockup 3: Tactical Pitch & Lineup ────────────────────────────────── */

const PITCH_PLAYERS_433 = [
  { x: 50, y: 88, label: "GK" },
  { x: 18, y: 72, label: "LB" },
  { x: 38, y: 74, label: "CB" },
  { x: 62, y: 74, label: "CB" },
  { x: 82, y: 72, label: "RB" },
  { x: 30, y: 52, label: "CM" },
  { x: 50, y: 48, label: "CM" },
  { x: 70, y: 52, label: "CM" },
  { x: 22, y: 30, label: "LW" },
  { x: 50, y: 24, label: "ST" },
  { x: 78, y: 30, label: "RW" },
] as const;

function LineupTacticalMockup() {
  return (
    <MockupFrame className="max-w-md">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">Tactical Pitch</span>
          <p className="text-[10px] text-white/50">Formation 4-3-3 &bull; 11 Starters Selected</p>
        </div>
        <div className="flex gap-1">
          {["4-3-3", "4-4-2", "3-5-2"].map((f) => (
            <span
              key={f}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold transition-all",
                f === "4-3-3" ? "bg-brand text-brand-foreground" : "bg-white/5 text-white/60",
              )}
            >
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Football Pitch Graphic */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/15 shadow-inner">
        {/* Pitch Stripes */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(to bottom, var(--pitch-grass-light) 0, var(--pitch-grass-light) 10%, var(--pitch-grass-dark) 10%, var(--pitch-grass-dark) 20%)",
          }}
        />

        {/* Pitch Markings */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="96" height="96" fill="none" stroke="white" strokeWidth="0.4" opacity="0.45" />
          <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="0.35" opacity="0.4" />
          <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.35" opacity="0.4" />
          <rect x="25" y="2" width="50" height="16" fill="none" stroke="white" strokeWidth="0.35" opacity="0.4" />
          <rect x="25" y="82" width="50" height="16" fill="none" stroke="white" strokeWidth="0.35" opacity="0.4" />
        </svg>

        {/* Player nodes */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {PITCH_PLAYERS_433.map((p) => (
            <g key={p.label + p.x}>
              <circle
                cx={p.x}
                cy={p.y}
                r="3.2"
                fill="#00D99A"
                stroke="#07110F"
                strokeWidth="0.5"
              />
              <text
                x={p.x}
                y={p.y + 0.4}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#07110F"
                fontSize="2.4"
                fontWeight="bold"
              >
                {p.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      {/* Substitutes Tray */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px]">
        <span className="font-medium text-white/50">Subs Bench (5):</span>
        <div className="flex gap-1.5 text-white/80">
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">12 Evans (GK)</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">14 Reed</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">17 King</span>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Mockup 4: Dashboard ──────────────────────────────────────────────── */

function DashboardMockup() {
  return (
    <MockupFrame>
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-md bg-brand text-brand-foreground font-bold text-xs">
            ST
          </div>
          <div>
            <span className="text-xs font-bold text-white">St. Jude FC &bull; Senior XI</span>
            <p className="text-[10px] text-white/40">Division 2 Amateur League</p>
          </div>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
          <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Season Active
        </span>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-3.5">
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
          <p className="text-base font-bold text-white">18</p>
          <p className="text-[10px] text-white/40">Athletes</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
          <p className="text-base font-bold text-brand">75%</p>
          <p className="text-[10px] text-white/40">Win Rate</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-center">
          <p className="text-base font-bold text-white">+14</p>
          <p className="text-[10px] text-white/40">Goal Diff</p>
        </div>
      </div>

      {/* Next Fixture Preview */}
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-brand">Next Match Countdown</p>
        <div className="mt-1 flex items-center justify-between">
          <p className="text-xs font-bold text-white">vs Eastside Rangers</p>
          <p className="text-xs font-mono text-white/70">Saturday, 14:00</p>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Mockup 5: Live Match Tracking ────────────────────────────────────── */

function LiveMatchMockup() {
  return (
    <MockupFrame>
      {/* Live Match Clock Header */}
      <div className="mb-4 rounded-xl border border-brand/30 bg-black/40 p-3.5 text-center">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">St. Jude FC</span>
          <span className="rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
            LIVE 64&apos;
          </span>
          <span className="font-semibold text-white/60">Riverside</span>
        </div>
        <div className="mt-2 text-2xl font-black tracking-wider text-white">
          2 &mdash; 1
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        {[
          { label: "Goal", color: "bg-brand text-brand-foreground" },
          { label: "Card", color: "bg-amber-500/20 border border-amber-500/40 text-amber-300" },
          { label: "Sub", color: "bg-blue-500/20 border border-blue-500/40 text-blue-300" },
          { label: "Undo", color: "bg-white/10 text-white/60" },
        ].map((btn) => (
          <button
            key={btn.label}
            className={cn(
              "rounded-lg py-2 text-center text-xs font-bold transition-transform hover:scale-105 active:scale-95",
              btn.color,
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Timeline Feed */}
      <div className="space-y-2 text-xs">
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-brand">58&apos;</span>
            <span className="text-white">Goal &bull; Alexander Cole (#9)</span>
          </div>
          <span className="text-[10px] text-white/40">Assist: Vance</span>
        </div>
        <div className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.02] p-2">
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-amber-400">41&apos;</span>
            <span className="text-white">Yellow Card &bull; Marcus Walker (#4)</span>
          </div>
          <span className="text-[10px] text-white/40">Foul</span>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Mockup 6: Offline-First Sync ─────────────────────────────────────── */

function OfflineSyncMockup() {
  return (
    <MockupFrame>
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-white">Local Sync Engine</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-400">
          <RefreshCw className="size-3 animate-spin" />
          Auto-Sync Armed
        </span>
      </div>

      <div className="space-y-3">
        {/* Offline event log item */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <WifiOff className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Pitchside Offline Mode</p>
              <p className="text-[10px] text-white/40">IndexedDB Local Cache &bull; 0ms latency</p>
            </div>
          </div>
          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            Stored
          </span>
        </div>

        {/* Sync queue representation */}
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-md bg-brand/10 border border-brand/20 text-brand">
              <Globe className="size-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Background Upload</p>
              <p className="text-[10px] text-white/40">Syncs timeline once connection returns</p>
            </div>
          </div>
          <span className="rounded bg-brand/20 px-2 py-0.5 text-[10px] font-semibold text-brand">
            Synced
          </span>
        </div>
      </div>
    </MockupFrame>
  );
}

/* ─── Mockup 7: Analytics & League ─────────────────────────────────────── */

function AnalyticsMockup() {
  const standings = [
    { pos: 1, team: "St. Jude FC", p: 10, w: 8, d: 1, l: 1, gd: "+14", pts: 25 },
    { pos: 2, team: "Eastside Rangers", p: 10, w: 7, d: 2, l: 1, gd: "+11", pts: 23 },
    { pos: 3, team: "Riverside United", p: 10, w: 6, d: 1, l: 3, gd: "+6", pts: 19 },
  ];

  return (
    <MockupFrame>
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">League Division Standings</span>
          <p className="text-[10px] text-white/50">Derived dynamically from fixture logs</p>
        </div>
        <button className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/80 hover:bg-white/20">
          <Download className="size-3" />
          Export PDF
        </button>
      </div>

      <div className="overflow-x-auto text-xs">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10 text-[10px] uppercase text-white/40">
              <th className="pb-1.5">#</th>
              <th className="pb-1.5">Team</th>
              <th className="pb-1.5 text-center">P</th>
              <th className="pb-1.5 text-center">GD</th>
              <th className="pb-1.5 text-right font-bold text-white">PTS</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {standings.map((s) => (
              <tr key={s.pos} className={s.pos === 1 ? "bg-brand/10 font-semibold" : "text-white/80"}>
                <td className="py-2 text-white/50">{s.pos}</td>
                <td className="py-2 text-white">{s.team}</td>
                <td className="py-2 text-center text-white/60">{s.p}</td>
                <td className="py-2 text-center text-white/60">{s.gd}</td>
                <td className="py-2 text-right font-bold text-brand">{s.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </MockupFrame>
  );
}
