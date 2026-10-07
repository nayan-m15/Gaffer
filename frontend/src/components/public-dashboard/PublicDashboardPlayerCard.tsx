import { useEffect, useState } from "react";
import { getPositionGroup } from "@/components/roster/position";
import type { PublicPlayer } from "@/services/public-dashboard";

interface PublicDashboardPlayerCardProps { player: PublicPlayer; photoUrl?: string | null; }
export function PublicDashboardPlayerCard({ player, photoUrl }: PublicDashboardPlayerCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [photoUrl]);
  const name = `${player.firstName} ${player.lastName}`.trim();
  const initials = `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`.toUpperCase();
  const position = player.position?.trim().toUpperCase() || "Unassigned";
  const statistics = player.statistics;
  const group = getPositionGroup(player.position);
  const allStats: [string, number][] = [
    ["Appearances", statistics.appearances], ["Starts", statistics.starts],
    ["Minutes played", statistics.minutesPlayed], ["Goals", statistics.goals],
    ["Assists", statistics.assists], ["Saves", statistics.saves],
    ["Yellow cards", statistics.yellowCards], ["Red cards", statistics.redCards],
  ];
  const featured = group === "goalkeeper" ? ["Appearances", "Saves", "Starts"]
    : group === "defender" ? ["Appearances", "Starts", "Assists"]
    : group === "midfielder" ? ["Appearances", "Assists", "Goals"]
    : ["Appearances", "Goals", "Assists"];
  const stats = featured.map(label => allStats.find(([name]) => name === label)!);
  const remaining = allStats.filter(([label]) => !featured.includes(label));
  const renderStat = ([label, value]: [string, number]) => (
    <div key={label} className="min-w-0">
      <dt className="text-[10px] font-semibold leading-tight text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-xl font-extrabold leading-tight tabular-nums text-foreground">{(Number.isFinite(value) ? value : 0).toLocaleString()}</dd>
    </div>
  );
  return (
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border/80 bg-card text-card-foreground shadow-sm">
      <div className="relative flex h-32 shrink-0 items-end justify-center overflow-hidden border-b border-border/70 bg-brand/10 px-5 pt-7">
        {player.squadNumber != null && <span aria-hidden="true" className="pointer-events-none absolute left-3 top-2 text-[110px] font-black leading-none text-brand/15">{player.squadNumber}</span>}
        <span className="absolute left-4 top-3 rounded-lg border border-border/70 bg-card/90 px-2 py-0.5 text-xs font-extrabold tabular-nums text-foreground">
          {player.squadNumber == null ? "No number" : `#${player.squadNumber}`}
        </span>
        <span className="absolute right-4 top-3 max-w-[55%] break-words rounded-full border border-brand/25 bg-card/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-foreground">{position}</span>
        {photoUrl && !photoFailed ? (
          <img src={photoUrl} alt={`${name} profile`} loading="lazy" decoding="async" onError={() => setPhotoFailed(true)} className="relative h-28 w-28 rounded-t-[3rem] object-cover object-top" />
        ) : (
          <div role="img" aria-label={`${name} avatar`} className="relative flex h-24 w-24 items-center justify-center rounded-t-[3rem] border border-b-0 border-brand/20 bg-card/90 shadow-sm">
            <span className="text-3xl font-extrabold tracking-widest text-foreground">{initials || "?"}</span>
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col px-4 pb-4 pt-3">
        <p className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{player.team.name}</p>
        <h3 className="mt-1 min-h-12 [overflow-wrap:anywhere] text-lg font-extrabold leading-6 tracking-tight text-foreground">{name || "Unnamed player"}</h3>
        <div className="mt-2 h-px bg-gradient-to-r from-brand/55 via-border to-transparent" aria-hidden="true" />
        <dl className="mt-4 grid grid-cols-3 gap-2">{stats.map(renderStat)}</dl>
        <details className="mt-4 border-t border-border pt-3">
          <summary className="cursor-pointer rounded text-sm font-semibold text-brand focus-visible:outline-2 focus-visible:outline-brand">More statistics<span className="sr-only"> for {name}</span></summary>
          <dl className="mt-3 grid grid-cols-2 gap-3">{remaining.map(renderStat)}</dl>
        </details>
      </div>
    </article>
  );
}
