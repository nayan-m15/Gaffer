import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ClaimInviteResult } from "@/services/athletes";

interface ClaimInviteDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
  /** Athlete display name for the dialog title/copy. */
  athleteName: string;
  /** Called with the entered email when the coach submits the invite form. */
  onInvite: (email: string) => void;
  /** Whether the invite creation request is in flight. */
  isSubmitting: boolean;
  /** Error message from the failed invite creation, if any. */
  submitError: string | null;
  /** When set, the dialog switches from the email form to the sent state. */
  result: ClaimInviteResult | null;
  /** Called when the coach clicks "Revoke invite". */
  onRevoke: () => void;
  /** Whether the revoke action is in progress. */
  isRevoking?: boolean;
}

/**
 * ClaimInviteDialog — invites a player to claim their athlete profile by
 * email. The coach enters the player's email address and the backend sends a
 * one-time claim link directly to that address.
 */
export function ClaimInviteDialog({
  isOpen,
  onClose,
  athleteName,
  onInvite,
  isSubmitting,
  submitError,
  result,
  onRevoke,
  isRevoking,
}: ClaimInviteDialogProps) {
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setEmail("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    onInvite(trimmed);
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
        aria-labelledby="claim-invite-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="claim-invite-title"
            className="text-lg font-bold text-foreground"
          >
            Invite Player
          </h2>
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

        {result ? (
          <div className="flex flex-col items-center gap-5">
            <div className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
              <Check className="size-6 text-emerald-500" />
            </div>

            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">
                Invite sent to {result.email}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {athleteName} can use the link in the email to sign in or
                create an account and claim this player profile.
              </p>
            </div>

            <p className="text-center text-xs leading-relaxed text-muted-foreground">
              The invite expires in 72 hours, can only be used once, and must
              be accepted by an account using the invited email address.
            </p>

            <div className="flex w-full items-center justify-between gap-3">
              <Button type="button" variant="ghost" onClick={onClose}>
                Done
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onRevoke}
                disabled={isRevoking}
                className="border-amber-400/30 text-amber-400 hover:bg-amber-400/10 hover:text-amber-400"
              >
                {isRevoking ? "Revoking…" : "Revoke invite"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <p className="text-sm font-semibold text-foreground">
                {athleteName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter the player's email address. Their one-time claim link
                will be sent directly to this address.
              </p>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email address
              </span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="player@example.com"
                required
                maxLength={255}
                autoComplete="email"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
              />
            </label>

            {submitError && (
              <p role="alert" className="text-xs text-destructive">
                {submitError}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Sending…" : "Send Invite"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
