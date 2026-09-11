import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeasonFormValues } from "@/features/statistics/types";

interface SeasonFormDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialValues: SeasonFormValues | null;
  onSubmit: (values: SeasonFormValues) => void;
  /** Pre-filled values for the "add" case, e.g. a suggested season name. */
  defaultValues?: SeasonFormValues;
  /** Server-side rejection (overlapping range, duplicate name) to surface inline. */
  errorMessage?: string;
}

const DEFAULT_VALUES: SeasonFormValues = {
  name: "",
  startDate: "",
  endDate: "",
  isCurrent: true,
};

/**
 * SeasonFormDialog — add / edit a season.
 *
 * Native date inputs keep the value in the `YYYY-MM-DD` shape the API expects,
 * with no parsing in between. The end-after-start rule is enforced here for
 * fast feedback and again on the server, which also owns the overlap check it
 * alone can see.
 */
export function SeasonFormDialog({
  isOpen,
  onClose,
  initialValues,
  onSubmit,
  defaultValues,
  errorMessage,
}: SeasonFormDialogProps) {
  const isEditing = initialValues !== null;
  const title = isEditing ? "Edit Season" : "Add Season";

  const [values, setValues] = useState<SeasonFormValues>(DEFAULT_VALUES);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues ?? defaultValues ?? DEFAULT_VALUES);
  }, [defaultValues, initialValues, isOpen]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof SeasonFormValues>(
    field: K,
    value: SeasonFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const rangeIsInvalid =
    values.startDate !== "" &&
    values.endDate !== "" &&
    values.startDate >= values.endDate;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (rangeIsInvalid) return;
    onSubmit({ ...values, name: values.name.trim() });
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
        aria-labelledby="season-form-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="season-form-title" className="text-lg font-bold text-foreground">
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
          <FormField label="Season name">
            <input
              type="text"
              value={values.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g. 2025/26"
              required
              maxLength={50}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start date">
              <input
                type="date"
                value={values.startDate}
                onChange={(e) => handleChange("startDate", e.target.value)}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>

            <FormField label="End date">
              <input
                type="date"
                value={values.endDate}
                onChange={(e) => handleChange("endDate", e.target.value)}
                required
                min={values.startDate || undefined}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={values.isCurrent}
              onChange={(e) => handleChange("isCurrent", e.target.checked)}
              className="size-4 rounded border-input accent-primary"
            />
            <span className="text-sm text-foreground">
              Make this the current season
            </span>
          </label>

          {rangeIsInvalid && (
            <p className="text-sm text-destructive">
              The end date must be after the start date.
            </p>
          )}

          {errorMessage && !rangeIsInvalid && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={rangeIsInvalid}>
              {isEditing ? "Save Changes" : "Add Season"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Private helpers ────────────────────────────────────────────────────── */

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
