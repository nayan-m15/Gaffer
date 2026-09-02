import { useState, useEffect, useRef } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  Download,
  LogIn,
  RefreshCw,
  Shield,
  Sparkles,
  Users,
  WifiOff,
  UserCheck,
} from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Footer } from "@/components/landing/Footer";
import { ChapterRail } from "@/components/landing/ChapterRail";
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
 *  LANDING PAGE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  const pageRef = useScrollReveal<HTMLDivElement>();

  return (
    <div
      ref={pageRef}
      className="relative flex min-h-screen flex-col bg-[#0B1218] text-white selection:bg-brand selection:text-brand-foreground"
    >
      {/* Background Stadium Atmosphere */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0">
        <img
          src="/hero-stadium-bg.png"
          alt=""
          className="size-full object-cover object-center opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B1218]/90 via-[#0B1218]/85 to-[#0B1218]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(11,18,24,0.95)_100%)]" />
      </div>

      {/* Sticky Navbar */}
      <Navbar />

      {/* Right-Hand Scroll Tab Menu (Chapter Rail) */}
      <ChapterRail />

      <main className="relative z-10 flex flex-1 flex-col">
        {/* ── Top Hero Section ───────────────────────────────────────────── */}
        <section id="home" className="min-h-[calc(100svh-4rem)] flex flex-col justify-center scroll-mt-16">
          <Hero />
        </section>

        {/* ── Section 1: Philosophy & Quick Workflow ────────────────────── */}
        <PhilosophySection />

        {/* ── Section 2: Squad Roster Management ────────────────────────── */}
        <RosterSection />

        {/* ── Section 3: Tactical Pitch & Starting XI ───────────────────── */}
        <TacticsSection />

        {/* ── Section 4: Live Sideline Match Tracking & Sync ────────────── */}
        <MatchdaySection />

        {/* ── Section 5: Performance Analytics & League ─────────────────── */}
        <AnalyticsSection />

        {/* ── Section 6: Final Single CTA ───────────────────────────────── */}
        <FinalCtaSection />
      </main>

      {/* Global Footer */}
      <Footer />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 1: PHILOSOPHY & WORKFLOW
 * ═══════════════════════════════════════════════════════════════════════════ */

function PhilosophySection() {
  const PILLARS = [
    {
      icon: Users,
      title: "Grassroots-First",
      desc: "Built for one coach, one phone, and zero budget. No expensive sensor vests, cameras, or complex setups required.",
    },
    {
      icon: WifiOff,
      title: "Offline Sideline Resilience",
      desc: "Survives dead pitch signals. Match events are instantly cached in local storage with 0ms latency and auto-sync when online.",
    },
    {
      icon: UserCheck,
      title: "Coach-Confirmed Intelligence",
      desc: "Scores, lineup checks, and derived stats are starting suggestions for coach confirmation — never silent black boxes.",
    },
  ];

  const STEPS = [
    { step: "01", label: "Create Team", desc: "Set squad details & division" },
    { step: "02", label: "Add Roster", desc: "Athletes, numbers & positions" },
    { step: "03", label: "Set Lineup", desc: "Formations & 1-GK rule check" },
    { step: "04", label: "Log Sideline", desc: "Live score, cards & match report" },
  ];

  return (
    <section
      id="philosophy"
      className="animate-on-scroll scroll-mt-20 border-t border-white/10 bg-[#0B1218]/60 py-16 backdrop-blur-sm sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/10 px-3.5 py-1 text-xs font-semibold tracking-wide text-brand">
            <Sparkles className="size-3 text-brand" />
            Core Philosophy &amp; Workflow
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Engineered for the Realities of Amateur Football
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-white/65 sm:text-base">
            Everything in {brand.name} is designed around simplicity, offline reliability, and practical matchday speed.
          </p>
        </div>

        {/* 3 Core Pillars */}
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="hover-lift rounded-2xl border border-white/10 bg-white/[0.03] p-7 shadow-lg backdrop-blur-sm transition-all hover:border-brand/40 hover:bg-white/[0.05]"
              >
                <div className="flex size-12 items-center justify-center rounded-xl border border-brand/30 bg-brand/10">
                  <Icon className="size-6 text-brand" />
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/60">{p.desc}</p>
              </div>
            );
          })}
        </div>

        {/* 4-Step Workflow Banner */}
        <div className="mt-12 rounded-2xl border border-white/10 bg-black/40 p-6 backdrop-blur-md">
          <div className="mb-4 text-xs font-mono font-semibold uppercase tracking-wider text-brand">
            Matchday Workflow in 4 Steps
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div key={s.step} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-xs font-mono font-bold text-brand">
                  {s.step}
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{s.label}</p>
                  <p className="text-xs text-white/50">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 2: SQUAD ROSTER MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════ */

function RosterSection() {
  return (
    <SectionLayout
      id="roster"
      badge="Squad Roster"
      icon={<Users className="size-4 text-brand" />}
      title="Complete Digital Squad & Athlete Profiles"
      description="Say goodbye to chaotic spreadsheets and fragmented group chats. Keep athlete records, squad numbers, preferred foot, and appearance stats organized in one unified hub."
      bullets={[
        "Full athlete cards: squad numbers, primary positions, contact info, and active/inactive roster status.",
        "Automatic season stats: appearances, goals, assists, minutes, and cards update directly from match logs.",
        "Quick position filters: instantly sort goalkeepers, defenders, midfielders, and attackers.",
      ]}
      visual={<RosterMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 3: TACTICAL PITCH & LINEUPS
 * ═══════════════════════════════════════════════════════════════════════════ */

function TacticsSection() {
  return (
    <SectionLayout
      id="tactics"
      badge="Tactical Pitch"
      icon={<Shield className="size-4 text-brand" />}
      title="Interactive Formation Pitch & Starting XI Builder"
      description="Set your match tactics visually before walking onto the pitch. Position players, test tactical formations, and manage your substitute bench with confidence."
      bullets={[
        "Visual pitch coordinate board: realistic turf markings and draggable starting XI positions.",
        "Rule enforcement: strictly enforces matchday rules (1 goalkeeper and 10 outfield athletes).",
        "Instant formation toggling: switch between 4-3-3, 4-4-2, 3-5-2, and custom setups in one click.",
        "Substitutes drawer: manage bench rotations and reserve players before kickoff.",
      ]}
      visual={<TacticalPitchMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 4: LIVE SIDELINE MATCH TRACKING
 * ═══════════════════════════════════════════════════════════════════════════ */

function MatchdaySection() {
  return (
    <SectionLayout
      id="matchday"
      badge="Matchday HUD"
      icon={<Clock className="size-4 text-brand" />}
      title="Single-Tap Live Logging with Sideline Offline Sync"
      description="Record pitchside action without friction. Tap to log goals, assists, yellow/red cards, and substitutions with a live match clock and instant undo support."
      bullets={[
        "Single-tap action buttons: rapid event entry tailored for fast-paced grassroots matches.",
        "Zero-latency offline engine: IndexedDB caching ensures full functionality even with zero signal on remote pitches.",
        "Timeline feed: real-time chronological event stream with easy mistake correction and undo.",
        "Instant match report: automated full-time summary generated the moment the final whistle blows.",
      ]}
      visual={<LiveMatchMockup />}
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 5: ANALYTICS & STANDINGS
 * ═══════════════════════════════════════════════════════════════════════════ */

function AnalyticsSection() {
  return (
    <SectionLayout
      id="analytics"
      badge="Performance Analytics"
      icon={<BarChart3 className="size-4 text-brand" />}
      title="Automated League Standings & Season Insights"
      description="No manual tallying needed. Points, goal differences, win streaks, and squad minutes calculate automatically from your confirmed match logs."
      bullets={[
        "Automated division table: live points, goal difference, win/draw/loss counts derived dynamically.",
        "Player metrics: leaderboards for top goalscorers, playmakers, and disciplinary records.",
        "Export reports: download matchday summaries and full league sheets as ready-to-share PDFs.",
      ]}
      visual={<AnalyticsMockup />}
      reversed
    />
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SECTION 6: FINAL SINGLE CTA
 * ═══════════════════════════════════════════════════════════════════════════ */

function FinalCtaSection() {
  return (
    <section
      id="cta"
      className="animate-on-scroll scroll-mt-20 border-t border-white/10 bg-gradient-to-b from-[#0B1218]/90 via-[#0A161E] to-[#0B1218] py-20 backdrop-blur-sm sm:py-28"
    >
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
          Ready for Matchday
        </span>

        <h2 className="mt-5 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
          Run your season with confidence.
        </h2>

        <p className="mx-auto mt-4 max-w-xl text-base text-white/65 sm:text-lg">
          Join amateur and grassroots football coaches managing rosters, tactical lineups, and live matches with {brand.name}.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3.5 sm:flex-row">
          <a
            href="/signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "w-full gap-2 bg-brand text-brand-foreground font-semibold hover:bg-brand-light shadow-xl shadow-brand/25 sm:w-auto",
            )}
          >
            Get Started Free
            <ArrowRight className="size-4" />
          </a>

          <a
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "w-full gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto",
            )}
          >
            <LogIn className="size-4" />
            Log In to Your Team
          </a>
        </div>

        <p className="mt-5 text-xs text-white/40">
          Free to get started &bull; 100% grassroots focused &bull; Zero credit card required
        </p>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  SHARED SECTION WRAPPER
 * ═══════════════════════════════════════════════════════════════════════════ */

function SectionLayout({
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
      className="animate-on-scroll scroll-mt-20 border-t border-white/10 bg-[#0B1218]/45 py-16 backdrop-blur-sm sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            "grid items-center gap-10 lg:grid-cols-12 lg:gap-14",
            reversed && "lg:[&>*:first-child]:order-2",
          )}
        >
          {/* Text Content */}
          <div className="lg:col-span-5">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
              {icon}
              <span>{badge}</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl">
              {title}
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/65 sm:text-base">
              {description}
            </p>
            <ul className="mt-6 space-y-3">
              {bullets.map((b, idx) => (
                <li key={idx} className="flex items-start gap-3 text-sm text-white/75">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden="true" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Visual Mockup Card */}
          <div className="flex justify-center lg:col-span-7 lg:justify-end">
            {visual}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 *  INTERACTIVE VISUAL MOCKUPS
 * ═══════════════════════════════════════════════════════════════════════════ */

function MockupCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hover-lift w-full max-w-lg rounded-2xl border border-white/10 bg-[#0E1720]/95 p-5 shadow-2xl backdrop-blur-md sm:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ─── Mockup: Roster ───────────────────────────────────────────────────── */

function RosterMockup() {
  const athletes = [
    { num: 1, name: "David Henderson", pos: "GK", foot: "Right", apps: 12, goals: 0 },
    { num: 4, name: "Marcus Walker", pos: "CB", foot: "Right", apps: 11, goals: 2 },
    { num: 8, name: "Lucas Vance", pos: "CM", foot: "Left", apps: 12, goals: 5 },
    { num: 9, name: "Alexander Cole", pos: "ST", foot: "Right", apps: 10, goals: 9 },
    { num: 11, name: "Noah Davies", pos: "LW", foot: "Left", apps: 9, goals: 4 },
  ];

  return (
    <MockupCard>
      <div className="mb-4 flex items-center justify-between border-b border-white/10 pb-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">Squad Roster</span>
          <p className="text-[11px] text-white/50">18 Players &bull; Season 2026</p>
        </div>
        <span className="rounded-md border border-brand/30 bg-brand/10 px-2.5 py-1 text-[11px] font-semibold text-brand">
          + Add Athlete
        </span>
      </div>

      <div className="space-y-2">
        {athletes.map((a) => (
          <div
            key={a.num}
            className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs transition-colors hover:bg-white/[0.07]"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-brand/15 text-[11px] font-bold text-brand">
                {a.num}
              </span>
              <div>
                <p className="font-semibold text-white">{a.name}</p>
                <p className="text-[10px] text-white/40">{a.foot}-footed &bull; {a.apps} apps</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/80">
                {a.pos}
              </span>
              <span className="text-[11px] font-bold text-brand">
                {a.goals} {a.goals === 1 ? "goal" : "goals"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </MockupCard>
  );
}

/* ─── Mockup: Tactical Pitch with Formation Switcher ───────────────────── */

const FORMATIONS: Record<string, Array<{ x: number; y: number; label: string }>> = {
  "4-3-3": [
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
  ],
  "4-4-2": [
    { x: 50, y: 88, label: "GK" },
    { x: 18, y: 72, label: "LB" },
    { x: 38, y: 74, label: "CB" },
    { x: 62, y: 74, label: "CB" },
    { x: 82, y: 72, label: "RB" },
    { x: 18, y: 50, label: "LM" },
    { x: 38, y: 52, label: "CM" },
    { x: 62, y: 52, label: "CM" },
    { x: 82, y: 50, label: "RM" },
    { x: 38, y: 26, label: "ST" },
    { x: 62, y: 26, label: "ST" },
  ],
  "3-5-2": [
    { x: 50, y: 88, label: "GK" },
    { x: 26, y: 74, label: "CB" },
    { x: 50, y: 76, label: "CB" },
    { x: 74, y: 74, label: "CB" },
    { x: 15, y: 50, label: "LWB" },
    { x: 35, y: 52, label: "CM" },
    { x: 50, y: 46, label: "CAM" },
    { x: 65, y: 52, label: "CM" },
    { x: 85, y: 50, label: "RWB" },
    { x: 38, y: 26, label: "ST" },
    { x: 62, y: 26, label: "ST" },
  ],
};

function TacticalPitchMockup() {
  const [formation, setFormation] = useState<"4-3-3" | "4-4-2" | "3-5-2">("4-3-3");
  const players = FORMATIONS[formation];

  return (
    <MockupCard className="max-w-md">
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">Tactical Pitch</span>
          <p className="text-[10px] text-white/50">11 Starters &bull; 1 GK Rule Confirmed</p>
        </div>
        <div className="flex gap-1">
          {(["4-3-3", "4-4-2", "3-5-2"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFormation(f)}
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold transition-all",
                formation === f
                  ? "bg-brand text-brand-foreground shadow-sm shadow-brand/40"
                  : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Football Pitch Visual */}
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/15 shadow-inner">
        {/* Grass mowing stripes */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-linear-gradient(to bottom, #4f9b3a 0, #4f9b3a 10%, #3c7c2b 10%, #3c7c2b 20%)",
          }}
        />

        {/* Pitch Lines */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="96" height="96" fill="none" stroke="white" strokeWidth="0.45" opacity="0.5" />
          <line x1="2" y1="50" x2="98" y2="50" stroke="white" strokeWidth="0.4" opacity="0.45" />
          <circle cx="50" cy="50" r="10" fill="none" stroke="white" strokeWidth="0.4" opacity="0.45" />
          <rect x="25" y="2" width="50" height="16" fill="none" stroke="white" strokeWidth="0.4" opacity="0.45" />
          <rect x="25" y="82" width="50" height="16" fill="none" stroke="white" strokeWidth="0.4" opacity="0.45" />
        </svg>

        {/* Player Nodes */}
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {players.map((p) => (
            <g key={p.label + p.x} className="transition-all duration-300 ease-out">
              <circle
                cx={p.x}
                cy={p.y}
                r="3.5"
                fill="#10B981"
                stroke="#07110F"
                strokeWidth="0.6"
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

      {/* Subs Bench */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[11px]">
        <span className="font-medium text-white/50">Subs Bench (5):</span>
        <div className="flex gap-1.5 text-white/80">
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">12 Evans (GK)</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">14 Reed</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[10px]">17 King</span>
        </div>
      </div>
    </MockupCard>
  );
}

/* ─── Mockup: Live Match Tracking & Offline Status ─────────────────────── */

function LiveMatchMockup() {
  return (
    <MockupCard>
      {/* Live Match Clock Header */}
      <div className="mb-4 rounded-xl border border-brand/30 bg-black/40 p-3.5 text-center">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-white">St. Jude FC</span>
          <span className="rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10px] font-bold text-red-400 animate-pulse">
            LIVE 64&apos;
          </span>
          <span className="font-semibold text-white/60">Riverside Utd</span>
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

      {/* Offline Status Badge */}
      <div className="mt-3 flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-400">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <RefreshCw className="size-3 animate-spin" />
          Offline Sync Ready (0ms latency)
        </span>
        <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold">
          Cached
        </span>
      </div>
    </MockupCard>
  );
}

/* ─── Mockup: League Standings & Analytics ─────────────────────────────── */

function AnalyticsMockup() {
  const standings = [
    { pos: 1, team: "St. Jude FC", p: 10, w: 8, d: 1, l: 1, gd: "+14", pts: 25 },
    { pos: 2, team: "Eastside Rangers", p: 10, w: 7, d: 2, l: 1, gd: "+11", pts: 23 },
    { pos: 3, team: "Riverside United", p: 10, w: 6, d: 1, l: 3, gd: "+6", pts: 19 },
  ];

  return (
    <MockupCard>
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2.5">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-white">League Division Standings</span>
          <p className="text-[10px] text-white/50">Derived dynamically from fixture logs</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] font-medium text-white/80">
          <Download className="size-3 text-brand" />
          PDF Report
        </span>
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
    </MockupCard>
  );
}
