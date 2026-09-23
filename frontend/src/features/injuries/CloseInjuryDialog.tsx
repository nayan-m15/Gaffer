import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { todayIso } from "./injury-model";
import type { CloseInjuryInput } from "./types";

interface CloseInjuryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The injury title (e.g. "Left hamstring strain"), shown for confirmation. */
  injuryTitle: string;
  /** The injury's own start date — a return can't be marked earlier than it. */
  occurredOn: string;
  onSubmit: (input: CloseInjuryInput) => void;
  isSubmitting?: boolean;
  /** Server-side rejection to surface inline. */
  errorMessage?: string;
}

/**
 * Confirms an athlete is back and closes the injury record.
 *
 * Deliberately still asks for a date rather than assuming "today": a coach
 * often logs this the morning after training resumed, not the moment it
 * happened, and the record should reflect when the athlete actually
 * returned, not when the coach got around to saying so.
 */
export function CloseInjuryDialog({
  isOpen,
  onClose,
  injuryTitle,
  occurredOn,
  onSubmit,
  isSubmitting = false,
  errorMessage,
}: CloseInjuryDialogProps) {
  const [actualReturnOn, setActualReturnOn] = useState(todayIso());
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setActualReturnOn(todayIso());
    setNotes("");
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!actualReturnOn || isSubmitting) {
      return;
    }
    onSubmit({
      actualReturnOn,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
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
        aria-labelledby="close-injury-title"
        className="themed-scrollbar relative max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="close-injury-title"
              className="text-lg font-bold text-foreground"
            >
              Mark as returned
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Closes the record for {injuryTitle} and clears the player for
              selection again.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Date returned
            </span>
            <input
              type="date"
              value={actualReturnOn}
              min={occurredOn}
              max={todayIso()}
              onChange={(event) => setActualReturnOn(event.target.value)}
              required
              className="mt-1.5 h-9 w-full rounded-lg border border-border/70 bg-card/70 px-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Notes <span className="font-normal">(optional)</span>
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Cleared by physio, eased back in training, etc."
              className="mt-1.5 w-full rounded-lg border border-border/70 bg-card/70 px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
            />
          </label>

          {errorMessage && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              {errorMessage}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!actualReturnOn || isSubmitting}>
              {isSubmitting && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              )}
              Mark as returned
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
