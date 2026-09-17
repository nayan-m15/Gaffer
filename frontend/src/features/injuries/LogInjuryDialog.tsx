import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInjuryProtocol } from "./hooks";
import { InjurySpecPicker, type InjurySpec } from "./InjurySpecPicker";
import { todayIso } from "./injury-model";
import type { CreateInjuryInput, InjuryContext } from "./types";

const CONTEXTS: { value: InjuryContext; label: string }[] = [
  { value: "training", label: "Training" },
  { value: "match", label: "Match" },
  { value: "other", label: "Other" },
];

/**
 * The minimum a player needs to be selectable here.
 *
 * Deliberately not the roster page's `Athlete`, which carries display-only
 * derived statistics this dialog has no use for.
 */
export interface InjuryAthleteOption {
  id: string;
  firstName: string;
  lastName: string;
  squadNumber: number | null;
}

const EMPTY_SPEC: InjurySpec = {
  bodyRegion: null,
  injuryType: null,
  severity: null,
};

interface LogInjuryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  athletes: readonly InjuryAthleteOption[];
  onSubmit: (input: CreateInjuryInput) => void;
  isSubmitting?: boolean;
  /** Server-side rejection to surface inline. */
  errorMessage?: string;
}

/**
 * Manual injury entry, for everything the live logger does not see: training
 * injuries, knocks reported the next morning, and anything a coach is
 * catching up on.
 *
 * A match injury logged here carries no minute — that provenance only exists
 * when the live logger was actually running, and inventing it would make the
 * record claim more than it knows.
 */
export function LogInjuryDialog({
  isOpen,
  onClose,
  athletes,
  onSubmit,
  isSubmitting = false,
  errorMessage,
}: LogInjuryDialogProps) {
  const [athleteId, setAthleteId] = useState("");
  const [spec, setSpec] = useState<InjurySpec>(EMPTY_SPEC);
  const [context, setContext] = useState<InjuryContext>("training");
  const [occurredOn, setOccurredOn] = useState(todayIso());
  const [diagnosedBy, setDiagnosedBy] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setAthleteId("");
    setSpec(EMPTY_SPEC);
    setContext("training");
    setOccurredOn(todayIso());
    setDiagnosedBy("");
    setDescription("");
  }, [isOpen]);

  const protocol = useInjuryProtocol({
    bodyRegion: spec.bodyRegion,
    injuryType: spec.injuryType,
    severity: spec.severity,
    occurredOn,
  });

  if (!isOpen) {
    return null;
  }

  const complete =
    athleteId !== "" &&
    spec.bodyRegion !== null &&
    spec.injuryType !== null &&
    spec.severity !== null &&
    occurredOn !== "";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete || isSubmitting) {
      return;
    }

    onSubmit({
      athleteId,
      bodyRegion: spec.bodyRegion!,
      injuryType: spec.injuryType!,
      severity: spec.severity!,
      occurredOn,
      context,
      ...(diagnosedBy.trim() ? { diagnosedBy: diagnosedBy.trim() } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
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
        aria-labelledby="log-injury-title"
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="log-injury-title"
              className="text-lg font-bold text-foreground"
            >
              Log an injury
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Creates an injury record and marks the player unavailable.
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
              Player
            </span>
            <select
              value={athleteId}
              onChange={(event) => setAthleteId(event.target.value)}
              required
              className="mt-1.5 h-9 w-full rounded-lg border border-border/70 bg-card/70 px-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
            >
              <option value="" disabled>
                Select a player&hellip;
              </option>
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.squadNumber != null && `#${athlete.squadNumber} `}
                  {athlete.firstName} {athlete.lastName}
                </option>
              ))}
            </select>
          </label>

          <InjurySpecPicker
            value={spec}
            onChange={setSpec}
            preview={protocol.data}
            isPreviewLoading={protocol.isFetching}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Date of injury
              </span>
              <input
                type="date"
                value={occurredOn}
                max={todayIso()}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                className="mt-1.5 h-9 w-full rounded-lg border border-border/70 bg-card/70 px-2 text-sm text-foreground focus:border-primary/40 focus:outline-none"
              />
            </label>

            <fieldset>
              <legend className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Where
              </legend>
              <div className="mt-1.5 inline-flex rounded-lg border border-border/70 bg-card/70 p-0.5">
                {CONTEXTS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setContext(option.value)}
                    aria-pressed={context === option.value}
                    className={
                      context === option.value
                        ? "rounded-md bg-primary/90 px-2.5 py-1.5 text-xs font-medium text-primary-foreground"
                        : "rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Diagnosed by <span className="font-normal">(optional)</span>
            </span>
            <input
              type="text"
              value={diagnosedBy}
              onChange={(event) => setDiagnosedBy(event.target.value)}
              placeholder="Club physio"
              maxLength={120}
              className="mt-1.5 h-9 w-full rounded-lg border border-border/70 bg-card/70 px-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Description <span className="font-normal">(optional)</span>
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="How it happened, and anything the physio noted."
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
            <Button type="submit" disabled={!complete || isSubmitting}>
              {isSubmitting && (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              )}
              Log injury
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
