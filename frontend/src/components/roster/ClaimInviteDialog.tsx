import { useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";

interface ClaimInviteDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
  /** The one-time claim URL to display and encode as QR. */
  claimUrl: string;
  /** Athlete display name for the dialog title. */
  athleteName: string;
  /** Called when the coach clicks "Revoke invite". */
  onRevoke: () => void;
  /** Whether the revoke action is in progress. */
  isRevoking?: boolean;
}

/**
 * ClaimInviteDialog — shows the generated claim link + QR code so the coach
 * can share it with the player.
 *
 * Shell pattern copied exactly from AthleteFormDialog: fixed overlay,
 * backdrop blur, card panel, and ghost close button.
 */
export function ClaimInviteDialog({
  isOpen,
  onClose,
  claimUrl,
  athleteName,
  onRevoke,
  isRevoking,
}: ClaimInviteDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(claimUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text for manual copy
      const input = document.getElementById("claim-url-input") as HTMLInputElement | null;
      input?.select();
    }
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
          <h2 id="claim-invite-title" className="text-lg font-bold text-foreground">
            Invite to Claim Profile
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

        <div className="flex flex-col items-center gap-5">
          {/* QR code */}
          <div className="rounded-xl border border-border bg-white p-4">
            <QRCodeSVG
              value={claimUrl}
              size={180}
              level="M"
              bgColor="#ffffff"
              fgColor="#000000"
            />
          </div>

          {/* Athlete name */}
          <p className="text-sm font-semibold text-foreground">{athleteName}</p>

          {/* Copyable URL field */}
          <div className="flex w-full items-center gap-2">
            <input
              id="claim-url-input"
              type="text"
              readOnly
              value={claimUrl}
              onClick={(e) => (e.target as HTMLInputElement).select()}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs text-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void handleCopy()}
              className="shrink-0 gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="size-3.5 text-emerald-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="size-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>

          {/* Explanatory copy */}
          <p className="text-center text-xs leading-relaxed text-muted-foreground">
            Share this link with the player. It expires in 72 hours and can
            only be used once.
          </p>

          {/* Actions */}
          <div className="flex w-full items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
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
      </div>
    </div>
  );
}
