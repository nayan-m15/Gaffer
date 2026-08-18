import {
  Users,
  CalendarDays,
  Trophy,
  TrendingUp,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * DashboardMockup — Marketing-quality product preview for the hero section.
 *
 * This is NOT a functional dashboard.  It is a static, branded mockup that
 * communicates the look and feel of the Sport Coaching Tool's dashboard to
 * prospective users.  Every piece of data is hard-coded sample content.
 *
 * Visual elements:
 * - Greeting header ("Good afternoon, Coach")
 * - Four summary stat cards (Squad, Upcoming, Matches, Win Rate)
 * - Next-match card with team names and date
 * - Last-result card showing a win
 * - Mini performance trend bars
 * - Squad avatar strip
 *
 * The component adapts to light and dark mode through CSS variables.
 */
export function DashboardMockup({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10 dark:shadow-black/40",
        className,
      )}
    >
      {/* ── Dashboard inner shell ──────────────────────────────────────── */}
      <div className="p-4 sm:p-5">
        {/* ── Header row ───────────────────────────────────────────────── */}
        <header className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Dashboard
            </p>
            <h3 className="mt-1 text-base font-semibold text-foreground sm:text-lg">
              Good afternoon, Coach
            </h3>
          </div>
          <time
            dateTime="2026-08-15"
            className="text-xs text-muted-foreground sm:text-sm"
          >
            Saturday, 15 August
          </time>
        </header>

        {/* ── Summary stat cards ────────────────────────────────────────── */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <StatCard
            icon={<Users className="size-3.5" />}
            label="Squad"
            value="18"
            suffix="Athletes"
          />
          <StatCard
            icon={<CalendarDays className="size-3.5" />}
            label="Upcoming"
            value="3"
            suffix="Events"
          />
          <StatCard
            icon={<Trophy className="size-3.5" />}
            label="Matches"
            value="12"
          />
          <StatCard
            icon={<TrendingUp className="size-3.5" />}
            label="Win Rate"
            value="67%"
            highlight
          />
        </div>

        {/* ── Two-column: Next Match + Last Result ─────────────────────── */}
        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          {/* Next match card */}
          <div className="rounded-lg border border-border bg-background p-3.5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Next Match
            </p>

            <div className="flex items-center justify-between">
              <TeamBadge name="Riverside FC" short="RFC" />
              <span className="px-2 text-xs font-medium text-muted-foreground">
                vs
              </span>
              <TeamBadge name="City United" short="CU" align="right" />
            </div>

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">15 Aug</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="font-medium text-foreground">15:00</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase">
                Home
              </span>
            </div>
          </div>

          {/* Last result card */}
          <div className="rounded-lg border border-border bg-background p-3.5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Last Result
            </p>

            <div className="space-y-2">
              <ResultRow name="Riverside FC" score={2} winner />
              <ResultRow name="City United" score={1} />
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                Win
              </span>
              <span className="text-xs text-muted-foreground">League Match</span>
            </div>
          </div>
        </div>

        {/* ── Performance trend ─────────────────────────────────────────── */}
        <div className="mb-5 rounded-lg border border-border bg-background p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Performance — Last 8 Matches
            </p>
            <span className="text-xs font-medium text-primary">W4 D2 L2</span>
          </div>

          {/* Mini bar chart — each bar represents one match result */}
          <div className="flex items-end gap-1.5" style={{ height: 40 }}>
            {MATCH_RESULTS.map((result, i) => (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-t-sm transition-all",
                  result === "W"
                    ? "bg-primary"
                    : result === "D"
                      ? "bg-muted-foreground/40"
                      : "bg-destructive/60",
                )}
                style={{
                  height: result === "W" ? "100%" : result === "D" ? "60%" : "35%",
                }}
                title={`${result === "W" ? "Win" : result === "D" ? "Draw" : "Loss"} — Match ${i + 1}`}
              />
            ))}
          </div>
        </div>

        {/* ── Squad preview ─────────────────────────────────────────────── */}
        <div className="rounded-lg border border-border bg-background p-3.5">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Squad
            </p>
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs font-medium text-primary transition-colors hover:text-primary/80"
            >
              View all <ChevronRight className="size-3" />
            </button>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto">
            {SQUAD_MEMBERS.map((player) => (
              <div
                key={player.name}
                className="flex flex-col items-center gap-1"
              >
                {/* Avatar circle with player initials */}
                <div className="flex size-9 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
                  {player.initials}
                </div>
                <span className="w-14 truncate text-center text-[10px] text-muted-foreground">
                  {player.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Private sub-components & data
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Hard-coded match results for the performance bar chart (W = Win, D = Draw, L = Loss). */
const MATCH_RESULTS = ["W", "W", "D", "L", "W", "D", "L", "W"] as const;

/** Sample squad members shown in the avatar strip. */
const SQUAD_MEMBERS = [
  { name: "J. Silva", initials: "JS" },
  { name: "M. Torres", initials: "MT" },
  { name: "A. Costa", initials: "AC" },
  { name: "R. Mendes", initials: "RM" },
  { name: "L. Santos", initials: "LS" },
  { name: "D. Ferreira", initials: "DF" },
] as const;

/* ── StatCard ────────────────────────────────────────────────────────────── */

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix?: string;
  /** If true the value is rendered in the brand primary colour. */
  highlight?: boolean;
}

/** Compact stat card used in the summary row. */
function StatCard({ icon, label, value, suffix, highlight }: StatCardProps) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px] font-medium uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p
        className={cn(
          "text-lg font-bold leading-tight sm:text-xl",
          highlight ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </p>
      {suffix && (
        <span className="text-[10px] text-muted-foreground">{suffix}</span>
      )}
    </div>
  );
}

/* ── TeamBadge ───────────────────────────────────────────────────────────── */

interface TeamBadgeProps {
  name: string;
  short: string;
  align?: "left" | "right";
}

/** Small team identifier used in the match cards. */
function TeamBadge({ name, short, align = "left" }: TeamBadgeProps) {
  return (
    <div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}>
      <div className="flex size-8 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground">
        {short}
      </div>
      <span className="hidden text-xs font-medium text-foreground sm:inline">
        {name}
      </span>
    </div>
  );
}

/* ── ResultRow ───────────────────────────────────────────────────────────── */

interface ResultRowProps {
  name: string;
  score: number;
  winner?: boolean;
}

/** Single team row inside the last-result card. */
function ResultRow({ name, score, winner }: ResultRowProps) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "text-xs",
          winner ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          winner ? "text-primary" : "text-muted-foreground",
        )}
      >
        {score}
      </span>
    </div>
  );
}
