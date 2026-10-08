import { useState } from "react";
import { UserRound } from "lucide-react";
import { getPositionGroup } from "@/components/roster/position";
import type { PublicPlayer } from "@/services/public-dashboard";

interface PublicDashboardPlayerCardProps {
  player: PublicPlayer;
  photoUrl?: string | null;
}

export function PublicDashboardPlayerCard({ player, photoUrl }: PublicDashboardPlayerCardProps) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const name = `${player.firstName} ${player.lastName}`.trim();
  const position = player.position?.trim().toUpperCase() || "UN";
  const statistics = player.statistics;
  const stats: [string, number | null | undefined][] = [
    ["Appearances", statistics.appearances],
    ["Goals", statistics.goals],
    ["Starts", statistics.starts],
    ["Assists", statistics.assists],
    ["Yellow cards", statistics.yellowCards],
    ["Red cards", statistics.redCards],
  ];
  if (getPositionGroup(player.position) === "goalkeeper") {
    stats.push(["Saves", statistics.saves]);
  }

  return (
    <article className="public-player-card flex h-full min-w-0 flex-col rounded-[inherit] border border-brand/65 bg-card p-4 text-card-foreground shadow-sm sm:p-5">
      <div className="flex shrink-0 items-center justify-between gap-3">
        <span className="flex h-9 min-w-12 items-center justify-center rounded-lg border border-border bg-muted/40 px-2 text-[clamp(1rem,1.5vw,1.25rem)] font-extrabold leading-none tabular-nums">
          {player.squadNumber == null ? "—" : `#${player.squadNumber}`}
        </span>
        <span title={position} className="flex h-9 min-w-12 max-w-[60%] items-center justify-center rounded-lg border border-brand/50 bg-brand/10 px-2 text-[clamp(0.875rem,1.4vw,1.125rem)] font-extrabold leading-none">
          <span className="truncate">{position}</span>
        </span>
      </div>

      <div className="my-4 flex min-w-0 shrink-0 items-center gap-2.5">
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand/40 bg-background/40 text-brand sm:size-12">
          {photoUrl && failedPhoto !== photoUrl ? (
            <img
              src={photoUrl}
              alt={`${name} profile`}
              loading="lazy"
              decoding="async"
              draggable={false}
              onError={() => setFailedPhoto(photoUrl)}
              className="size-full object-cover object-top"
            />
          ) : (
            <UserRound role="img" aria-label={`${name} avatar`} className="size-6 sm:size-7" strokeWidth={1.4} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p title={player.lastName || player.firstName} className="truncate text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            {player.lastName || player.firstName}
          </p>
          <h3 title={name} className="mt-1 truncate text-[clamp(1.125rem,1.8vw,1.5rem)] font-extrabold leading-tight tracking-tight">
            {name}
          </h3>
        </div>
      </div>

      <div className="flex h-px shrink-0 bg-border/70" aria-hidden="true">
        <span className="w-1/3 bg-brand/70" />
      </div>
      <dl className="mt-4 grid flex-1 grid-cols-2 auto-rows-fr gap-x-3 gap-y-2">
        {stats.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-medium leading-snug text-muted-foreground">{label}</dt>
            <dd className="mt-1 truncate text-[clamp(1.5rem,2.2vw,1.75rem)] font-extrabold leading-none tabular-nums" title={typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : "Unavailable"}>
              {typeof value === "number" && Number.isFinite(value) ? value.toLocaleString() : <span aria-label="Unavailable">—</span>}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
