import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AthleteFormValues } from "@/services/athletes";

interface AthleteFormDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog should close without saving. */
  onClose: () => void;
  /**
   * Initial form values. When `null` the dialog is in "add" mode and starts
   * with empty/default values.
   */
  initialValues: AthleteFormValues | null;
  /** Called with the submitted form values. */
  onSubmit: (values: AthleteFormValues) => void;
}

const POSITIONS = ["GK", "CB", "LB", "RB", "DM", "CM", "AM", "LW", "RW", "ST"] as const;

const DEFAULT_VALUES: AthleteFormValues = {
  firstName: "",
  lastName: "",
  dateOfBirth: "",
  position: "ST",
  squadNumber: 0,
};

/**
 * AthleteFormDialog — add / edit athlete form.
 *
 * Collects only the fields persisted by the Sprint 1 backend:
 * firstName, lastName, dateOfBirth, position, squadNumber.
 */
export function AthleteFormDialog({
  isOpen,
  onClose,
  initialValues,
  onSubmit,
}: AthleteFormDialogProps) {
  const isEditing = initialValues !== null;
  const title = isEditing ? "Edit Athlete" : "Add Athlete";

  const [values, setValues] = useState<AthleteFormValues>(DEFAULT_VALUES);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues ?? DEFAULT_VALUES);
  }, [initialValues, isOpen]);

  if (!isOpen) return null;

  const handleChange = <K extends keyof AthleteFormValues>(
    field: K,
    value: AthleteFormValues[K],
  ) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    onSubmit({
      ...values,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      position: values.position.trim(),
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
          <div className="grid grid-cols-2 gap-4">
            <FormField label="First name">
              <input
                type="text"
                value={values.firstName}
                onChange={(e) => handleChange("firstName", e.target.value)}
                placeholder="e.g. Alex"
                required
                maxLength={60}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>

            <FormField label="Last name">
              <input
                type="text"
                value={values.lastName}
                onChange={(e) => handleChange("lastName", e.target.value)}
                placeholder="e.g. Morgan"
                required
                maxLength={60}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Jersey number">
              <input
                type="number"
                min={1}
                max={99}
                value={values.squadNumber}
                onChange={(e) => handleChange("squadNumber", Number(e.target.value))}
                required
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </FormField>

            <FormField label="Position">
              <select
                value={values.position}
                onChange={(e) => handleChange("position", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
              >
                {POSITIONS.map((pos) => (
                  <option key={pos} value={pos}>
                    {pos}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField label="Date of birth">
            <input
              type="date"
              value={values.dateOfBirth}
              onChange={(e) => handleChange("dateOfBirth", e.target.value)}
              max={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
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
