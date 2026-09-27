import { Loader2, Sparkles } from "lucide-react";
import { useGenerateSeasonInsight, useSeasonInsight } from "./hooks";

/**
 * AI-generated season-summary narrative. Unlike per-match insights, this is
 * coach-triggered (no automatic "season ended" event exists) via a button
 * here, so the request runs synchronously with its own loading state rather
 * than polling for a background result.
 */
export function SeasonInsightSection({
  seasonId,
  seasonLabel,
  canGenerate,
}: {
  seasonId?: string;
  seasonLabel: string;
  canGenerate: boolean;
}) {
  const insightQuery = useSeasonInsight(seasonId);
  const generate = useGenerateSeasonInsight();
  const insight = insightQuery.data;

  // Nothing generated and nothing the viewer can do about it — stay out of
  // the way rather than showing an empty card.
  if (!canGenerate && (!insight || !insight.narrativeText)) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-muted-foreground" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Season Summary
          </h2>
        </div>
        {canGenerate && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            onClick={() => generate.mutate(seasonId)}
            disabled={generate.isPending}
          >
            {generate.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {insight?.narrativeText ? "Regenerate" : "Generate summary"}
          </button>
        )}
      </div>

      {insight?.narrativeText ? (
        <p className="text-sm leading-relaxed text-foreground">
          {insight.narrativeText}
        </p>
      ) : generate.isPending ? (
        <p className="text-sm text-muted-foreground">
          Generating a summary for {seasonLabel}…
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No summary generated yet for {seasonLabel}.
        </p>
      )}

      {(generate.isError || insight?.status === "failed") &&
        !generate.isPending && (
          <p className="mt-2 text-xs text-destructive">
            Could not generate a summary. Try again.
          </p>
        )}
    </div>
  );
}
