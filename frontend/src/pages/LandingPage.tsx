import { useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Globe2,
  HeartPulse,
  Radio,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { Footer } from "@/components/landing/Footer";
import { ChapterRail } from "@/components/landing/ChapterRail";
import {
  LandingScene,
  type LandingSceneStatus,
} from "@/components/landing/LandingScene";
import { buttonVariants } from "@/components/ui/button-variants";
import { brand } from "@/data/brand";
import { cn } from "@/lib/utils";
import "@/components/landing/landing-product.css";

type Screenshot = {
  src: string;
  alt: string;
  width: number;
  height: number;
  mobile?: boolean;
  position?: string;
};

type FeatureSectionProps = {
  id: string;
  eyebrow: string;
  icon: ReactNode;
  title: string;
  description: string;
  bullets: string[];
  screenshot?: Screenshot;
  reverse?: boolean;
  caption?: string;
};

export default function LandingPage() {
  const [sceneStatus, setSceneStatus] = useState<LandingSceneStatus>("loading");

  return (
    <div className="landing-v2 relative flex min-h-screen flex-col bg-background text-foreground selection:bg-brand selection:text-brand-foreground">
      <div
        aria-hidden="true"
        data-scene-status={sceneStatus}
        className="pointer-events-none fixed inset-0 z-0 bg-[#07100d]"
      />
      <LandingScene onStatusChange={setSceneStatus} />
      <Navbar />
      <ChapterRail />

      <main className="relative z-10 flex flex-1 flex-col">
        <section id="home" className="flex min-h-[calc(100svh-4rem)] scroll-mt-16 flex-col justify-center">
          <Hero />
        </section>

        <div className="xl:pl-48">
          <WorkflowSection />

          <FeatureSection
            id="roster"
            eyebrow="Squad & players"
            icon={<Users className="size-4" />}
            title="Every player. One reliable record."
            description="See the squad, availability and season contribution together. Player records stay connected to selection, tactics and the matches that produced the numbers."
            bullets={[
              "Search and filter active or archived players.",
              "Track positions, availability and match statistics.",
              "Open a complete player profile without losing squad context.",
            ]}
            screenshot={{
              src: "/landing/roster-dashboard.jpg",
              alt: "Gaffer roster showing active players, availability, season statistics and a selected player profile",
              width: 1417,
              height: 677,
            }}
          />

          <FeatureSection
            id="tactics"
            eyebrow="Tactical command"
            icon={<Shield className="size-4" />}
            title="Turn the squad into a plan."
            description="Build the starting shape on a real football pitch, keep substitutes visible and carry the selected players into match preparation."
            bullets={[
              "Arrange starters visually across the pitch.",
              "Keep the bench and player availability in view.",
              "Save game plans for the fixture ahead.",
            ]}
            screenshot={{
              src: "/landing/tactics-board.jpg",
              alt: "Gaffer tactics board with a populated formation and substitute player cards",
              width: 1531,
              height: 932,
              position: "center",
            }}
            reverse
          />

          <FeatureSection
            id="schedule"
            eyebrow="Season planning"
            icon={<CalendarDays className="size-4" />}
            title="Make the week point toward kickoff."
            description="Training, meetings and fixtures live on one football calendar, with an agenda that keeps the next commitment clear."
            bullets={[
              "Switch between month and week planning.",
              "Keep training, matches and meetings distinct.",
              "Use the schedule as the starting point for match preparation.",
            ]}
            screenshot={{
              src: "/landing/events-calendar.jpg",
              alt: "Gaffer events calendar showing training sessions, meetings, a league match and the monthly agenda",
              width: 1418,
              height: 775,
            }}
          />

          <FeatureSection
            id="matchday"
            eyebrow="Matchday"
            icon={<Radio className="size-4" />}
            title="Capture the match from the touchline."
            description="The live logger keeps the clock, score and key events together while the game moves. Once the match ends, that record becomes a clear summary instead of another set of notes to rebuild."
            bullets={[
              "Log goals, assists, cards, substitutions, penalties, saves and injuries.",
              "Prepared match capture can continue through an unreliable connection and synchronize afterward.",
              "Review the resulting score, match facts and team comparison.",
            ]}
            screenshot={{
              src: "/landing/live-match-mobile.jpg",
              alt: "Gaffer mobile match summary showing the final score, match facts and team comparison",
              width: 501,
              height: 893,
              mobile: true,
            }}
            reverse
            caption="The post-match summary produced from the recorded event log."
          />

          <FeatureSection
            id="analytics"
            eyebrow="Performance"
            icon={<BarChart3 className="size-4" />}
            title="See what the season is becoming."
            description="Move from one result to the wider pattern. Recent form, scoring trends and points progression help coaches understand performance in context."
            bullets={[
              "Follow recent form and the latest result.",
              "Compare goals scored, goals conceded and points per match.",
              "Track season progression without rebuilding spreadsheets.",
            ]}
            screenshot={{
              src: "/landing/statistics-dashboard.jpg",
              alt: "Gaffer statistics dashboard showing recent form, form trends and season points progression",
              width: 1383,
              height: 642,
            }}
          />

          <FeatureSection
            id="injuries"
            eyebrow="Injury recovery"
            icon={<HeartPulse className="size-4" />}
            title="Know what is recorded before you select."
            description="The real injury workspace connects player status, body regions and recovery history. It gives coaches a clearer record without pretending to diagnose or guarantee a return date."
            bullets={[
              "Inspect recorded injuries on the interactive 3D body viewer.",
              "Track recovery progress and injury timelines.",
              "Carry player availability into squad decisions.",
            ]}
            screenshot={{
              src: "/landing/injury-recovery.jpg",
              alt: "Gaffer injury recovery screen showing the interactive body viewer and a recorded right quad injury",
              width: 696,
              height: 886,
              mobile: true,
            }}
            reverse
          />

          <ConnectedSection />

          <FeatureSection
            id="public"
            eyebrow="Public match centre"
            icon={<Globe2 className="size-4" />}
            title="Give supporters a view into the club."
            description="The public dashboard brings squad information, fixtures, results, standings and team statistics together in a surface anyone can explore."
            bullets={[
              "Filter by team, season, competition and match status.",
              "Browse the squad, match centre and league standings.",
              "Explore a live part of Gaffer without signing in.",
            ]}
            screenshot={{
              src: "/landing/public-dashboard.jpg",
              alt: "Gaffer public match centre filtered to Demo Coach FC with squad, match and standings navigation",
              width: 1440,
              height: 1000,
            }}
            caption="A real public Gaffer surface."
          />

          <FinalCtaSection />
        </div>
      </main>
      <Footer />
    </div>
  );
}

function WorkflowSection() {
  const steps = [
    ["01", "Roster", "Build the team record"],
    ["02", "Tactics", "Prepare the plan"],
    ["03", "Matchday", "Capture what happens"],
    ["04", "Reports", "Review the result"],
    ["05", "Analytics", "Understand the season"],
  ];

  return (
    <section id="philosophy" className="landing-chapter scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="landing-copy-panel mx-auto max-w-4xl text-center">
          <span className="landing-kicker"><Sparkles className="size-3.5" /> The Gaffer workflow</span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">
            One football record, from the first selection to the next match.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Gaffer connects the work coaches already do. The roster informs the plan, matchday creates the report, and the report becomes season insight.
          </p>
        </div>

        <ol className="landing-workflow" aria-label="The connected Gaffer workflow">
          {steps.map(([number, label, detail]) => (
            <li key={number}>
              <span className="landing-workflow__number">{number}</span>
              <strong>{label}</strong>
              <span>{detail}</span>
            </li>
          ))}
        </ol>

        <div className="landing-ecosystem" aria-label="Connected capabilities">
          <span><HeartPulse className="size-4" /> Availability</span>
          <span><Trophy className="size-4" /> Competitions</span>
          <span><Users className="size-4" /> Player experience</span>
        </div>
      </div>
    </section>
  );
}

function FeatureSection({
  id,
  eyebrow,
  icon,
  title,
  description,
  bullets,
  screenshot,
  reverse = false,
  caption,
}: FeatureSectionProps) {
  return (
    <section id={id} className="landing-chapter scroll-mt-20 py-16 sm:py-24 lg:py-28">
      <div
        className={cn(
          "mx-auto grid max-w-7xl items-center gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,0.76fr)_minmax(0,1.24fr)] lg:gap-12 lg:px-8",
          reverse && "lg:grid-cols-[minmax(0,1.24fr)_minmax(0,0.76fr)]",
        )}
      >
        <div className={cn("landing-copy-panel", reverse && "lg:order-2")}>
          <span className="landing-kicker">{icon}{eyebrow}</span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
          <ul className="mt-6 space-y-3">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/90">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
                  <Check className="size-3" />
                </span>
                {bullet}
              </li>
            ))}
          </ul>
        </div>

        {screenshot && (
          <figure className={cn("landing-screenshot-wrap", reverse && "lg:order-1", screenshot.mobile && "landing-screenshot-wrap--mobile")}>
            <div className="landing-screenshot-chrome" aria-hidden="true">
              <span /><span /><span /><b>{brand.name} / {eyebrow}</b>
            </div>
            <img
              src={screenshot.src.replace('.jpg', `-${Math.min(800, screenshot.width)}.webp`)}
              srcSet={[...new Set([480, 800, 1280, 1920].map(width => Math.min(width, screenshot.width)))].map(width => `${screenshot.src.replace('.jpg', `-${width}.webp`)} ${width}w`).join(', ')}
              sizes={screenshot.mobile ? '(min-width: 1024px) 320px, 80vw' : '(min-width: 1280px) 640px, (min-width: 1024px) 50vw, calc(100vw - 48px)'}
              alt={screenshot.alt}
              width={screenshot.width}
              height={screenshot.height}
              loading="lazy"
              decoding="async"
              style={{ objectPosition: screenshot.position ?? "center" }}
            />
            {caption && <figcaption>{caption}</figcaption>}
          </figure>
        )}
      </div>
    </section>
  );
}

function ConnectedSection() {
  return (
    <section id="competitions" className="landing-chapter scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="landing-copy-panel mx-auto max-w-3xl text-center">
          <span className="landing-kicker"><Activity className="size-4" /> The wider club</span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight sm:text-5xl">More than one coach-facing screen.</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            The same football record reaches competitions and the players who belong to the team.
          </p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <article className="landing-text-feature">
            <span className="landing-text-feature__icon"><Trophy className="size-5" /></span>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Competitions</p>
            <h3 className="mt-3 font-display text-2xl font-bold tracking-tight">Fixtures, results and standings stay connected.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Organize league or cup participation, generate fixtures, record results and maintain standings across participating teams.</p>
          </article>
          <article id="players" className="landing-text-feature scroll-mt-20">
            <span className="landing-text-feature__icon"><Users className="size-5" /></span>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">Player experience</p>
            <h3 className="mt-3 font-display text-2xl font-bold tracking-tight">Give each player the part that belongs to them.</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Players can see personal statistics, their team, upcoming events and competition information, then respond to events from a simpler player view.</p>
          </article>
        </div>
      </div>
    </section>
  );
}

function FinalCtaSection() {
  return (
    <section id="cta" className="landing-chapter scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
      <div className="landing-final-panel mx-auto max-w-5xl text-center">
        <span className="landing-kicker"><Sparkles className="size-4" /> Ready for the next match</span>
        <h2 className="mx-auto mt-5 max-w-3xl font-display text-3xl font-bold tracking-tight sm:text-5xl">
          The team, matchday and season — connected in one football workspace.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Start with the squad. Build the plan. Capture the game. Use the record to prepare what comes next.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <a href="/signup" className={cn(buttonVariants({ size: "lg" }), "gap-2 font-semibold")}>Get Started <ArrowRight className="size-4" /></a>
          <a href="/public-dashboard" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "gap-2")}>Explore Public Dashboard <Globe2 className="size-4" /></a>
        </div>
      </div>
    </section>
  );
}
