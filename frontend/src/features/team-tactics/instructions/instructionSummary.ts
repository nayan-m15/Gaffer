/**
 * The one-line read on a player: "FREE-ROAMING · STAYS HIGH · ATTACKS THE BOX".
 *
 * Built from the short phrases the registry attaches to the options worth
 * mentioning. A neutral option carries none, so a player left entirely on his
 * defaults produces a short line or none at all — which is the honest answer:
 * there is nothing unusual to say about him.
 */

import type { ResolvedInstruction } from "./instructionTypes";

/** At most this many phrases, so the line stays scannable. */
const MAX_PHRASES = 3;

/** The notable things about how this player has been set up, in card order. */
export function instructionSummaryPhrases(
  resolved: ResolvedInstruction[],
): string[] {
  const phrases: string[] = [];

  // A coach's own choices say more than a default does, so they go first.
  for (const source of ["custom", "default"] as const) {
    for (const entry of resolved) {
      if (entry.source !== source) continue;
      const phrase = entry.selected.summary;
      if (phrase && !phrases.includes(phrase)) phrases.push(phrase);
      if (phrases.length === MAX_PHRASES) return phrases;
    }
  }

  return phrases;
}
