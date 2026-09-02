/**
 * Dialog prompting for a name when saving the current board as a new lineup.
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

interface SaveLineupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => Promise<void>;
}

export function SaveLineupDialog({
  open,
  onOpenChange,
  onSave,
}: SaveLineupDialogProps) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const baseId = useId();
  const nameErrorId = `${baseId}-lineupName-error`;

  // Reset the form each time the dialog opens.
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
      setError("Lineup name is required.");
      return;
    }
    if (trimmed.length > 100) {
      setError("Lineup name must be 100 characters or fewer.");
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
          : "Something went wrong saving the lineup. Please try again.";
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
          <DialogTitle>Save lineup</DialogTitle>
          <DialogDescription>
            Give this starting XI a name so you can find and reuse it later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-lineupName`}
              label="Lineup name"
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
              <p id={nameErrorId} role="alert" className="text-xs text-destructive">
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
              {isSubmitting ? "Saving…" : "Save Lineup"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
