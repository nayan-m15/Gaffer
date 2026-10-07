/**
 * The six leadership and set-piece roles a game plan carries, and how each one
 * maps onto the fields the backend already stores.
 *
 * `freeKickTakerId` is the short free kick and `cornerTakerId` the left corner:
 * both predate the split into near/far takers and kept their column names, so a
 * plan saved before the split keeps the taker a coach chose.
 */

import type { GamePlanTactics } from "@/services/gamePlans";

export type TeamRole =
  | "captain"
  | "shortFreeKick"
  | "longFreeKick"
  | "penalties"
  | "leftCorner"
  | "rightCorner";

/** The game-plan fields that hold a role's athlete. */
export type TeamRoleField =
  | "captainId"
  | "freeKickTakerId"
  | "longFreeKickTakerId"
  | "penaltyTakerId"
  | "cornerTakerId"
  | "rightCornerTakerId";

export interface RoleDefinition {
  label: string;
  /** Short code badged on the pitch while this role is being edited. */
  badge: string;
  description: string;
  field: TeamRoleField;
}

export const ROLE_CONFIG: Record<TeamRole, RoleDefinition> = {
  captain: {
    label: "Captain",
    badge: "C",
    description:
      "The captain leads the team on the pitch and represents the squad during the match.",
    field: "captainId",
  },
  shortFreeKick: {
    label: "Short Free Kick",
    badge: "SFK",
    description:
      "The preferred player for closer free kicks, direct shots and short set-piece deliveries.",
    field: "freeKickTakerId",
  },
  longFreeKick: {
    label: "Long Free Kick",
    badge: "LFK",
    description:
      "The preferred player for longer free kicks and long-range deliveries into attacking areas.",
    field: "longFreeKickTakerId",
  },
  penalties: {
    label: "Penalties",
    badge: "PK",
    description: "The primary player responsible for penalty kicks.",
    field: "penaltyTakerId",
  },
  leftCorner: {
    label: "Left Corner",
    badge: "LC",
    description:
      "The player responsible for taking corners from the left side.",
    field: "cornerTakerId",
  },
  rightCorner: {
    label: "Right Corner",
    badge: "RC",
    description:
      "The player responsible for taking corners from the right side.",
    field: "rightCornerTakerId",
  },
};

/** Card order on the assignment grid, read left to right then down. */
export const ROLE_ORDER: TeamRole[] = [
  "captain",
  "shortFreeKick",
  "longFreeKick",
  "penalties",
  "leftCorner",
  "rightCorner",
];

/** Who currently holds a role, or null when it is unassigned. */
export function roleAssignee(
  tactics: GamePlanTactics,
  role: TeamRole,
): string | null {
  return tactics[ROLE_CONFIG[role].field];
}

/**
 * The game-plan patch that hands a role to an athlete (or clears it).
 *
 * Written out per role rather than with a computed key so the patch keeps its
 * exact `GamePlanTactics` field types.
 */
export function roleAssignmentPatch(
  role: TeamRole,
  athleteId: string | null,
): Partial<GamePlanTactics> {
  switch (role) {
    case "captain":
      return { captainId: athleteId };
    case "shortFreeKick":
      return { freeKickTakerId: athleteId };
    case "longFreeKick":
      return { longFreeKickTakerId: athleteId };
    case "penalties":
      return { penaltyTakerId: athleteId };
    case "leftCorner":
      return { cornerTakerId: athleteId };
    case "rightCorner":
      return { rightCornerTakerId: athleteId };
  }
}
