/**
 * Dialog prompting for a name when saving the current settings as a new game
 * plan.
 */

import { useEffect, useId, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FloatingLabelInput } from "@/components/ui/floating-label-input";
import { ApiError } from "@/lib/api";

interface SaveGamePlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
}

export function SaveGamePlanDialog({
  open,
  onOpenChange,
  onSave,
}: SaveGamePlanDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const baseId = useId();
  const nameErrorId = `${baseId}-gamePlanName-error`;

  useEffect(() => {
    if (open) {
      setName("");
      setError(null);
    }
  }, [open]);

  const resetAndClose = () => {
    setName("");
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmed = name.trim();
    if (!trimmed) {
      setError("Game plan name is required.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Game plan name must be 100 characters or fewer.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await onSave(trimmed);
      resetAndClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong saving the game plan. Please try again.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) {
          if (!next) resetAndClose();
          else onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save game plan</DialogTitle>
          <DialogDescription>
            Name this tactical profile so you can switch to it per fixture —
            e.g. "Balanced", "Cup final low block".
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-gamePlanName`}
              label="Game plan name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="off"
              autoFocus
              required
              maxLength={100}
              aria-invalid={!!error}
              aria-describedby={error ? nameErrorId : undefined}
            />
            {error && (
              <p
                id={nameErrorId}
                role="alert"
                className="text-xs text-destructive"
              >
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={resetAndClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : "Save game plan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
