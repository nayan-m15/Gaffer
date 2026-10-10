import type { SessionReport } from "./session-report-model";

export function SessionReportStatus({
  report,
}: {
  report: SessionReport | undefined;
}) {
  if (!report) return null;
  const status = {
    open: "Live",
    awaiting_confirmation: "Awaiting both teams",
    finalised: "Final result",
    amendment_required: "Amendment review required",
  }[report.finalStatus];
  const teamName = (side: "home" | "away") => report.participants.find(participant => participant.side === side)?.teamName ?? side;
  const openReviews = report.reviews.filter(review => review.status === "open" || review.disputedAt);
  return (
    <section
      className="rounded-xl border border-white/10 p-3 text-sm"
      aria-label="Shared session result"
    >
      <p>
        {status} · {teamName("home")} {report.score.home} – {report.score.away} {teamName("away")}
      </p>
      <p className="text-xs opacity-70">
        {teamName("home")} {report.confirmations.home ? "confirmed" : "awaiting confirmation"} · {teamName("away")}{" "}
        {report.confirmations.away ? "confirmed" : "awaiting confirmation"}
      </p>
      {openReviews.length > 0 ? <p className="mt-1 text-xs text-warning">Resolve {openReviews.length} event review{openReviews.length === 1 ? "" : "s"} before confirming the report.</p> : null}
      {openReviews.map((review) => (
        <p key={review.id} className="text-xs opacity-70">
          {review.reason.replaceAll("_", " ")} ·{" "}
          {review.disputedAt ? "disputed" : review.status}
          {review.resolution
            ? ` · ${review.resolution.replaceAll("_", " ")}`
            : ""}
        </p>
      ))}
    </section>
  );
}
