import { useCallback, useMemo, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { Ban, ChevronLeft, X } from "lucide-react";
import { SportLogo } from "@/components/brand/SportLogo";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OpponentSquadVisibility } from "@/features/events/types";
import {
  OpponentFormationPitch,
  OpponentShirtChip,
  OpponentUnassignedDropZone,
} from "@/features/matches/opponent-formation-pitch";
import { applyOpponentShirtDrop } from "@/features/matches/opponent-shirt-drop";
import {
  applyAssignmentsToPlayers,
  assignmentsFromPlayers,
  MAX_OPPONENT_PLAYERS,
  remapOpponentAssignments,
  unassignedPlayers,
  type DraftOpponentPlayer,
  type OpponentSquadSetupContext,
} from "@/features/matches/opponent-squad-draft";
import type { DragItem } from "@/features/team-management/types";
import {
  DEFAULT_FORMATION_ID,
  FORMATION_OPTIONS,
  FORMATIONS,
} from "@/features/team-management/formations";
import { cn } from "@/lib/utils";

const VISIBILITY_OPTIONS: {
  value: OpponentSquadVisibility;
  label: string;
}[] = [
  { value: "none", label: "No squad info" },
  { value: "numbers", label: "Numbers only" },
  { value: "full", label: "Numbers + names" },
];

const inputClassName =
  "h-11 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30";

export default function OpponentSquadSetupPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const context = useOutletContext<OpponentSquadSetupContext>();
  const confirmPath = `/events/${eventId}/confirm-squad`;

  const [visibility, setVisibility] = useState<OpponentSquadVisibility>(
    context.visibility,
  );
  const [players, setPlayers] = useState<DraftOpponentPlayer[]>(
    context.players,
  );
  const [formationId, setFormationId] = useState(
    FORMATIONS[context.formationId] ? context.formationId : DEFAULT_FORMATION_ID,
  );
  const [assignments, setAssignments] = useState(() =>
    assignmentsFromPlayers(
      FORMATIONS[context.formationId]
        ? context.formationId
        : DEFAULT_FORMATION_ID,
      context.players,
    ),
  );
  const [shirtInput, setShirtInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [formationNotice, setFormationNotice] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);

  const oppColor = context.opponentColor;
  const showSquad = visibility !== "none";

  const assignedCount = useMemo(
    () =>
      Object.values(assignments).filter((value) => Boolean(value)).length,
    [assignments],
  );
  const benchPlayers = useMemo(
    () => unassignedPlayers(players, assignments),
    [players, assignments],
  );

  const goBack = () => {
    navigate(confirmPath);
  };

  const saveAndBack = () => {
    context.onSave({
      visibility,
      players: applyAssignmentsToPlayers(players, formationId, assignments),
      formationId,
    });
    navigate(confirmPath);
  };

  const addPlayer = () => {
    const shirtNumber = Number.parseInt(shirtInput, 10);
    if (!Number.isInteger(shirtNumber) || shirtNumber < 1 || shirtNumber > 99) {
      setAddError("Shirt number must be between 1 and 99.");
      return;
    }
    if (players.some((player) => player.shirtNumber === shirtNumber)) {
      setAddError("That shirt number is already on the list.");
      return;
    }
    if (players.length >= MAX_OPPONENT_PLAYERS) {
      setAddError("A match cannot list more than 30 opponent players.");
      return;
    }
    if (visibility === "full") {
      const name = nameInput.trim();
      if (name.length === 0) {
        setAddError("Enter a name for this opponent player.");
        return;
      }
      if (name.length > 80) {
        setAddError("Name must be 80 characters or fewer.");
        return;
      }
      setPlayers((current) => [...current, { shirtNumber, name }]);
    } else {
      setPlayers((current) => [...current, { shirtNumber }]);
    }
    setShirtInput("");
    setNameInput("");
    setAddError(null);
  };

  const removePlayer = (shirtNumber: number) => {
    const key = String(shirtNumber);
    setPlayers((current) =>
      current.filter((player) => player.shirtNumber !== shirtNumber),
    );
    setAssignments((current) => {
      const next = { ...current };
      for (const slotId of Object.keys(next)) {
        if (next[slotId] === key) {
          next[slotId] = null;
        }
      }
      return next;
    });
  };

  const changeFormation = (nextId: string) => {
    if (nextId === formationId || !FORMATIONS[nextId]) {
      return;
    }
    const previouslyPlaced = Object.values(assignments).filter(Boolean).length;
    const remapped = remapOpponentAssignments(
      formationId,
      nextId,
      assignments,
    );
    const stillPlaced = Object.values(remapped).filter(Boolean).length;
    const movedToBench = previouslyPlaced - stillPlaced;
    setFormationId(nextId);
    setAssignments(remapped);
    setPlayers((current) =>
      applyAssignmentsToPlayers(current, nextId, remapped),
    );
    setFormationNotice(
      movedToBench > 0
        ? `${movedToBench} player${movedToBench === 1 ? "" : "s"} moved to unassigned — tap an empty slot to place them.`
        : null,
    );
  };

  const handleAssignmentsChange = useCallback(
    (next: typeof assignments) => {
      setAssignments(next);
      setPlayers((current) =>
        applyAssignmentsToPlayers(current, formationId, next),
      );
      setFormationNotice((current) =>
        unassignedPlayers(players, next).length === 0 ? null : current,
      );
    },
    [formationId, players],
  );

  const startDrag = useCallback((item: DragItem) => {
    setDragItem(item);
  }, []);
  const endDrag = useCallback(() => {
    setDragItem(null);
  }, []);
  const handleShirtDrop = useCallback(
    (
      source: DragItem,
      target: { type: "pitch"; positionId: string } | { type: "subs" },
    ) => {
      const next = applyOpponentShirtDrop(assignments, source, target);
      if (next) {
        handleAssignmentsChange(next);
      }
      setDragItem(null);
    },
    [assignments, handleAssignmentsChange],
  );

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-6 sm:px-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <SportLogo size={36} className="rounded-lg" />
          <p className="font-display text-base font-bold tracking-wide text-primary">
            GAFFER
          </p>
        </div>
        <Button
          type="button"
          className="h-11 rounded-full px-5 text-xs font-bold uppercase tracking-[0.16em]"
          onClick={saveAndBack}
        >
          Save & back
        </Button>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back to Confirm Squad
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold uppercase tracking-[0.08em] text-foreground">
          Opponent squad
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how much opponent info to log, and place their formation if
          known.
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Squad info mode
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {VISIBILITY_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setVisibility(option.value);
                setAddError(null);
              }}
              className={cn(
                "rounded-xl px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors",
                visibility === option.value
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background text-muted-foreground hover:border-primary/40",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      {!showSquad ? (
        <section className="flex flex-col items-center rounded-2xl border border-border bg-card px-6 py-16 text-center">
          <Ban className="size-12 text-destructive" aria-hidden />
          <h2 className="mt-4 text-lg font-semibold text-foreground">
            No opponent info will be logged
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Events against the opponent will just use their team name — no
            player numbers, names, or formation.
          </p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,18rem)_minmax(0,auto)] xl:grid-cols-[minmax(0,22rem)_minmax(0,auto)]">
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: oppColor }}
            >
              {visibility === "full"
                ? "Opponent players"
                : "Opponent shirt numbers"}
            </h2>

            <form
              className="mt-4 flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                addPlayer();
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-2 sm:w-24 lg:w-28">
                  <Label htmlFor="opponent-setup-shirt">Number</Label>
                  <input
                    id="opponent-setup-shirt"
                    className={cn(inputClassName, "lg:h-14 lg:text-base")}
                    value={shirtInput}
                    onChange={(event) => {
                      setShirtInput(event.target.value);
                      setAddError(null);
                    }}
                    inputMode="numeric"
                    placeholder="9"
                    autoComplete="off"
                    maxLength={2}
                  />
                </div>
                {visibility === "full" && (
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor="opponent-setup-name">Name</Label>
                    <input
                      id="opponent-setup-name"
                      className={inputClassName}
                      value={nameInput}
                      onChange={(event) => {
                        setNameInput(event.target.value);
                        setAddError(null);
                      }}
                      placeholder="Player name"
                      autoComplete="off"
                      maxLength={80}
                    />
                  </div>
                )}
                <Button
                  type="submit"
                  variant="outline"
                  className="lg:h-14 lg:px-5 lg:text-base"
                >
                  + Add {visibility === "full" ? "player" : "number"}
                </Button>
              </div>
              {addError && (
                <p role="alert" className="text-sm text-destructive">
                  {addError}
                </p>
              )}
            </form>

            {visibility === "numbers" ? (
              <ul className="mt-4 flex flex-wrap gap-2">
                {players.map((player) => {
                  const onPitch = !benchPlayers.some(
                    (entry) => entry.shirtNumber === player.shirtNumber,
                  );
                  return (
                    <li key={player.shirtNumber}>
                      {onPitch ? (
                        <span
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-medium text-foreground lg:gap-2 lg:px-4 lg:py-2 lg:text-lg"
                          style={{
                            backgroundColor: `${oppColor}33`,
                            boxShadow: `inset 0 0 0 1px ${oppColor}`,
                          }}
                        >
                          <span className="font-semibold">
                            {player.shirtNumber}
                          </span>
                          <button
                            type="button"
                            className="rounded-full p-0.5 opacity-80 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            aria-label={`Remove opponent #${player.shirtNumber}`}
                            onClick={() => removePlayer(player.shirtNumber)}
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <OpponentShirtChip
                            player={player}
                            opponentColor={oppColor}
                            onDragStart={startDrag}
                            onDragEnd={endDrag}
                            onDrop={handleShirtDrop}
                          />
                          <button
                            type="button"
                            className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                            aria-label={`Remove opponent #${player.shirtNumber}`}
                            onClick={() => removePlayer(player.shirtNumber)}
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <ul className="mt-4 flex flex-col gap-2">
                {players.map((player) => {
                  const unassigned = benchPlayers.some(
                    (entry) => entry.shirtNumber === player.shirtNumber,
                  );
                  return (
                  <li
                    key={player.shirtNumber}
                    className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
                  >
                    {unassigned ? (
                      <OpponentShirtChip
                        player={player}
                        opponentColor={oppColor}
                        showName={false}
                        onDragStart={startDrag}
                        onDragEnd={endDrag}
                        onDrop={handleShirtDrop}
                      />
                    ) : (
                      <span
                        className="font-semibold tabular-nums"
                        style={{ color: oppColor }}
                      >
                        #{player.shirtNumber}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {player.name}
                    </span>
                    {player.position ? (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                        style={{
                          color: oppColor,
                          boxShadow: `inset 0 0 0 1px ${oppColor}`,
                        }}
                      >
                        {player.position}
                      </span>
                    ) : (
                      <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Unassigned
                      </span>
                    )}
                    <button
                      type="button"
                      className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={`Remove opponent #${player.shirtNumber}`}
                      onClick={() => removePlayer(player.shirtNumber)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
            {players.length === 0 ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Add shirt numbers, then tap empty pitch slots or drag them onto
                the pitch to place them.
              </p>
            ) : (
              <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {assignedCount} of 11 placed
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 lg:w-fit lg:max-w-full">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2
                className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                style={{ color: oppColor }}
              >
                Opponent formation
              </h2>
              <Select
                value={formationId}
                onValueChange={(value) => {
                  if (value) {
                    changeFormation(value);
                  }
                }}
              >
                <SelectTrigger
                  aria-label="Select opponent formation"
                  className="min-w-28"
                  style={{ borderColor: oppColor }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMATION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="mt-4 flex flex-col lg:flex-row lg:items-stretch lg:gap-4">
              <div className="min-w-0">
                <OpponentFormationPitch
                  formationId={formationId}
                  assignments={assignments}
                  players={players}
                  opponentColor={oppColor}
                  dragItem={dragItem}
                  onDragStart={startDrag}
                  onDragEnd={endDrag}
                  onAssignmentsChange={handleAssignmentsChange}
                />
                {formationNotice ? (
                  <p role="status" className="mt-3 text-sm text-amber-600 dark:text-amber-400">
                    {formationNotice}
                  </p>
                ) : null}
              </div>
              <OpponentUnassignedDropZone
                dragItem={dragItem}
                onDrop={handleShirtDrop}
                onDragEnd={endDrag}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground lg:hidden">
                  Unassigned · drag onto the pitch or tap an empty slot
                </p>
                <p className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground lg:block">
                  Bench
                </p>
                {benchPlayers.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
                    {benchPlayers.map((player) => (
                      <li key={player.shirtNumber}>
                        <OpponentShirtChip
                          player={player}
                          opponentColor={oppColor}
                          onDragStart={startDrag}
                          onDragEnd={endDrag}
                          onDrop={handleShirtDrop}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Drop a pitch marker here to unassign.
                  </p>
                )}
              </OpponentUnassignedDropZone>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
