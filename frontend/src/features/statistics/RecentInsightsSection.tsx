import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { formatMatchDateTime } from "./formatting";
import type { MatchInsightSummary } from "./types";

/**
 * A short feed of recent AI-generated match narratives, linking through to
 * each match's full report. Renders nothing when no insight has been
 * generated yet, matching the rest of the statistics page's "no data" sections.
 */
export function RecentInsightsSection({
  insights,
}: {
  insights: MatchInsightSummary[];
}) {
  const ready = insights.filter((insight) => insight.narrativeText);
  if (ready.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-4 text-muted-foreground" />
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Recent Match Insights
        </h2>
      </div>
      <ul className="space-y-3">
        {ready.map((insight) => (
          <li
            key={insight.matchId}
            className="border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <p className="line-clamp-2 text-sm text-foreground">
              {insight.narrativeText}
            </p>
            <div className="mt-1 flex items-center gap-x-2 text-xs text-muted-foreground">
              {insight.generatedAt && (
                <span>{formatMatchDateTime(insight.generatedAt)}</span>
              )}
              <Link
                to={`/matches/${insight.matchId}/report`}
                className="font-medium text-primary hover:underline"
              >
                View full report
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
