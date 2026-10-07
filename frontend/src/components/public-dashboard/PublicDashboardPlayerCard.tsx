import { useState } from "react";
import { UserRound } from "lucide-react";
import type { PublicPlayer } from "@/services/public-dashboard";

interface PublicDashboardPlayerCardProps {
  player: PublicPlayer;
  photoUrl?: string | null;
}

export function PublicDashboardPlayerCard({
  player,
  photoUrl,
}: PublicDashboardPlayerCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const name = `${player.firstName} ${player.lastName}`.trim();
  const initials = `${player.firstName.charAt(0)}${player.lastName.charAt(0)}`.toUpperCase();
  const position = player.position?.trim().toUpperCase() || "UN";
  const isGoalkeeper = /\b(GK|GOALKEEPER|KEEPER)\b/.test(position);
  const statistics = player.statistics;
  const stats = isGoalkeeper
    ? [
        ["Appearances", statistics.appearances],
        ["Saves", statistics.saves],
        ["Starts", statistics.starts],
        ["Minutes", statistics.minutesPlayed],
        ["Yellow cards", statistics.yellowCards],
        ["Red cards", statistics.redCards],
      ]
    : [
        ["Appearances", statistics.appearances],
        ["Goals", statistics.goals],
        ["Minutes", statistics.minutesPlayed],
        ["Assists", statistics.assists],
        ["Yellow cards", statistics.yellowCards],
        ["Red cards", statistics.redCards],
      ];

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-3xl border border-border/80 bg-card text-card-foreground shadow-sm transition-[border-color,box-shadow,transform] duration-200 motion-safe:hover:-translate-y-1 hover:border-brand/45 hover:shadow-lg dark:bg-card">
      <div className="relative flex min-h-44 items-center justify-center overflow-hidden border-b border-border/70 bg-muted/45 px-5 pt-7 dark:bg-muted/30">
        <span
          className="pointer-events-none absolute inset-x-8 bottom-0 h-28 rounded-t-full bg-brand/10 blur-3xl"
          aria-hidden="true"
        />
        <span className="absolute left-5 top-4 rounded-lg border border-border/70 bg-card/80 px-2.5 py-1 text-sm font-extrabold tabular-nums text-foreground">
          {player.squadNumber == null ? "—" : `#${player.squadNumber}`}
        </span>
        <span className="absolute right-5 top-4 rounded-full border border-brand/25 bg-brand/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-foreground">
          {position}
        </span>
        {photoUrl && !photoFailed ? (
          <img
            src={photoUrl}
            alt={`${name} profile`}
            loading="lazy"
            decoding="async"
            onError={() => setPhotoFailed(true)}
            className="relative h-36 w-36 rounded-t-[3.5rem] object-cover object-top"
          />
        ) : (
          <div
            role="img"
            aria-label={`${name} avatar`}
            className="relative flex h-32 w-32 flex-col items-center justify-center rounded-t-[3.5rem] border border-b-0 border-brand/20 bg-card/75 text-brand shadow-sm"
          >
            <UserRound className="size-12" strokeWidth={1.3} aria-hidden="true" />
            <span className="mt-1 text-sm font-extrabold tracking-widest text-foreground">
              {initials || "?"}
            </span>
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-5 pb-5 pt-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {player.team.name}
        </p>
        <h3 className="mt-1 min-h-14 break-words text-xl font-extrabold leading-tight tracking-tight text-foreground">
          {name}
        </h3>
        <div className="mt-3 h-px bg-gradient-to-r from-brand/55 via-border to-transparent" aria-hidden="true" />
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {stats.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[11px] font-semibold leading-tight text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">
                {(typeof value === "number" && Number.isFinite(value) ? value : 0).toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}
