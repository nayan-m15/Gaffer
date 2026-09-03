import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StandingFormValues } from "@/features/statistics/types";

interface StandingFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues: StandingFormValues | null;
  onSubmit: (values: StandingFormValues) => void;
}

const DEFAULT_VALUES: StandingFormValues = {
  teamName: "",
  position: 1,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  points: 0,
  isOwnTeam: false,
};

/**
 * StandingFormDialog — add / edit a standings row.
 *
 * Standings are manually entered by the coach since the app doesn't track
 * other teams' results. Follows the same overlay / form-field styling as
 * `AthleteFormDialog`.
 */
export function StandingFormDialog({
  isOpen,
  onClose,
  initialValues,
  onSubmit,
}: StandingFormDialogProps) {
  const isEditing = initialValues !== null;
  const title = isEditing ? "Edit Standing" : "Add Standing";

  const [values, setValues] = useState<StandingFormValues>(DEFAULT_VALUES);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues ?? DEFAULT_VALUES);
    setError(null);
  }, [initialValues, isOpen]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof StandingFormValues>(
    field: K,
    value: StandingFormValues[K],
  ) => {
    setError(null);
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "won" || field === "drawn" || field === "lost") {
        const w = field === "won" ? (value as number) : prev.won;
        const d = field === "drawn" ? (value as number) : prev.drawn;
        const l = field === "lost" ? (value as number) : prev.lost;
        next.played = Math.max(0, w + d + l);
        next.points = Math.max(0, w * 3 + d);
      }
      return next;
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (values.played !== values.won + values.drawn + values.lost) {
      setError("Played matches must equal Won + Drawn + Lost.");
      return;
    }
    if (values.points !== values.won * 3 + values.drawn) {
      setError("Points must equal (Won × 3) + Drawn.");
      return;
    }
    onSubmit({
      ...values,
      teamName: values.teamName.trim(),
    });
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
        aria-labelledby="standing-form-title"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="standing-form-title"
            className="text-lg font-bold text-foreground"
          >
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
          <FormField label="Team name">
            <input
              type="text"
              value={values.teamName}
              onChange={(e) => handleChange("teamName", e.target.value)}
              placeholder="e.g. Riverside United"
              required
              maxLength={100}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Position">
              <input
                type="number"
                min={1}
                max={100}
                value={values.position}
                onChange={(e) => handleChange("position", Number(e.target.value))}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
            <FormField label="Played">
              <input
                type="number"
                min={0}
                max={100}
                value={values.played}
                onChange={(e) => handleChange("played", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
            <FormField label="Points">
              <input
                type="number"
                min={0}
                max={300}
                value={values.points}
                onChange={(e) => handleChange("points", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <FormField label="Won">
              <input
                type="number"
                min={0}
                max={100}
                value={values.won}
                onChange={(e) => handleChange("won", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
            <FormField label="Drawn">
              <input
                type="number"
                min={0}
                max={100}
                value={values.drawn}
                onChange={(e) => handleChange("drawn", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
            <FormField label="Lost">
              <input
                type="number"
                min={0}
                max={100}
                value={values.lost}
                onChange={(e) => handleChange("lost", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Goals For">
              <input
                type="number"
                min={0}
                max={500}
                value={values.goalsFor}
                onChange={(e) => handleChange("goalsFor", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
            <FormField label="Goals Against">
              <input
                type="number"
                min={0}
                max={500}
                value={values.goalsAgainst}
                onChange={(e) => handleChange("goalsAgainst", Number(e.target.value))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2.5">
            <input
              type="checkbox"
              checked={values.isOwnTeam}
              onChange={(e) => handleChange("isOwnTeam", e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            <span className="text-sm font-medium text-foreground">
              This is my team
            </span>
          </label>

          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? "Save Changes" : "Add Standing"}
            </Button>
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
