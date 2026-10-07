import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useResumeMatch } from "./hooks";
import type { MatchRecord } from "./types";

export function ResumeMatchDialog({ match, onClose, onResumed }: {
  match: Pick<MatchRecord, "id" | "clockRevision" | "sharedSessionId">;
  onClose: () => void;
  onResumed: () => void;
}) {
  const resume = useResumeMatch(match.id);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    if (resume.isPending) return;
    setError(null);
    try {
      await resume.mutateAsync(match.clockRevision);
      onClose();
      onResumed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not resume the match.");
    }
  };
  return (
    <Dialog open onOpenChange={open => { if (!open && !resume.isPending) onClose(); }}>
      <DialogContent showCloseButton={false}>
        <DialogTitle>Resume match?</DialogTitle>
        <DialogDescription>
          {match.sharedSessionId
            ? "Both teams will return to live play from the saved match time. Any pending report confirmations will be cleared."
            : "Return to live play from the saved match time."}
        </DialogDescription>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={resume.isPending} onClick={onClose}
            className="rounded-lg border border-border-default px-4 py-2 text-sm disabled:opacity-50">Cancel</button>
          <button type="button" disabled={resume.isPending} onClick={() => void confirm()}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {resume.isPending ? "Resuming…" : "Resume match"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
