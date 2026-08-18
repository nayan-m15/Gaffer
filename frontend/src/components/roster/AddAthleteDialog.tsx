import { useState, useCallback } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Athlete, AthleteStatus } from "@/components/roster/data";

interface AddAthleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (athlete: Athlete) => void;
}

const POSITIONS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"] as const;
const STATUSES: AthleteStatus[] = ["Available", "Injured", "Suspended"];
const FEET: Array<"Left" | "Right" | "Both"> = ["Left", "Right", "Both"];

/**
 * AddAthleteDialog — local-state-only modal for adding a mock athlete.
 *
 * Does not call the backend.  When submitted, it builds a partial athlete
 * object and passes it back to the parent so the roster table updates.
 */
export function AddAthleteDialog({ isOpen, onClose, onAdd }: AddAthleteDialogProps) {
  const [name, setName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [position, setPosition] = useState<typeof POSITIONS[number]>("ST");
  const [status, setStatus] = useState<AthleteStatus>("Available");
  const [preferredFoot, setPreferredFoot] = useState<"Left" | "Right" | "Both">("Right");
  const [age, setAge] = useState("");

  const reset = useCallback(() => {
    setName("");
    setJerseyNumber("");
    setPosition("ST");
    setStatus("Available");
    setPreferredFoot("Right");
    setAge("");
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();

      const number = Number(jerseyNumber) || 0;
      const ageNum = Number(age) || 0;
      const initials = name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "NA";

      const newAthlete: Athlete = {
        id: `ath-${Date.now()}`,
        name: name.trim() || "New Athlete",
        jerseyNumber: number,
        position,
        positionLong: position,
        status,
        appearances: 0,
        goals: 0,
        assists: 0,
        age: ageNum,
        joinedDate: new Date().toLocaleDateString("en-GB", { month: "short", year: "numeric" }),
        preferredFoot,
        yellowCards: 0,
        redCards: 0,
        recentAppearances: [],
        initials,
      };

      onAdd(newAthlete);
      handleClose();
    },
    [age, jerseyNumber, name, onAdd, position, preferredFoot, status, handleClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-athlete-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="add-athlete-title" className="text-lg font-bold text-foreground">
            Add Athlete
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={handleClose}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <FormField label="Full name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              required
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Jersey number">
              <input
                type="number"
                min={1}
                max={99}
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>

            <FormField label="Age">
              <input
                type="number"
                min={15}
                max={60}
                value={age}
                onChange={(e) => setAge(e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Position">
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value as typeof POSITIONS[number])}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Preferred foot">
              <select
                value={preferredFoot}
                onChange={(e) => setPreferredFoot(e.target.value as "Left" | "Right" | "Both")}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              >
                {FEET.map((foot) => (
                  <option key={foot} value={foot}>
                    {foot}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Status">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AthleteStatus)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </FormField>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit">Add Athlete</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Private helpers ────────────────────────────────────────────────────── */

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
}

function FormField({ label, children }: FormFieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
