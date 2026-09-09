/**
 * Callout discriminators for live-match follow-up prompts.
 *
 * Injury opens `mandatory-sub-in`. The Substitution button opens `sub-in`
 * (pitch player selected) or `sub-out` (bench player selected). Those are
 * different kinds from injury — the banner must list them explicitly.
 */
export function isMandatorySubCallout(kind: string) {
  return kind === "mandatory-sub-in";
}

export function isVoluntarySubInCallout(kind: string) {
  return kind === "sub-in";
}

export function isBenchIncomingCallout(kind: string) {
  return kind === "mandatory-sub-in" || kind === "sub-in";
}

export function isSubOutCallout(kind: string) {
  return kind === "sub-out";
}

export function isAssistCallout(kind: string) {
  return kind === "assist-pick";
}

export function dimEventGridFor(kind: string) {
  return (
    isBenchIncomingCallout(kind) ||
    isSubOutCallout(kind) ||
    isAssistCallout(kind)
  );
}

/** Mirrors handleAction("substitution") when a player is already selected. */
export function composerKindAfterSubstitutionClick(selectedOnPitch: boolean) {
  return selectedOnPitch ? "sub-in" : "sub-out";
}
