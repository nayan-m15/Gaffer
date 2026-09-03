import { useId, useState, type FormEvent } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { apiFetch, ApiError } from "@/lib/api";

interface AddTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Lets a coach with no team yet create one, without leaving the dashboard.
 * Posts to `POST /teams`, then refreshes the session so `useAuth().team`
 * updates everywhere (header, sidebar, etc.) without a page reload.
 */
export function AddTeamModal({ open, onOpenChange }: AddTeamModalProps) {
  const { refreshSession } = useAuth();
  const [teamName, setTeamName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const baseId = useId();
  const nameErrorId = `${baseId}-teamName-error`;

  const resetAndClose = () => {
    setTeamName("");
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const trimmed = teamName.trim();
    if (!trimmed) {
      setError("Team name is required.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await apiFetch("/teams", {
        method: "POST",
        body: JSON.stringify({ name: trimmed }),
      });
      await refreshSession();
      resetAndClose();
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : "Something went wrong creating your team. Please try again.";
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
          <DialogTitle>Add your team</DialogTitle>
          <DialogDescription>
            Give your team a name to unlock the dashboard, roster, and match
            logging.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <FloatingLabelInput
              id={`${baseId}-teamName`}
              label="Team name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
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
              {isSubmitting ? "Creating…" : "Create Team"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}