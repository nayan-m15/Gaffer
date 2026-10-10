import { Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RemoveAssistantConfirmDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the user cancels or closes the dialog. */
  onClose: () => void;
  /** Called when the user confirms the removal. */
  onConfirm: () => void;
  /** Display name of the assistant being removed. */
  assistantName: string;
  /** Whether the removal request is in flight. */
  isRemoving: boolean;
  /** User-facing copy for a failed removal attempt. */
  errorMessage: string | null;
}

/**
 * RemoveAssistantConfirmDialog — confirmation modal shown before removing an
 * accepted assistant.
 *
 * Removal deletes the assistant's team_members row through
 * DELETE /team-invites/assistants/:id. The assistant immediately loses every
 * team-scoped permission — including PowerSync sync — and can be re-invited
 * later with a fresh invite.
 */
export function RemoveAssistantConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  assistantName,
  isRemoving,
  errorMessage,
}: RemoveAssistantConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={isRemoving ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="remove-assistant-title"
        aria-describedby="remove-assistant-desc"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Trash2 className="size-5 text-destructive" />
            <h2 id="remove-assistant-title" className="text-lg font-bold">
              Remove Assistant
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            type="button"
            onClick={onClose}
            disabled={isRemoving}
            aria-label="Close dialog"
          >
            <X className="size-4" />
          </Button>
        </div>

        <p
          id="remove-assistant-desc"
          className="mb-6 text-sm leading-relaxed text-muted-foreground"
        >
          Are you sure you want to remove{" "}
          <strong className="text-foreground">{assistantName}</strong>?
          They will immediately lose access to your team's roster, events and
          match data. You can invite them again later.
        </p>

        {errorMessage ? (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={isRemoving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            disabled={isRemoving}
            className="gap-1.5"
          >
            {isRemoving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Remove
          </Button>
        </div>
      </div>
    </div>
  );
}
