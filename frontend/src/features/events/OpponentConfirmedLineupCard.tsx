import type { OpponentLineupView } from "@/features/matches/types";

export function OpponentConfirmedLineupCard({
  lineup,
  opponentName = "Opponent",
}: {
  lineup: OpponentLineupView | null | undefined;
  opponentName?: string;
}) {
  if (!lineup?.available || !("starters" in lineup)) return null;

  const rows = [
    { label: "Starters", players: lineup.starters },
    { label: "Bench", players: lineup.bench },
  ];

  return (
    <section
      aria-label={`${opponentName} confirmed lineup`}
      className="rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{opponentName} lineup</h2>
        {lineup.formation && (
          <span className="text-xs text-muted-foreground">{lineup.formation}</span>
        )}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {rows.map(({ label, players }) => (
          <div key={label}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </h3>
            {players.length ? (
              <ul className="mt-2 space-y-1">
                {players.map((player, index) => (
                  <li
                    className="flex items-center gap-2 text-sm"
                    key={`${player.shirtNumber ?? "unknown"}-${player.name}-${index}`}
                  >
                    <span className="w-7 text-right tabular-nums text-muted-foreground">
                      {player.shirtNumber ?? "–"}
                    </span>
                    <span>{player.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No players confirmed.</p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Confirmed lineup · read only</p>
    </section>
  );
}
