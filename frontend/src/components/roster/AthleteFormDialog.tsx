import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Athlete, AthleteStatus } from "@/components/roster/data";

interface AthleteFormDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog should close without saving. */
  onClose: () => void;
  /**
   * Athlete to edit. When `null` the dialog is in "add" mode and starts
   * with empty/default values.
   */
  athlete: Athlete | null;
  /** Called with the new or updated athlete object. */
  onSave: (athlete: Athlete) => void;
}

const POSITIONS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"] as const;
const STATUSES: AthleteStatus[] = ["Available", "Injured", "Suspended"];
const FEET: Array<"Left" | "Right" | "Both"> = ["Left", "Right", "Both"];

/**
 * AthleteFormDialog — generic add / edit athlete form.
 *
 * In edit mode the form is pre-filled with the existing athlete.  In add mode
 * it creates a fresh mock athlete with zeroed stats and `isArchived: false`.
 * All changes are local-only.
 */
export function AthleteFormDialog({ isOpen, onClose, athlete, onSave }: AthleteFormDialogProps) {
  const isEditing = athlete !== null;
  const title = isEditing ? "Edit Athlete" : "Add Athlete";

  const [name, setName] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [position, setPosition] = useState<typeof POSITIONS[number]>("ST");
  const [status, setStatus] = useState<AthleteStatus>("Available");
  const [preferredFoot, setPreferredFoot] = useState<"Left" | "Right" | "Both">("Right");
  const [age, setAge] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    if (athlete) {
      setName(athlete.name);
      setJerseyNumber(athlete.jerseyNumber.toString());
      setPosition(athlete.position as typeof POSITIONS[number]);
      setStatus(athlete.status);
      setPreferredFoot(athlete.preferredFoot);
      setAge(athlete.age.toString());
    } else {
      setName("");
      setJerseyNumber("");
      setPosition("ST");
      setStatus("Available");
      setPreferredFoot("Right");
      setAge("");
    }
  }, [athlete, isOpen]);

  const initials = useMemo(() => {
    return (
      name
        .split(" ")
        .map((part) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "NA"
    );
  }, [name]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const number = Number(jerseyNumber) || 0;
    const ageNum = Number(age) || 0;

    if (athlete) {
      onSave({
        ...athlete,
        name: name.trim() || athlete.name,
        jerseyNumber: number,
        position,
        positionLong: position,
        status,
        preferredFoot,
        age: ageNum,
        initials,
      });
    } else {
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
        isArchived: false,
      };
      onSave(newAthlete);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="athlete-form-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="athlete-form-title" className="text-lg font-bold text-foreground">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
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
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{isEditing ? "Save Changes" : "Add Athlete"}</Button>
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
