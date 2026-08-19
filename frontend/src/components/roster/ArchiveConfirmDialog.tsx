import { Archive, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ArchiveConfirmDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the user cancels or closes the dialog. */
  onClose: () => void;
  /** Called when the user confirms the archive action. */
  onConfirm: () => void;
  /** Display name of the athlete being archived. */
  athleteName: string;
}

/**
 * ArchiveConfirmDialog — confirmation modal shown before archiving an athlete.
 *
 * Archiving is a soft-delete persisted through DELETE /athletes/:id. The
 * athlete is hidden from the active roster and can be restored later.
 */
export function ArchiveConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  athleteName,
}: ArchiveConfirmDialogProps) {
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
        aria-labelledby="archive-title"
        aria-describedby="archive-desc"
        className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-foreground">
            <Archive className="size-5 text-amber-400" />
            <h2 id="archive-title" className="text-lg font-bold">
              Archive Athlete
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

        <p id="archive-desc" className="mb-6 text-sm leading-relaxed text-muted-foreground">
          Are you sure you want to archive <strong className="text-foreground">{athleteName}</strong>?
          Archived athletes are removed from the active roster but can be restored at any time.
        </p>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={onConfirm}
            className="gap-1.5"
          >
            <Archive className="size-4" />
            Archive
          </Button>
        </div>
      </div>
    </div>
  );
}
