import { Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DeleteLineupDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the user cancels or closes the dialog. */
  onClose: () => void;
  /** Called when the user confirms the delete action. */
  onConfirm: () => void;
  /** Name of the lineup being deleted. */
  lineupName: string;
  /** Whether the delete request is in flight. */
  isDeleting?: boolean;
}

/**
 * DeleteLineupDialog — confirmation modal shown before permanently deleting
 * a saved lineup. Unlike archiving an athlete, this is not reversible.
 */
export function DeleteLineupDialog({
  isOpen,
  onClose,
  onConfirm,
  lineupName,
  isDeleting,
}: DeleteLineupDialogProps) {
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
        aria-labelledby="delete-lineup-title"
        aria-describedby="delete-lineup-desc"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Trash2 className="size-5 text-destructive" />
            <h2 id="delete-lineup-title" className="text-lg font-bold">
              Delete Lineup
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
          id="delete-lineup-desc"
          className="mb-6 text-sm leading-relaxed text-muted-foreground"
        >
          Are you sure you want to delete{" "}
          <strong className="text-foreground">{lineupName}</strong>? This
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
