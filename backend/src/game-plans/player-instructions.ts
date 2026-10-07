/**
 * Server-side validation for the player instructions saved on a game plan.
 *
 * Mirrors, and must be kept in sync with:
 * - `frontend/src/features/team-tactics/instructions/instructionDefinitions.ts`
 *   (category IDs, option IDs, and which kinds of player each applies to)
 * - `frontend/src/features/team-tactics/instructions/positionGroups.ts`
 *   (slot label -> position group)
 *
 * Only the IDs are mirrored. Labels, descriptions, icons and tactical effects
 * stay on the frontend, because nothing here renders them — this file exists to
 * reject instructions a client should never have sent: unknown categories,
 * options that do not belong to their category, and cards offered to a kind of
 * player who is not being asked that question.
 */

import { BadRequestException } from '@nestjs/common';
import { FORMATIONS, type FormationPosition } from './lineup-engine';

export type PositionGroup =
  | 'GK'
  | 'CB'
  | 'FB'
  | 'WB'
  | 'DM'
  | 'CM'
  | 'AM'
  | 'WIDE'
  | 'ST';

/** Options shared by every group the category applies to. */
type SharedOptions = string[];
/** Options offered only to some groups. */
type ScopedOptions = Partial<Record<PositionGroup, string[]>>;

interface CategoryDefinition {
  groups: PositionGroup[];
  shared: SharedOptions;
  scoped?: ScopedOptions;
  /** Only offered to the outside centre-backs of a back three. */
  wideCentreBackOnly?: boolean;
}

export const INSTRUCTION_CATEGORIES: Record<string, CategoryDefinition> = {
  starting_position: {
    groups: ['GK'],
    shared: ['standard', 'sweeper_keeper', 'conservative'],
  },
  distribution: {
    groups: ['GK'],
    shared: [
      'balanced',
      'short',
      'wide',
      'to_centre_backs',
      'to_full_backs',
      'long',
      'quick_release',
      'slow_tempo',
    ],
  },
  crosses: {
    groups: ['GK'],
    shared: ['balanced', 'claim_crosses', 'stay_on_line'],
  },
  defensive_aggression: {
    groups: ['CB'],
    shared: ['balanced', 'step_up', 'hold_position'],
  },
  marking: {
    groups: ['CB'],
    shared: ['zonal', 'tight_mark', 'track_forward', 'cover_space'],
  },
  possession_support: {
    groups: ['CB'],
    shared: [
      'simple_distribution',
      'carry_forward',
      'progressive_passing',
      'stay_back',
    ],
  },
  wide_cover: {
    groups: ['CB'],
    wideCentreBackOnly: true,
    shared: ['hold_central', 'cover_wide', 'follow_wide_runner'],
  },
  attacking_support: {
    groups: ['FB', 'WB', 'CM'],
    shared: ['balanced', 'stay_back'],
    scoped: {
      FB: ['join_attack', 'attack_aggressively'],
      WB: ['join_attack', 'attack_aggressively'],
      CM: ['get_forward', 'box_to_box'],
    },
  },
  run_type: {
    groups: ['FB', 'WB'],
    shared: ['overlap', 'underlap', 'mixed_runs'],
  },
  defensive_approach: {
    groups: ['FB', 'WB'],
    shared: ['balanced', 'tight_to_winger', 'protect_inside', 'show_outside'],
  },
  width: {
    groups: ['FB', 'WB', 'WIDE'],
    shared: ['hold_width', 'balanced_width'],
    scoped: {
      FB: ['invert_inside'],
      WB: ['invert_inside'],
      WIDE: ['come_inside'],
    },
  },
  crossing_position: {
    groups: ['FB', 'WB'],
    shared: ['cross_from_deep', 'reach_byline', 'mixed', 'cut_back'],
  },
  defensive_duty: {
    groups: ['DM'],
    shared: [
      'balanced',
      'hold_position',
      'drop_between_centre_backs',
      'press_aggressively',
    ],
  },
  defensive_coverage: {
    groups: ['DM'],
    shared: ['cover_centre', 'cover_wide', 'follow_playmaker'],
  },
  possession_positioning: {
    groups: ['DM'],
    shared: [
      'hold_position',
      'offer_short',
      'drop_between_defenders',
      'move_into_channels',
    ],
  },
  passing_risk: {
    groups: ['DM'],
    shared: ['safe', 'balanced', 'progressive'],
  },
  counter_attack: {
    groups: ['DM'],
    shared: ['hold', 'support', 'join_late'],
  },
  positioning: {
    groups: ['CM', 'ST'],
    shared: ['drift_wide'],
    scoped: {
      CM: ['hold_position', 'free_roam', 'move_into_channels'],
      ST: ['stay_central', 'roam_front_line'],
    },
  },
  defensive_responsibility: {
    groups: ['CM'],
    shared: [
      'balanced',
      'protect_centre',
      'press_ball_carrier',
      'track_runner',
    ],
  },
  box_support: {
    groups: ['CM'],
    shared: ['stay_outside_box', 'arrive_late', 'attack_box', 'balanced'],
  },
  passing_freedom: {
    groups: ['CM'],
    shared: ['keep_it_simple', 'balanced', 'creative_freedom'],
  },
  defensive_support: {
    groups: ['AM', 'WIDE', 'ST'],
    shared: ['balanced', 'stay_forward'],
    scoped: {
      AM: ['drop_back', 'press_from_front'],
      WIDE: ['come_back'],
      ST: ['press_centre_backs', 'drop_into_midfield'],
    },
  },
  attacking_movement: {
    groups: ['AM'],
    shared: [
      'balanced',
      'get_into_box',
      'support_striker',
      'arrive_late',
      'run_beyond',
    ],
  },
  positioning_freedom: {
    groups: ['AM'],
    shared: ['stick_to_position', 'free_roam', 'drift_wide', 'find_pockets'],
  },
  chance_creation: {
    groups: ['AM'],
    shared: [
      'balanced',
      'creative_playmaker',
      'direct_runner',
      'shoot_more',
      'link_play',
    ],
  },
  defensive_positioning: {
    groups: ['AM'],
    shared: [
      'cover_centre',
      'press_holding_midfielder',
      'screen_passing_lanes',
    ],
  },
  box_presence: {
    groups: ['AM', 'WIDE'],
    shared: ['attack_box'],
    scoped: {
      AM: ['stay_outside_box', 'balanced'],
      WIDE: ['stay_wide', 'edge_of_box', 'attack_far_post'],
    },
  },
  attacking_runs: {
    groups: ['WIDE', 'ST'],
    shared: ['balanced', 'come_short', 'run_in_behind'],
    scoped: {
      WIDE: ['attack_half_space'],
      ST: ['target_player', 'move_into_channels'],
    },
  },
  final_third_movement: {
    groups: ['WIDE'],
    shared: ['balanced', 'hold_width', 'cut_inside', 'attack_byline', 'roam'],
  },
  pressing: {
    groups: ['WIDE'],
    shared: [
      'normal_press',
      'press_full_back',
      'screen_inside_pass',
      'aggressive_press',
    ],
  },
  link_up_play: {
    groups: ['ST'],
    shared: [
      'balanced',
      'hold_up_ball',
      'play_one_touch',
      'drop_between_lines',
    ],
  },
  penalty_area_behaviour: {
    groups: ['ST'],
    shared: [
      'attack_near_post',
      'attack_centre',
      'attack_far_post',
      'mixed_movement',
    ],
  },
};

/** Slot labels used by the preset formations, and the group each maps to. */
const LABEL_GROUPS: Record<string, PositionGroup> = {
  GK: 'GK',
  CB: 'CB',
  LB: 'FB',
  RB: 'FB',
  LWB: 'WB',
  RWB: 'WB',
  DM: 'DM',
  CDM: 'DM',
  CM: 'CM',
  LCM: 'CM',
  RCM: 'CM',
  CAM: 'AM',
  AM: 'AM',
  LM: 'WIDE',
  RM: 'WIDE',
  LW: 'WIDE',
  RW: 'WIDE',
  LAM: 'WIDE',
  RAM: 'WIDE',
  ST: 'ST',
  CF: 'ST',
};

const WIDE_X = 24;

/** The kind of player occupying a formation slot. */
export function positionGroupForSlot(slot: FormationPosition): PositionGroup {
  const known = LABEL_GROUPS[slot.label.trim().toUpperCase()];
  if (known) return known;

  const isWide = slot.x < WIDE_X || slot.x > 100 - WIDE_X;

  switch (slot.role) {
    case 'GK':
      return 'GK';
    case 'DEF':
      return isWide ? 'FB' : 'CB';
    case 'MID':
      if (isWide) return 'WIDE';
      if (slot.y >= 55) return 'DM';
      return slot.y <= 34 ? 'AM' : 'CM';
    default:
      return isWide ? 'WIDE' : 'ST';
  }
}

/** The options one kind of player may choose from for a category. */
export function optionsForGroup(
  category: CategoryDefinition,
  group: PositionGroup,
): string[] {
  return [...category.shared, ...(category.scoped?.[group] ?? [])];
}

function isWideCentreBack(
  slot: FormationPosition,
  positions: FormationPosition[],
): boolean {
  const centreBacks = positions.filter(
    (position) => positionGroupForSlot(position) === 'CB',
  );
  if (centreBacks.length < 3) return false;
  const xs = centreBacks.map((position) => position.x);
  return slot.x === Math.min(...xs) || slot.x === Math.max(...xs);
}

export interface PlayerInstructionsValidationInput {
  instructions: Record<string, Record<string, string>>;
  formationId: string;
  assignments: Record<string, string | null>;
  /** Coach-defined slots, when the plan uses a custom formation. */
  customPositions: FormationPosition[] | null;
  /** Every athlete that may be referenced — the team's own roster. */
  teamAthleteIds: Set<string>;
}

/**
 * Rejects player instructions a coach's client should never have produced.
 *
 * An athlete who is in the starting lineup is held to the cards their slot
 * actually offers. An athlete who is not — on the bench, or left out of this
 * plan entirely — is only checked for well-formed IDs, because there is no slot
 * to measure them against and their instructions are being kept for the next
 * time they start.
 */
export function assertValidPlayerInstructions({
  instructions,
  formationId,
  assignments,
  customPositions,
  teamAthleteIds,
}: PlayerInstructionsValidationInput): void {
  const positions =
    customPositions ?? FORMATIONS[formationId]?.positions ?? null;

  const contextByAthlete = new Map<
    string,
    { group: PositionGroup; wideCentreBack: boolean }
  >();
  if (positions) {
    for (const slot of positions) {
      const athleteId = assignments[slot.id];
      if (!athleteId) continue;
      contextByAthlete.set(athleteId, {
        group: positionGroupForSlot(slot),
        wideCentreBack: isWideCentreBack(slot, positions),
      });
    }
  }

  for (const [athleteId, playerInstructions] of Object.entries(instructions)) {
    if (!teamAthleteIds.has(athleteId)) {
      throw new BadRequestException(
        'Player instructions must reference athletes on this team.',
      );
    }

    const context = contextByAthlete.get(athleteId);

    for (const [categoryId, optionId] of Object.entries(playerInstructions)) {
      const category = INSTRUCTION_CATEGORIES[categoryId];
      if (!category) {
        throw new BadRequestException(
          `Unknown player instruction "${categoryId}".`,
        );
      }

      if (!context) {
        // Not in the starting lineup: the option still has to exist somewhere.
        const anyGroup = category.groups.some((group) =>
          optionsForGroup(category, group).includes(optionId),
        );
        if (!anyGroup) {
          throw new BadRequestException(
            `"${optionId}" is not an option for "${categoryId}".`,
          );
        }
        continue;
      }

      if (!category.groups.includes(context.group)) {
        throw new BadRequestException(
          `"${categoryId}" does not apply to this player's position.`,
        );
      }
      if (category.wideCentreBackOnly && !context.wideCentreBack) {
        throw new BadRequestException(
          `"${categoryId}" only applies to the outside defenders of a back three.`,
        );
      }
      if (!optionsForGroup(category, context.group).includes(optionId)) {
        throw new BadRequestException(
          `"${optionId}" is not an option for "${categoryId}" in this position.`,
        );
      }
    }
  }
}
