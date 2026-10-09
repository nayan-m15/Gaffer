import { buildTeamReportCsv, safeReportFilename, type TeamReportData } from "./team-report-model";

export async function shareTeamReport(data: TeamReportData): Promise<"shared" | "copied" | "cancelled"> {
  const { context, overview } = data;
  const summary = [
    "Gaffer Team Performance Report — " + context.teamName,
    context.seasonName + " · " + context.competitionName,
    overview.matchesPlayed + " played · " + overview.wins + "W " + overview.draws + "D " + overview.losses + "L · " + overview.goalsFor + "-" + overview.goalsAgainst + " goals",
  ].join("\n");
  const file = new File([buildTeamReportCsv(data)], "Gaffer_Team_Performance_" + safeReportFilename(context.teamName, context.generatedAt) + ".csv", { type: "text/csv;charset=utf-8" });
  try {
    // Called directly from the confirmation click to preserve user activation.
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ title: "Gaffer report — " + context.teamName, text: summary, files: [file] });
      return "shared";
    }
    await navigator.clipboard.writeText(summary);
    return "copied";
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return "cancelled";
    throw error;
  }
}
