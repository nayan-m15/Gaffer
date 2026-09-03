import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompetitionFormValues } from "@/features/statistics/types";

interface CompetitionFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues: CompetitionFormValues | null;
  onSubmit: (values: CompetitionFormValues) => void;
}

const COMPETITION_TYPES = [
  { value: "league", label: "League" },
  { value: "cup", label: "Cup" },
  { value: "friendly", label: "Friendly" },
] as const;

const DEFAULT_VALUES: CompetitionFormValues = {
  name: "",
  type: "league",
  season: "",
};

/**
 * CompetitionFormDialog — add / edit a competition.
 *
 * Collects name, type (league / cup / friendly) and an optional season
 * label. Follows the same overlay / form-field styling as
 * `AthleteFormDialog`.
 */
export function CompetitionFormDialog({
  isOpen,
  onClose,
  initialValues,
  onSubmit,
}: CompetitionFormDialogProps) {
  const isEditing = initialValues !== null;
  const title = isEditing ? "Edit Competition" : "Add Competition";

  const [values, setValues] = useState<CompetitionFormValues>(DEFAULT_VALUES);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues ?? DEFAULT_VALUES);
  }, [initialValues, isOpen]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof CompetitionFormValues>(
    field: K,
    value: CompetitionFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...values,
      name: values.name.trim(),
      season: values.season.trim(),
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
        aria-labelledby="competition-form-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="competition-form-title"
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
          <FormField label="Competition name">
            <input
              type="text"
              value={values.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. Premier League"
              required
              maxLength={100}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select
                value={values.type}
                onChange={(e) =>
                  handleChange("type", e.target.value as CompetitionFormValues["type"])
                }
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              >
                {COMPETITION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Season">
              <input
                type="text"
                value={values.season}
                onChange={(e) => handleChange("season", e.target.value)}
                placeholder="e.g. 2025/26"
                maxLength={20}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {isEditing ? "Save Changes" : "Add Competition"}
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
