/**
 * Confirmation shown before clearing every player's instructions in a plan.
 *
 * It only touches the plan being edited and is undone by leaving without
 * saving, but it discards work across the whole XI at once, so it is confirmed
 * the same way deleting a plan is.
 */

import { RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ResetInstructionsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ResetInstructionsDialog({
  isOpen,
  onClose,
  onConfirm,
}: ResetInstructionsDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-instructions-title"
        aria-describedby="reset-instructions-desc"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <RotateCcw className="size-5 text-primary" />
            <h2 id="reset-instructions-title" className="text-lg font-bold">
              Reset all player instructions?
            </h2>
          </div>
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

        <p
          id="reset-instructions-desc"
          className="mb-6 text-sm leading-relaxed text-muted-foreground"
        >
          All custom instructions for this game plan will be replaced with the
          defaults for each player&rsquo;s position.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} className="gap-1.5">
            <RotateCcw className="size-4" />
            Reset All
          </Button>
        </div>
      </div>
    </div>
  );
}
