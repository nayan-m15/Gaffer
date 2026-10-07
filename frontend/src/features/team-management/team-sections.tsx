/**
 * The four sections of the Team Management page.
 *
 * Shared because the page and the toolbar present the same list two ways: as a
 * tab strip on a wide screen, and as a single dropdown on a phone, where four
 * tabs would scroll off the edge.
 */

import {
  ListChecks,
  SlidersHorizontal,
  Star,
  Users,
  type LucideIcon,
} from "lucide-react";

export type TeamSection = "squad" | "tactics" | "instructions" | "roles";

export interface TeamSectionItem {
  value: TeamSection;
  label: string;
  Icon: LucideIcon;
}

export const TEAM_SECTIONS: TeamSectionItem[] = [
  { value: "squad", label: "Squad", Icon: Users },
  { value: "tactics", label: "Tactics", Icon: SlidersHorizontal },
  { value: "instructions", label: "Instructions", Icon: ListChecks },
  { value: "roles", label: "Roles", Icon: Star },
];

/** Reads a section out of the `?section=` query parameter. */
export function toTeamSection(value: string | null): TeamSection {
  return TEAM_SECTIONS.some((section) => section.value === value)
    ? (value as TeamSection)
    : "squad";
}
