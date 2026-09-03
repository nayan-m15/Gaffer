import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteGamePlanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  gamePlanName: string;
  isDeleting?: boolean;
}

/**
 * Confirmation modal shown before permanently deleting a saved game plan.
 * This is not reversible.
 */
export function DeleteGamePlanDialog({
  isOpen,
  onClose,
  onConfirm,
  gamePlanName,
  isDeleting,
}: DeleteGamePlanDialogProps) {
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
        aria-labelledby="delete-game-plan-title"
        aria-describedby="delete-game-plan-desc"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Trash2 className="size-5 text-destructive" />
            <h2 id="delete-game-plan-title" className="text-lg font-bold">
              Delete game plan
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
          id="delete-game-plan-desc"
          className="mb-6 text-sm leading-relaxed text-muted-foreground"
        >
          Are you sure you want to delete{" "}
          <strong className="text-foreground">{gamePlanName}</strong>? This
          cannot be undone.
        </p>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
            className="gap-1.5"
          >
            <Trash2 className="size-4" />
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>
    </div>
  );
}
