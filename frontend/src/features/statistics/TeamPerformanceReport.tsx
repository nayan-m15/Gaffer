import { Award, CalendarDays, MapPin, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { AppCard } from "@/components/app/AppCard";
import { isGoalkeeperPosition } from "@/features/matches/opposing-goalkeeper";
import { StatCardsGrid } from "./StatCardsGrid";
import { formatDate } from "./formatting";
import { reportHighlights, resultLabel, type TeamReportData } from "./team-report-model";

export function TeamPerformanceReport({ data }: { data: TeamReportData }) {
  const { overview, context } = data;
  const highlights = reportHighlights(overview);

  return (
    <article className="team-performance-report space-y-6" aria-labelledby="team-report-title">
      <AppCard className="report-cover relative overflow-hidden p-6 sm:p-8">
        <div className="absolute inset-y-0 left-0 w-1.5 bg-primary" aria-hidden="true" />
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-primary">Gaffer report</p>
            <h2 id="team-report-title" className="mt-2 font-display text-2xl font-semibold text-foreground sm:text-3xl">
              Team Performance Report
            </h2>
            <p className="mt-1 text-lg font-semibold text-foreground">{context.teamName}</p>
          </div>
          <dl className="grid gap-2 text-sm sm:min-w-64">
            <Metadata icon={<Trophy />} label="Competition" value={context.competitionName} />
            <Metadata icon={<CalendarDays />} label="Season" value={context.seasonName} />
            <Metadata icon={<MapPin />} label="Period" value={context.dateRange} />
          </dl>
        </div>
        <p className="mt-6 border-t border-border pt-3 text-xs text-muted-foreground">
          Generated {context.generatedAt.toLocaleString()}
        </p>
      </AppCard>

      <section aria-labelledby="summary-heading">
        <ReportHeading id="summary-heading">Team summary</ReportHeading>
        <StatCardsGrid overview={overview} />
      </section>

      {highlights.length > 0 && (
        <section aria-labelledby="highlights-heading">
          <ReportHeading id="highlights-heading">Performance highlights</ReportHeading>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {highlights.map((highlight) => (
              <AppCard key={highlight.label} className="report-keep p-4">
                <div className="flex items-center gap-2 text-primary">
                  <Award className="size-4" />
                  <p className="text-[10px] font-bold uppercase tracking-wider">{highlight.label}</p>
                </div>
                <p className="mt-3 font-semibold text-foreground">{highlight.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{highlight.detail}</p>
              </AppCard>
            ))}
          </div>
        </section>
      )}

      <ReportTableSection title="Match results">
        {overview.trends.length > 0 && (
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr><Th>Date</Th><Th>Opponent</Th><Th>Venue</Th><Th>Score</Th><Th>Result</Th></tr></thead>
            <tbody>
              {[...overview.trends].reverse().map((match) => (
                <tr key={match.matchId} className="border-b border-border/70 last:border-0">
                  <Td>{formatDate(match.date)}</Td><Td strong>{match.opponent}</Td>
                  <Td>{match.isHome ? "Home" : "Away"}</Td>
                  <Td strong>{match.goalsFor}–{match.goalsAgainst}</Td>
                  <Td><ResultPill result={match.result}>{resultLabel(match.result)}</ResultPill></Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {overview.trends.length === 0 && <EmptyRow text="No matches in the selected report period." />}
      </ReportTableSection>

      <ReportTableSection title="Player performance">
        {overview.players.length > 0 && (
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr><Th>Player</Th><Th numeric>Apps</Th><Th numeric>Goals</Th><Th numeric>Assists</Th><Th numeric>Yellow</Th><Th numeric>Red</Th><Th numeric>Saves</Th></tr></thead>
            <tbody>
              {overview.players.map((player) => {
                const saves = isGoalkeeperPosition(player.position) ? player.saves : null;
                return (
                  <tr key={player.athleteId} className="border-b border-border/70 last:border-0">
                    <Td strong>{player.name}</Td><Td numeric>{player.appearances}</Td>
                    <Td numeric>{player.goals}</Td><Td numeric>{player.assists}</Td>
                    <Td numeric>{player.yellowCards}</Td><Td numeric>{player.redCards}</Td>
                    <Td numeric>
                      {saves !== null ? (
                        saves
                      ) : (
                        <span
                          className="text-xs font-normal text-muted-foreground opacity-40"
                          aria-hidden="true"
                        >
                          -
                        </span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {overview.players.length === 0 && <EmptyRow text="No player statistics in the selected report period." />}
      </ReportTableSection>

      <footer className="report-document-footer hidden border-t border-border pt-3 text-xs text-muted-foreground">
        Gaffer · {context.teamName} · Team Performance Report
      </footer>
    </article>
  );
}

function Metadata({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-start gap-2 [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:text-primary"><span>{icon}</span><div><dt className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="text-foreground">{value}</dd></div></div>;
}
function ReportHeading({ id, children }: { id: string; children: ReactNode }) {
  return <h3 id={id} className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{children}</h3>;
}
function ReportTableSection({ title, children }: { title: string; children: ReactNode }) {
  return <AppCard className="report-table-section p-0"><div className="border-b border-border px-5 py-4"><h3 className="text-xs font-bold uppercase tracking-[0.14em] text-foreground">{title}</h3></div><div className="overflow-x-auto">{children}</div></AppCard>;
}
function Th({ children, numeric = false }: { children: ReactNode; numeric?: boolean }) {
  return <th scope="col" className={`bg-muted/50 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground ${numeric ? "text-center" : "text-left"}`}>{children}</th>;
}
function Td({ children, numeric = false, strong = false }: { children: ReactNode; numeric?: boolean; strong?: boolean }) {
  return <td className={`px-4 py-3 text-foreground ${numeric ? "text-center tabular-nums" : "text-left"} ${strong ? "font-semibold" : ""}`}>{children}</td>;
}
function ResultPill({ result, children }: { result: "W" | "D" | "L"; children: ReactNode }) {
  const tone = result === "W" ? "bg-primary/10 text-primary" : result === "L" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${tone}`}>{children}</span>;
}
function EmptyRow({ text }: { text: string }) {
  return <p className="px-6 py-12 text-center text-sm text-muted-foreground">{text}</p>;
}
