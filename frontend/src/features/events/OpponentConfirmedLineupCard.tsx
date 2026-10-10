import type { OpponentLineupView } from "@/features/matches/types";
import { normalizeOpponentLineup } from "../matches/opponent-lineup-model.ts";
import { FORMATIONS } from "../team-management/formations.ts";

export function OpponentConfirmedLineupCard({
  lineup,
  opponentName = "Opponent",
}: {
  lineup: OpponentLineupView | null | undefined;
  opponentName?: string;
}) {
  const view = normalizeOpponentLineup(lineup);
  if (!view.available)
    return (
      <section
        role="status"
        className="rounded-2xl border border-border bg-card p-4"
      >
        Waiting for {opponentName} to confirm their lineup.
      </section>
    );
  const positions = view.formation?.startsWith("custom-")
    ? (view.customPositions ?? [])
    : ((view.formation ? FORMATIONS[view.formation]?.positions : null) ?? []);
  const usedSlots = new Set<string>();
  const placed = view.starters.flatMap((player) => {
    const slot = positions.find((position) => position.id === player.slotId);
    if (!slot || usedSlots.has(slot.id)) return [];
    usedSlots.add(slot.id);
    return [{ player, slot }];
  });
  const rows = [
    { label: "Starters", players: view.starters },
    { label: "Bench", players: view.bench },
  ];
  return (
    <section
      aria-label={`${opponentName} confirmed lineup`}
      className="rounded-2xl border border-border bg-card p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{opponentName} lineup</h2>
        <span className="text-xs text-muted-foreground">
          {view.formation
            ? (FORMATIONS[view.formation]?.name ?? view.formation)
            : "Formation unknown"}
        </span>
      </div>
      {view.source === "squad" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Match squad data; no confirmed formation snapshot.
        </p>
      )}
      {placed.length > 0 && (
        <div
          role="img"
          aria-label={`${opponentName} confirmed pitch positions`}
          className="relative mx-auto mt-4 aspect-[3/4] w-full max-w-sm overflow-hidden rounded-xl border-2 border-white/40 bg-emerald-950"
        >
          <div className="absolute inset-[5%] border border-white/30" />
          <div className="absolute inset-x-[5%] top-1/2 border-t border-white/30" />
          <div className="absolute left-1/2 top-1/2 size-20 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
          {placed.map(({ player, slot }) => (
            <div
              key={player.id}
              className="absolute flex w-20 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center text-white"
              style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-white text-sm font-bold text-emerald-950">
                {player.shirtNumber ?? "\u2013"}
              </span>
              <span
                className="mt-0.5 max-w-full truncate text-[10px]"
                title={player.name}
              >
                {player.name}
              </span>
              <span className="text-[9px] text-white/70">{slot.label}</span>
            </div>
          ))}
        </div>
      )}
      {placed.length < view.starters.length && (
        <p className="mt-3 text-xs text-muted-foreground">
          {view.starters.length - placed.length} starter position
          {view.starters.length - placed.length === 1 ? "" : "s"} unknown.
        </p>
      )}
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {rows.map(({ label, players }) => (
          <div key={label}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </h3>
            {players.length ? (
              <ul className="mt-2 space-y-1">
                {players.map((player) => (
                  <li
                    className="flex items-center gap-2 text-sm"
                    key={player.id}
                  >
                    <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">
                      {player.shirtNumber ?? "\u2013"}
                    </span>
                    <span>{player.name || "Unnamed player"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                No players confirmed.
              </p>
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {view.source === "squad" ? "Match squad" : "Confirmed lineup"} &middot;
        read only
      </p>
    </section>
  );
}
