import { Archive, Pencil, RotateCcw } from "lucide-react";
import { StatusBadge } from "@/components/roster/StatusBadge";
import type { Athlete } from "@/components/roster/data";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RosterTableProps {
  athletes: Athlete[];
  selectedId: string | null;
  showArchived: boolean;
  onSelect: (athlete: Athlete) => void;
  onEdit: (athlete: Athlete) => void;
  onArchive: (athlete: Athlete) => void;
  onRestore: (athlete: Athlete) => void;
}

const DATA_COLUMNS = [
  { key: "jerseyNumber", label: "#", className: "w-16 text-center" },
  { key: "name", label: "NAME", className: "min-w-[140px]" },
  { key: "position", label: "POS", className: "w-16" },
  { key: "status", label: "STATUS", className: "w-28" },
  { key: "appearances", label: "APPS", className: "w-16 text-center" },
  { key: "goals", label: "GOALS", className: "w-16 text-center" },
  { key: "assists", label: "AST", className: "w-16 text-center" },
] as const;

/**
 * RosterTable — selectable squad table matching the reference design.
 *
 * Highlights the selected row with a brand-coloured border and background,
 * distinguishes non-zero attacking stats in the brand colour, and provides
 * per-row edit / archive / restore actions.
 */
export function RosterTable({
  athletes,
  selectedId,
  showArchived,
  onSelect,
  onEdit,
  onArchive,
  onRestore,
}: RosterTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {DATA_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn("py-3 px-4", col.className)}
              >
                {col.label}
              </th>
            ))}
            <th scope="col" className="w-28 px-4 py-3 text-right">
              ACTIONS
            </th>
          </tr>
        </thead>
        <tbody>
          {athletes.map((athlete) => {
            const isSelected = athlete.id === selectedId;

            return (
              <tr
                key={athlete.id}
                onClick={() => onSelect(athlete)}
                className={cn(
                  "cursor-pointer border-b border-border transition-colors last:border-b-0",
                  isSelected
                    ? "border-brand bg-brand/10"
                    : "hover:bg-muted/30",
                  athlete.isArchived && "opacity-70",
                )}
              >
                <td className="px-4 py-3 text-center">
                  <span
                    className={cn(
                      "inline-flex size-7 items-center justify-center rounded-md text-xs font-bold tabular-nums",
                      isSelected
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {athlete.jerseyNumber}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "font-semibold",
                      isSelected ? "text-brand" : "text-foreground",
                    )}
                  >
                    {athlete.name}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <span className="font-semibold text-cyan-400">
                    {athlete.position}
                  </span>
                </td>

                <td className="px-4 py-3">
                  <StatusBadge status={athlete.status} />
                </td>

                <td className="px-4 py-3 text-center tabular-nums text-foreground">
                  {athlete.appearances}
                </td>

                <td
                  className={cn(
                    "px-4 py-3 text-center tabular-nums font-semibold",
                    athlete.goals > 0 ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {athlete.goals}
                </td>

                <td
                  className={cn(
                    "px-4 py-3 text-center tabular-nums font-semibold",
                    athlete.assists > 0 ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {athlete.assists}
                </td>

                <td className="px-4 py-3 text-right">
                  <div
                    className="flex items-center justify-end gap-1"
                    onClick={(event) => event.stopPropagation()}
                    role="group"
                    aria-label={`Actions for ${athlete.name}`}
                  >
                    {showArchived ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => onRestore(athlete)}
                        aria-label={`Restore ${athlete.name}`}
                        title="Restore"
                      >
                        <RotateCcw className="size-3.5 text-brand" />
                      </Button>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onEdit(athlete)}
                          aria-label={`Edit ${athlete.name}`}
                          title="Edit"
                        >
                          <Pencil className="size-3.5 text-muted-foreground" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => onArchive(athlete)}
                          aria-label={`Archive ${athlete.name}`}
                          title="Archive"
                        >
                          <Archive className="size-3.5 text-amber-400" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
