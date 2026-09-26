import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { formatMatchDateTime } from "./formatting";
import type { MatchInsightSummary } from "./types";

/**
 * The most recent AI-generated match narrative, linking through to its full
 * report. Renders nothing when no insight has been generated yet, matching
 * the rest of the statistics page's "no data" sections.
 */
export function RecentInsightsSection({
  insights,
}: {
  insights: MatchInsightSummary[];
}) {
  const latest = insights.find((insight) => insight.narrativeText);
  if (!latest) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Latest Match Insight
        </h2>
      </div>
      <p className="line-clamp-2 text-sm text-foreground">
        {latest.narrativeText}
      </p>
      <div className="mt-1 flex items-center gap-x-2 text-xs text-muted-foreground">
        {latest.generatedAt && (
          <span>{formatMatchDateTime(latest.generatedAt)}</span>
        )}
        <Link
          to={`/matches/${latest.matchId}/report`}
          className="font-medium text-primary hover:underline"
        >
          View full report
        </Link>
      </div>
    </div>
  );
}
