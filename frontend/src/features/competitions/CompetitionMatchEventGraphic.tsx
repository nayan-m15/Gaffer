import { getCompetitionMatchEventAppearance } from "./competitionMatchEventAppearance";

export function CompetitionMatchEventGraphic({ type }: { type: string }) {
  const appearance = getCompetitionMatchEventAppearance(type);
  const Icon = appearance.icon;
  return (
    <span aria-label={appearance.label} title={appearance.label} className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${appearance.background} ${appearance.border} ${appearance.text}`}>
      {appearance.card ? (
        <span aria-hidden="true" className={`h-6 w-4 rounded-[2px] border border-black/10 shadow-sm ${appearance.card === "yellow" ? "bg-yellow-400" : "bg-red-500"}`} />
      ) : <Icon className="size-5" strokeWidth={2} />}
    </span>
  );
}
