/**
 * The vocabulary of the Player Instructions screen.
 *
 * An instruction is a (category, option) pair chosen for one athlete, e.g.
 * "positioning_freedom" → "free_roam". Only the two IDs are ever stored; every
 * label, description and icon lives in the registry so wording can change
 * without touching a saved game plan.
 *
 * Which categories a player is offered depends on the slot they occupy in the
 * formation, reduced to a `PositionGroup` — the coaching shorthand for "the
 * kind of player this is". Groups, not raw labels, keep the registry small:
 * LB and RB ask the same questions of a coach.
 */

/** The kinds of player the registry distinguishes. */
export type PositionGroup =
  | "GK"
  | "CB"
  | "FB"
  | "WB"
  | "DM"
  | "CM"
  | "AM"
  | "WIDE"
  | "ST";

/** Display names for the groups, used in the selected-player header. */
export const POSITION_GROUP_LABEL: Record<PositionGroup, string> = {
  GK: "Goalkeeper",
  CB: "Centre-Back",
  FB: "Full-Back",
  WB: "Wing-Back",
  DM: "Defensive Midfielder",
  CM: "Central Midfielder",
  AM: "Attacking Midfielder",
  WIDE: "Winger",
  ST: "Striker",
};

/**
 * Semantic meaning of an option, stored alongside it so later features — AI
 * suggestions, match simulation, suitability scoring — can reason about an
 * instruction without parsing its prose.
 */
export type TacticalEffect =
  | "increase_forward_runs"
  | "decrease_forward_runs"
  | "increase_width"
  | "decrease_width"
  | "increase_pressing"
  | "reduce_pressing"
  | "increase_roaming"
  | "hold_position"
  | "attack_box"
  | "protect_centre";

export interface InstructionOption {
  /** Stable ID — this is what gets saved. */
  id: string;
  label: string;
  /** One coach-readable sentence explaining the behaviour. */
  description: string;
  /**
   * Groups this option is offered to. Omitted means every group the category
   * applies to — present when the same question has different answers for,
   * say, a full-back and a winger.
   */
  groups?: PositionGroup[];
  tacticalEffects?: TacticalEffect[];
  /**
   * Short phrase for the player's tactical summary line. Only notable options
   * carry one; a default behaviour has nothing worth summarising.
   */
  summary?: string;
}

export interface InstructionCategory {
  id: string;
  label: string;
  /** Sub-heading shown when the card is open. */
  description: string;
  /** Key into `INSTRUCTION_ICONS`; kept as a string so this file stays UI-free. */
  icon: string;
  /** Which kinds of player are asked this question. */
  groups: PositionGroup[];
  /**
   * Narrows the category further than its group can. `wide_centre_back` only
   * offers the card to the outside centre-backs of a back three.
   */
  only?: "wide_centre_back";
  options: InstructionOption[];
  /** Used for any group without an entry in `groupDefaults`. */
  defaultOptionId: string;
  groupDefaults?: Partial<Record<PositionGroup, string>>;
}

/** One athlete's chosen instructions: category ID → option ID. */
export type PlayerInstructions = Record<string, string>;

/** Every athlete's instructions within a game plan, keyed by athlete ID. */
export type PlayerInstructionsByAthlete = Record<string, PlayerInstructions>;

/** Where a card's current value came from, for the Default/Custom caption. */
export type InstructionSource = "default" | "custom";

/** A category as it applies to one selected player, ready to render. */
export interface ResolvedInstruction {
  category: InstructionCategory;
  /** The options offered to this player, in registry order. */
  options: InstructionOption[];
  /** The option currently in force — chosen or default. */
  selected: InstructionOption;
  source: InstructionSource;
}
