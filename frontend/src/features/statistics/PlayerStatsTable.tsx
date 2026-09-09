import { cn } from "@/lib/utils";
import type { PlayerStatLine } from "./types";
import { MAX_COMPARE_ATHLETES } from "./useStatisticsFilters";

const PLAYER_COLUMNS = [
  { key: "compare", label: "CMP", className: "w-12 text-center" },
  { key: "name", label: "PLAYER", className: "min-w-[120px]" },
  { key: "appearances", label: "APPS", className: "w-14 text-center" },
  { key: "goals", label: "GOALS", className: "w-14 text-center" },
  { key: "assists", label: "AST", className: "w-14 text-center" },
  { key: "yellowCards", label: "YELLOW", className: "w-14 text-center" },
  { key: "redCards", label: "RED", className: "w-14 text-center" },
] as const;

export function PlayerStatsTable({
  players,
  selectedId,
  onSelect,
  compareIds,
  onToggleCompare,
}: {
  players: PlayerStatLine[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  compareIds: string[];
  onToggleCompare: (id: string) => void;
}) {
  const compareIsFull = compareIds.length >= MAX_COMPARE_ATHLETES;

  if (players.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No player statistics recorded yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {PLAYER_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("py-3 px-4", col.className)}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const isSelected = player.athleteId === selectedId;
            const isComparing = compareIds.includes(player.athleteId);
            return (
              <tr
                key={player.athleteId}
                onClick={() => onSelect(player.athleteId)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors last:border-b-0",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted/30",
                )}
              >
                <td
                  className="px-4 py-3 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isComparing}
                    // Once three are picked the rest are locked until one is
                    // cleared — the compare endpoint accepts at most three.
                    disabled={!isComparing && compareIsFull}
                    onChange={() => onToggleCompare(player.athleteId)}
                    aria-label={`Compare ${player.name}`}
                    className="size-4 rounded border-input accent-primary disabled:opacity-40"
                  />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-semibold",
                      isSelected ? "text-primary" : "text-foreground",
                    )}
                  >
                    {player.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-foreground">
                  {player.appearances}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-center tabular-nums font-semibold",
                    player.goals > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {player.goals}
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-center tabular-nums font-semibold",
                    player.assists > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {player.assists}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-amber-400">
                  {player.yellowCards}
                </td>
                <td className="px-4 py-3 text-center tabular-nums text-red-400">
                  {player.redCards}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
