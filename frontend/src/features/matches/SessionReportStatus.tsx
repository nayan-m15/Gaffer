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
  return (
    <section
      className="rounded-xl border border-white/10 p-3 text-sm"
      aria-label="Shared session result"
    >
      <p>
        {status} · Home {report.score.home} – {report.score.away} Away
      </p>
      <p className="text-xs opacity-70">
        Home {report.confirmations.home ? "confirmed" : "unconfirmed"} · Away{" "}
        {report.confirmations.away ? "confirmed" : "unconfirmed"}
      </p>
      {report.reviews.map((review) => (
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
