import { useEffect, useState } from "react";
import { Check, Copy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TeamInviteResult } from "@/services/team-invites";

interface AssistantInviteDialogProps {
  /** Whether the dialog is visible. */
  isOpen: boolean;
  /** Called when the dialog should close. */
  onClose: () => void;
  /** Called with the entered email when the coach submits the invite form. */
  onInvite: (email: string) => void;
  /** Whether the invite creation request is in flight. */
  isSubmitting: boolean;
  /** Error message from the failed invite creation, if any. */
  submitError: string | null;
  /** When set, the dialog switches from the email form to the link display. */
  result: TeamInviteResult | null;
}

/**
 * AssistantInviteDialog — invites an assistant to the team by email.
 *
 * Two phases: the coach first enters the assistant's email address; once the
 * backend returns the one-time join link, the dialog shows it with a copy
 * button so the coach can share it (no email delivery in this sprint).
 *
 * Shell pattern copied from ClaimInviteDialog: fixed overlay, backdrop blur,
 * card panel, and ghost close button.
 */
export function AssistantInviteDialog({
  isOpen,
  onClose,
  onInvite,
  isSubmitting,
  submitError,
  result,
}: AssistantInviteDialogProps) {
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setEmail("");
    setCopied(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    onInvite(trimmed);
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the text for manual copy
      const input = document.getElementById(
        "assistant-invite-url-input",
      ) as HTMLInputElement | null;
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
        aria-labelledby="assistant-invite-title"
        className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2
            id="assistant-invite-title"
            className="text-lg font-bold text-foreground"
          >
            Invite Assistant
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
            {/* Invited email */}
            <p className="text-sm font-semibold text-foreground">
              {result.email}
            </p>

            {/* Copyable URL field */}
            <div className="flex w-full items-center gap-2">
              <input
                id="assistant-invite-url-input"
                type="text"
                readOnly
                value={result.inviteUrl}
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
              Share this link with the assistant. It is tied to their email
              address, expires in 72 hours, and can only be used once — they
              can create their account straight from the link.
            </p>

            <Button type="button" variant="ghost" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email address
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="assistant@example.com"
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

            <p className="text-xs leading-relaxed text-muted-foreground">
              The assistant will join with view access to the roster, events,
              live logging and statistics — only you can manage athletes and
              invites.
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creating…" : "Create Invite"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
