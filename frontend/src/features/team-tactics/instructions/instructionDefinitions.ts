/**
 * The player-instruction registry: every question a coach can be asked about a
 * player, and every answer available.
 *
 * This is the single source of truth. Cards are generated from it, defaults are
 * read from it, and the backend validates saved instructions against a mirror
 * of its IDs (`backend/src/game-plans/player-instructions.ts`) — so adding an
 * option means adding it in both places.
 *
 * A category is offered to whole kinds of player (`groups`). Where the same
 * question has different answers for different kinds — a full-back and a winger
 * are both asked about width, but mean different things by going inside — the
 * option carries its own `groups` and the registry keeps one entry.
 *
 * Wording is deliberately a coach's, not a game's: no ratings, no stat deltas,
 * no "work rate". Every option says what the player is being asked to do.
 */

import type { InstructionCategory, PositionGroup } from "./instructionTypes";

/* ─── Goalkeeper ────────────────────────────────────────────────────────── */

const startingPosition: InstructionCategory = {
  id: "starting_position",
  label: "Starting Position",
  description: "How high the goalkeeper sets up behind the defensive line.",
  icon: "position",
  groups: ["GK"],
  defaultOptionId: "standard",
  options: [
    {
      id: "standard",
      label: "Standard Position",
      description:
        "Hold a normal starting position a few yards off the line and adjust with the ball.",
    },
    {
      id: "sweeper_keeper",
      label: "Sweeper Keeper",
      description:
        "Start higher and attack balls played in behind the defensive line.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Sweeps behind the line",
    },
    {
      id: "conservative",
      label: "Conservative",
      description:
        "Stay closer to goal and avoid leaving the box unless there is no alternative.",
      tacticalEffects: ["hold_position"],
      summary: "Stays on his line",
    },
  ],
};

const distribution: InstructionCategory = {
  id: "distribution",
  label: "Distribution",
  description:
    "How the goalkeeper restarts play with the ball in hand or at his feet.",
  icon: "distribution",
  groups: ["GK"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced Distribution",
      description:
        "Pick the best available option, short or long, depending on how the opponent presses.",
    },
    {
      id: "short",
      label: "Distribute Short",
      description:
        "Build from the back and look for a nearby team-mate rather than clearing the ball.",
      summary: "Builds short",
    },
    {
      id: "wide",
      label: "Distribute Wide",
      description: "Favour the wide areas, away from the congested centre.",
      tacticalEffects: ["increase_width"],
    },
    {
      id: "to_centre_backs",
      label: "Distribute to Centre-Backs",
      description:
        "Use the centre-backs as the first option so the team can build through the middle.",
    },
    {
      id: "to_full_backs",
      label: "Distribute to Full-Backs",
      description:
        "Use the full-backs as the first option so the team can build up the line.",
      tacticalEffects: ["increase_width"],
    },
    {
      id: "long",
      label: "Go Long",
      description:
        "Clear the first phase and play into the opposition half for the forwards to contest.",
      summary: "Goes long",
    },
    {
      id: "quick_release",
      label: "Quick Release",
      description:
        "Restart as fast as possible to catch the opponent before they recover their shape.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Restarts quickly",
    },
    {
      id: "slow_tempo",
      label: "Slow the Tempo",
      description:
        "Take time over every restart to settle the game and let the team get back into shape.",
      summary: "Slows the game",
    },
  ],
};

const crosses: InstructionCategory = {
  id: "crosses",
  label: "Crosses",
  description: "How the goalkeeper deals with balls delivered into his box.",
  icon: "cross",
  groups: ["GK"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Come for the deliveries that are reachable and hold position for the rest.",
    },
    {
      id: "claim_crosses",
      label: "Claim Crosses",
      description:
        "Attack crosses into the box and take the ball away from the attackers whenever possible.",
      summary: "Claims his box",
    },
    {
      id: "stay_on_line",
      label: "Stay on Line",
      description:
        "Hold the goal line and let the defenders deal with deliveries into the box.",
      tacticalEffects: ["hold_position"],
    },
  ],
};

/* ─── Centre-back ───────────────────────────────────────────────────────── */

const defensiveAggression: InstructionCategory = {
  id: "defensive_aggression",
  label: "Defensive Aggression",
  description: "How readily the defender leaves the line to meet the ball.",
  icon: "shield",
  groups: ["CB"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Defend the line normally and step out when the situation clearly invites it.",
    },
    {
      id: "step_up",
      label: "Step Up",
      description:
        "Aggressively close attackers receiving between the lines, even at the cost of the line's shape.",
      tacticalEffects: ["increase_pressing"],
      summary: "Steps out",
    },
    {
      id: "hold_position",
      label: "Hold Position",
      description:
        "Protect the defensive shape and stay in the line rather than following the ball.",
      tacticalEffects: ["hold_position", "protect_centre"],
      summary: "Holds the line",
    },
  ],
};

const marking: InstructionCategory = {
  id: "marking",
  label: "Marking",
  description: "What the defender takes responsibility for without the ball.",
  icon: "target",
  groups: ["CB"],
  defaultOptionId: "zonal",
  options: [
    {
      id: "zonal",
      label: "Zonal",
      description:
        "Defend the space in front of and around him rather than a specific opponent.",
    },
    {
      id: "tight_mark",
      label: "Tight Mark",
      description:
        "Stay touch-tight to the nearest forward and deny him the ball before it arrives.",
      tacticalEffects: ["increase_pressing"],
      summary: "Marks tight",
    },
    {
      id: "track_forward",
      label: "Track Forward",
      description:
        "Follow his forward wherever he goes, including out of the defensive line.",
      summary: "Tracks his man",
    },
    {
      id: "cover_space",
      label: "Cover Space",
      description:
        "Drop off and protect the space behind the line instead of engaging early.",
      tacticalEffects: ["protect_centre"],
    },
  ],
};

const possessionSupport: InstructionCategory = {
  id: "possession_support",
  label: "Possession Support",
  description: "What the defender does with the ball when the team is building.",
  icon: "pass",
  groups: ["CB"],
  defaultOptionId: "simple_distribution",
  options: [
    {
      id: "simple_distribution",
      label: "Simple Distribution",
      description:
        "Move the ball on quickly and safely to the nearest available team-mate.",
    },
    {
      id: "carry_forward",
      label: "Carry Forward",
      description:
        "Step into midfield with the ball when the space ahead is open, to commit an opponent.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Carries into midfield",
    },
    {
      id: "progressive_passing",
      label: "Progressive Passing",
      description:
        "Look to break a line with the pass rather than circulate the ball sideways.",
      summary: "Passes forward",
    },
    {
      id: "stay_back",
      label: "Stay Back",
      description:
        "Stay behind the ball at all times and leave the build-up to the players ahead.",
      tacticalEffects: ["hold_position", "decrease_forward_runs"],
    },
  ],
};

const wideCover: InstructionCategory = {
  id: "wide_cover",
  label: "Wide Cover",
  description:
    "How the outside defender of a back three handles the channel beside him.",
  icon: "width",
  groups: ["CB"],
  only: "wide_centre_back",
  defaultOptionId: "hold_central",
  options: [
    {
      id: "hold_central",
      label: "Hold Central",
      description:
        "Stay in the central unit and let the wing-back deal with the wide area.",
      tacticalEffects: ["protect_centre"],
    },
    {
      id: "cover_wide",
      label: "Cover Wide",
      description:
        "Shift across to protect the channel whenever the wing-back is caught up the pitch.",
      tacticalEffects: ["increase_width"],
      summary: "Covers the channel",
    },
    {
      id: "follow_wide_runner",
      label: "Follow Wide Runner",
      description:
        "Go with the opposition's wide attacker even when that means leaving the back line.",
      summary: "Follows the wide runner",
    },
  ],
};

/* ─── Full-back, wing-back and central midfield ─────────────────────────── */

const attackingSupport: InstructionCategory = {
  id: "attacking_support",
  label: "Attacking Support",
  description: "How far forward the player joins the attack.",
  icon: "forward",
  groups: ["FB", "WB", "CM"],
  defaultOptionId: "balanced",
  groupDefaults: { WB: "join_attack" },
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Join the attack when it is safe to, and recover when the team is exposed.",
    },
    {
      id: "stay_back",
      label: "Stay Back",
      description:
        "Stay behind the ball while the team attacks and hold the defensive shape.",
      tacticalEffects: ["decrease_forward_runs", "hold_position"],
      summary: "Stays behind the ball",
    },
    {
      id: "join_attack",
      label: "Join the Attack",
      description:
        "Push up alongside the attack whenever the team settles into the opposition half.",
      groups: ["FB", "WB"],
      tacticalEffects: ["increase_forward_runs"],
      summary: "Joins the attack",
    },
    {
      id: "attack_aggressively",
      label: "Attack Aggressively",
      description:
        "Commit high up the pitch and accept the risk of being caught on the counter.",
      groups: ["FB", "WB"],
      tacticalEffects: ["increase_forward_runs"],
      summary: "Attacks high",
    },
    {
      id: "get_forward",
      label: "Get Forward",
      description:
        "Break beyond the ball to support the forwards once the team is in the final third.",
      groups: ["CM"],
      tacticalEffects: ["increase_forward_runs"],
      summary: "Gets forward",
    },
    {
      id: "box_to_box",
      label: "Box-to-Box",
      description:
        "Cover the length of the pitch, arriving in both boxes across the course of the game.",
      groups: ["CM"],
      tacticalEffects: ["increase_forward_runs"],
      summary: "Box to box",
    },
  ],
};

const runType: InstructionCategory = {
  id: "run_type",
  label: "Run Type",
  description: "Which side of the player ahead of him he runs.",
  icon: "roam",
  groups: ["FB", "WB"],
  defaultOptionId: "mixed_runs",
  options: [
    {
      id: "overlap",
      label: "Overlap",
      description:
        "Run outside the winger to stretch the defence and reach the touchline.",
      tacticalEffects: ["increase_width", "increase_forward_runs"],
      summary: "Overlaps",
    },
    {
      id: "underlap",
      label: "Underlap",
      description:
        "Run inside the winger into the half-space, between the full-back and the centre-back.",
      tacticalEffects: ["decrease_width", "increase_forward_runs"],
      summary: "Underlaps",
    },
    {
      id: "mixed_runs",
      label: "Mixed Runs",
      description:
        "Read the winger's position and take whichever run the defence leaves open.",
    },
  ],
};

const defensiveApproach: InstructionCategory = {
  id: "defensive_approach",
  label: "Defensive Approach",
  description: "How the player defends his flank.",
  icon: "shield",
  groups: ["FB", "WB"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Hold a sensible distance and engage when the winger commits.",
    },
    {
      id: "tight_to_winger",
      label: "Tight to Winger",
      description:
        "Get touch-tight to the opposing winger and deny him time to turn.",
      tacticalEffects: ["increase_pressing"],
      summary: "Tight to his winger",
    },
    {
      id: "protect_inside",
      label: "Protect Inside",
      description:
        "Prioritise blocking inside movement and encourage the opponent toward the touchline.",
      tacticalEffects: ["protect_centre"],
      summary: "Shuts the inside",
    },
    {
      id: "show_outside",
      label: "Show Outside",
      description:
        "Angle the body to send the opponent down the line and away from the box.",
      tacticalEffects: ["protect_centre"],
    },
  ],
};

const width: InstructionCategory = {
  id: "width",
  label: "Width",
  description:
    "Where the player sits across the pitch when the team has the ball.",
  icon: "width",
  groups: ["FB", "WB", "WIDE"],
  defaultOptionId: "balanced_width",
  options: [
    {
      id: "hold_width",
      label: "Hold Width",
      description:
        "Stay on the touchline to stretch the opposition defence as wide as possible.",
      tacticalEffects: ["increase_width"],
      summary: "Holds the width",
    },
    {
      id: "balanced_width",
      label: "Balanced Width",
      description:
        "Judge each attack and take whichever line keeps the team's shape intact.",
    },
    {
      id: "invert_inside",
      label: "Narrow / Inverted",
      description:
        "Step inside into midfield when the team has the ball, adding a body in the centre.",
      groups: ["FB", "WB"],
      tacticalEffects: ["decrease_width", "protect_centre"],
      summary: "Inverts inside",
    },
    {
      id: "come_inside",
      label: "Come Inside",
      description:
        "Drift off the touchline into the half-space to receive between the lines.",
      groups: ["WIDE"],
      tacticalEffects: ["decrease_width"],
      summary: "Comes inside",
    },
  ],
};

const crossingPosition: InstructionCategory = {
  id: "crossing_position",
  label: "Crossing Position",
  description: "Where the player looks to deliver the ball from.",
  icon: "cross",
  groups: ["FB", "WB"],
  defaultOptionId: "mixed",
  options: [
    {
      id: "cross_from_deep",
      label: "Cross From Deep",
      description:
        "Deliver early from behind the defensive line rather than carrying the ball forward.",
      summary: "Crosses early",
    },
    {
      id: "reach_byline",
      label: "Reach Byline",
      description:
        "Take the ball to the byline before crossing, to pull the defence toward its own goal.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Gets to the byline",
    },
    {
      id: "mixed",
      label: "Mixed",
      description:
        "Choose the delivery the situation offers rather than forcing one.",
    },
    {
      id: "cut_back",
      label: "Cut Back",
      description:
        "Work the byline and pull the ball back to the edge of the box instead of crossing high.",
      summary: "Cuts it back",
    },
  ],
};

/* ─── Defensive midfield ────────────────────────────────────────────────── */

const defensiveDuty: InstructionCategory = {
  id: "defensive_duty",
  label: "Defensive Duty",
  description: "The player's first responsibility without the ball.",
  icon: "shield",
  groups: ["DM"],
  defaultOptionId: "hold_position",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Screen the defence, but step out when the ball invites pressure.",
    },
    {
      id: "hold_position",
      label: "Hold Position",
      description:
        "Stay in front of the back line and screen the space rather than chase the ball.",
      tacticalEffects: ["hold_position", "protect_centre"],
      summary: "Screens the defence",
    },
    {
      id: "drop_between_centre_backs",
      label: "Drop Between Centre-Backs",
      description:
        "Drop into the back line to make a third defender when the opponent presses.",
      tacticalEffects: ["decrease_forward_runs"],
      summary: "Drops into the back line",
    },
    {
      id: "press_aggressively",
      label: "Press Aggressively",
      description:
        "Leave the screening position to hunt the ball carrier in midfield.",
      tacticalEffects: ["increase_pressing"],
      summary: "Presses in midfield",
    },
  ],
};

const defensiveCoverage: InstructionCategory = {
  id: "defensive_coverage",
  label: "Defensive Coverage",
  description: "Which area the player is responsible for protecting.",
  icon: "target",
  groups: ["DM"],
  defaultOptionId: "cover_centre",
  options: [
    {
      id: "cover_centre",
      label: "Cover Centre",
      description:
        "Protect the space in front of the centre-backs above anything else.",
      tacticalEffects: ["protect_centre"],
    },
    {
      id: "cover_wide",
      label: "Cover Wide",
      description:
        "Shuttle across to the flank to help whenever the full-back is outnumbered.",
      tacticalEffects: ["increase_width"],
      summary: "Covers the flanks",
    },
    {
      id: "follow_playmaker",
      label: "Follow Opposing Playmaker",
      description:
        "Take the opponent's creator as a personal responsibility wherever he drops.",
      summary: "Man-marks the creator",
    },
  ],
};

const possessionPositioning: InstructionCategory = {
  id: "possession_positioning",
  label: "Possession Positioning",
  description: "Where the player shows for the ball when the team is building.",
  icon: "position",
  groups: ["DM"],
  defaultOptionId: "hold_position",
  options: [
    {
      id: "hold_position",
      label: "Hold Position",
      description:
        "Stay in front of the defence as the team's pivot and let play come to him.",
      tacticalEffects: ["hold_position"],
    },
    {
      id: "offer_short",
      label: "Offer Short",
      description:
        "Constantly show for a short pass to give the defenders an easy forward option.",
      summary: "Always available",
    },
    {
      id: "drop_between_defenders",
      label: "Drop Between Defenders",
      description:
        "Drop into the back line to beat the first line of the press and start the build-up.",
      summary: "Drops in to build",
    },
    {
      id: "move_into_channels",
      label: "Move Into Channels",
      description:
        "Move out toward the half-spaces to receive away from the opponent's midfield.",
      tacticalEffects: ["increase_roaming"],
    },
  ],
};

const passingRisk: InstructionCategory = {
  id: "passing_risk",
  label: "Passing Risk",
  description: "How ambitious the player's passing should be.",
  icon: "pass",
  groups: ["DM"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "safe",
      label: "Safe",
      description:
        "Keep possession, play the simple ball and never risk a turnover in midfield.",
      summary: "Keeps it simple",
    },
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Take the forward pass when it is on, and keep the ball when it is not.",
    },
    {
      id: "progressive",
      label: "Progressive",
      description:
        "Look to break lines and switch the play, accepting that some passes will not come off.",
      summary: "Plays forward",
    },
  ],
};

const counterAttack: InstructionCategory = {
  id: "counter_attack",
  label: "Counter-Attack Behaviour",
  description: "What the player does the moment the team wins the ball back.",
  icon: "forward",
  groups: ["DM"],
  defaultOptionId: "hold",
  options: [
    {
      id: "hold",
      label: "Hold",
      description:
        "Stay behind the break to protect against the ball being lost again.",
      tacticalEffects: ["hold_position"],
    },
    {
      id: "support",
      label: "Support",
      description:
        "Follow the counter at a safe distance to offer the pass backwards if it stalls.",
      summary: "Supports the break",
    },
    {
      id: "join_late",
      label: "Join Late",
      description:
        "Arrive at the end of the move, once the ball is settled in the final third.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Arrives late",
    },
  ],
};

/* ─── Central midfield ──────────────────────────────────────────────────── */

const positioning: InstructionCategory = {
  id: "positioning",
  label: "Positioning",
  description: "How much the player moves away from his nominal position.",
  icon: "position",
  groups: ["CM", "ST"],
  defaultOptionId: "hold_position",
  groupDefaults: { ST: "stay_central" },
  options: [
    {
      id: "hold_position",
      label: "Hold Position",
      description: "Keep the shape and stay in the area the formation gives him.",
      groups: ["CM"],
      tacticalEffects: ["hold_position"],
    },
    {
      id: "free_roam",
      label: "Free Roam",
      description:
        "Allow the player to move away from his nominal position to find useful spaces between the lines.",
      groups: ["CM"],
      tacticalEffects: ["increase_roaming"],
      summary: "Free-roaming",
    },
    {
      id: "move_into_channels",
      label: "Move Into Channels",
      description:
        "Work the half-spaces between the opponent's full-back and centre-back.",
      groups: ["CM"],
      tacticalEffects: ["increase_roaming"],
      summary: "Works the channels",
    },
    {
      id: "drift_wide",
      label: "Drift Wide",
      description: "Move toward the touchline to create an overload on the flank.",
      tacticalEffects: ["increase_width", "increase_roaming"],
      summary: "Drifts wide",
    },
    {
      id: "stay_central",
      label: "Stay Central",
      description:
        "Hold a central position between the centre-backs and occupy the middle of the box.",
      groups: ["ST"],
      tacticalEffects: ["hold_position", "protect_centre"],
    },
    {
      id: "roam_front_line",
      label: "Roam Across Front Line",
      description:
        "Move across the whole width of the front line to find a defender to attack.",
      groups: ["ST"],
      tacticalEffects: ["increase_roaming"],
      summary: "Roams the front line",
    },
  ],
};

const defensiveResponsibility: InstructionCategory = {
  id: "defensive_responsibility",
  label: "Defensive Responsibility",
  description: "What the player is asked to do when the team loses the ball.",
  icon: "shield",
  groups: ["CM"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description: "Defend within the team's shape and pick up the nearest threat.",
    },
    {
      id: "protect_centre",
      label: "Protect Centre",
      description:
        "Stay in the middle of the pitch and deny the opponent a route through it.",
      tacticalEffects: ["protect_centre"],
      summary: "Protects the centre",
    },
    {
      id: "press_ball_carrier",
      label: "Press Ball Carrier",
      description:
        "Go to the ball and apply pressure as soon as an opponent receives it.",
      tacticalEffects: ["increase_pressing"],
      summary: "Presses the ball",
    },
    {
      id: "track_runner",
      label: "Track Runner",
      description:
        "Follow the opposing midfielder's runs beyond the ball all the way back.",
      summary: "Tracks runners",
    },
  ],
};

const boxSupport: InstructionCategory = {
  id: "box_support",
  label: "Box Support",
  description: "Whether the player gets into the opposition box.",
  icon: "box",
  groups: ["CM"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "stay_outside_box",
      label: "Stay Outside Box",
      description:
        "Hold the edge of the area to collect second balls and stop the counter.",
      tacticalEffects: ["decrease_forward_runs"],
    },
    {
      id: "arrive_late",
      label: "Arrive Late",
      description:
        "Delay the run so he reaches the box behind the defence's eyeline.",
      tacticalEffects: ["attack_box"],
      summary: "Arrives late",
    },
    {
      id: "attack_box",
      label: "Attack Box",
      description:
        "Get into the penalty area early whenever the ball reaches the flank.",
      tacticalEffects: ["attack_box", "increase_forward_runs"],
      summary: "Attacks the box",
    },
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Judge each attack and go when the team is not exposed behind him.",
    },
  ],
};

const passingFreedom: InstructionCategory = {
  id: "passing_freedom",
  label: "Passing Freedom",
  description: "How much licence the player has on the ball.",
  icon: "pass",
  groups: ["CM"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "keep_it_simple",
      label: "Keep It Simple",
      description:
        "Move the ball on early and avoid trying to force the game forward.",
      summary: "Keeps it simple",
    },
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Mix safe circulation with the forward pass when it is clearly on.",
    },
    {
      id: "creative_freedom",
      label: "Creative Freedom",
      description:
        "Back his judgement to try the difficult pass that opens the opponent up.",
      summary: "Given licence",
    },
  ],
};

/* ─── Attacking midfield, wide players and strikers ─────────────────────── */

const defensiveSupport: InstructionCategory = {
  id: "defensive_support",
  label: "Defensive Support",
  description: "What the player does in the defensive phase.",
  icon: "shield",
  groups: ["AM", "WIDE", "ST"],
  defaultOptionId: "balanced",
  groupDefaults: { ST: "stay_forward" },
  options: [
    {
      id: "balanced",
      label: "Basic Defensive Support",
      description:
        "Defend within the team's normal shape, with no extreme recovery or pressing instruction.",
    },
    {
      id: "stay_forward",
      label: "Stay Forward",
      description:
        "Remain high when possession is lost, to give the team an outlet on the counter.",
      tacticalEffects: ["reduce_pressing", "decrease_forward_runs"],
      summary: "Stays high",
    },
    {
      id: "drop_back",
      label: "Drop Back",
      description:
        "Recover into midfield and help the team defend in a deeper shape.",
      groups: ["AM"],
      summary: "Drops into midfield",
    },
    {
      id: "come_back",
      label: "Come Back",
      description:
        "Track back alongside the full-back and defend the flank as a midfielder.",
      groups: ["WIDE"],
      summary: "Tracks back",
    },
    {
      id: "press_from_front",
      label: "Press From Front",
      description:
        "Pressure the opponent's first pass immediately rather than waiting for the shape.",
      groups: ["AM"],
      tacticalEffects: ["increase_pressing"],
      summary: "Presses from the front",
    },
    {
      id: "press_centre_backs",
      label: "Press Centre-Backs",
      description:
        "Go directly at the centre-backs to stop them playing out from the back.",
      groups: ["ST"],
      tacticalEffects: ["increase_pressing"],
      summary: "Presses the centre-backs",
    },
    {
      id: "drop_into_midfield",
      label: "Drop Into Midfield",
      description:
        "Drop in to make an extra midfielder when the team is defending deep.",
      groups: ["ST"],
      summary: "Drops into midfield",
    },
  ],
};

const attackingMovement: InstructionCategory = {
  id: "attacking_movement",
  label: "Attacking Movement",
  description: "How the player moves once the team reaches the final third.",
  icon: "forward",
  groups: ["AM"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced Movement",
      description: "Read the attack and take whichever movement it needs.",
    },
    {
      id: "get_into_box",
      label: "Get Into Box",
      description:
        "Push into the penalty area to add a body attacking the delivery.",
      tacticalEffects: ["attack_box", "increase_forward_runs"],
      summary: "Gets into the box",
    },
    {
      id: "support_striker",
      label: "Support Striker",
      description:
        "Play close to the forward to give him an immediate option when he receives.",
      summary: "Supports the striker",
    },
    {
      id: "arrive_late",
      label: "Arrive Late",
      description:
        "Hang back and come onto the ball behind the defence's eyeline at the edge of the box.",
      tacticalEffects: ["attack_box"],
      summary: "Arrives late",
    },
    {
      id: "run_beyond",
      label: "Run Beyond",
      description:
        "Break past the forward into the space behind the last defender.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Runs beyond",
    },
  ],
};

const positioningFreedom: InstructionCategory = {
  id: "positioning_freedom",
  label: "Positioning Freedom",
  description: "How far the player may stray from the position he is given.",
  icon: "roam",
  groups: ["AM"],
  defaultOptionId: "stick_to_position",
  options: [
    {
      id: "stick_to_position",
      label: "Stick to Position",
      description:
        "Hold the shape the formation gives him and let the ball find him.",
      tacticalEffects: ["hold_position"],
    },
    {
      id: "free_roam",
      label: "Free Roam",
      description:
        "Allow the player to move away from his nominal position to find useful spaces between the lines.",
      tacticalEffects: ["increase_roaming"],
      summary: "Free-roaming",
    },
    {
      id: "drift_wide",
      label: "Drift Wide",
      description:
        "Move out to the flank to overload the wide area and pull a defender with him.",
      tacticalEffects: ["increase_width", "increase_roaming"],
      summary: "Drifts wide",
    },
    {
      id: "find_pockets",
      label: "Find Pockets",
      description:
        "Work the space between the opponent's midfield and defence, and receive on the half-turn.",
      tacticalEffects: ["increase_roaming"],
      summary: "Finds the pockets",
    },
  ],
};

const chanceCreation: InstructionCategory = {
  id: "chance_creation",
  label: "Chance Creation",
  description: "How the player is asked to hurt the opponent.",
  icon: "pass",
  groups: ["AM"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description: "Create, carry or shoot, depending on what the defence offers.",
    },
    {
      id: "creative_playmaker",
      label: "Creative Playmaker",
      description:
        "Take responsibility for the final ball and look for the pass that breaks the line.",
      summary: "Creator",
    },
    {
      id: "direct_runner",
      label: "Direct Runner",
      description:
        "Attack the defence with the ball at his feet and take defenders on.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Runs at defenders",
    },
    {
      id: "shoot_more",
      label: "Shoot More",
      description: "Take the shot from distance rather than work a better opening.",
      summary: "Shoots on sight",
    },
    {
      id: "link_play",
      label: "Link Play",
      description:
        "Keep the move alive with quick one- and two-touch combinations rather than hold the ball.",
      summary: "Links the play",
    },
  ],
};

const defensivePositioning: InstructionCategory = {
  id: "defensive_positioning",
  label: "Defensive Positioning",
  description: "Where the player stands when the opponent has the ball.",
  icon: "position",
  groups: ["AM"],
  defaultOptionId: "cover_centre",
  options: [
    {
      id: "cover_centre",
      label: "Cover Centre",
      description: "Hold a central position and block the route through the middle.",
      tacticalEffects: ["protect_centre"],
    },
    {
      id: "press_holding_midfielder",
      label: "Press Holding Midfielder",
      description:
        "Follow the opponent's deepest midfielder and stop him receiving the ball.",
      tacticalEffects: ["increase_pressing"],
      summary: "Marks the pivot",
    },
    {
      id: "screen_passing_lanes",
      label: "Screen Passing Lanes",
      description:
        "Stand in the passing lane rather than chase the ball, so the opponent must go around.",
      tacticalEffects: ["protect_centre", "reduce_pressing"],
      summary: "Screens the lanes",
    },
  ],
};

const boxPresence: InstructionCategory = {
  id: "box_presence",
  label: "Box Presence",
  description: "Where the player is when the ball is delivered into the box.",
  icon: "box",
  groups: ["AM", "WIDE"],
  defaultOptionId: "balanced",
  groupDefaults: { WIDE: "edge_of_box" },
  options: [
    {
      id: "stay_outside_box",
      label: "Stay Outside Box",
      description: "Hold the edge of the area for the cut-back and the second ball.",
      groups: ["AM"],
      tacticalEffects: ["decrease_forward_runs"],
      summary: "Holds the edge",
    },
    {
      id: "balanced",
      label: "Balanced",
      description:
        "Go into the box when the delivery invites it, and hold back when it does not.",
      groups: ["AM"],
    },
    {
      id: "stay_wide",
      label: "Stay Wide",
      description:
        "Stay on the opposite flank to keep the defence stretched instead of entering the box.",
      groups: ["WIDE"],
      tacticalEffects: ["increase_width"],
      summary: "Stays wide",
    },
    {
      id: "edge_of_box",
      label: "Edge of Box",
      description:
        "Take up the edge of the area, ready for the cut-back or the loose ball.",
      groups: ["WIDE"],
    },
    {
      id: "attack_far_post",
      label: "Attack Far Post",
      description: "Attack the far post on every delivery from the opposite side.",
      groups: ["WIDE"],
      tacticalEffects: ["attack_box"],
      summary: "Attacks the far post",
    },
    {
      id: "attack_box",
      label: "Attack Box",
      description:
        "Get into the penalty area for the delivery whenever the ball goes wide.",
      tacticalEffects: ["attack_box", "increase_forward_runs"],
      summary: "Attacks the box",
    },
  ],
};

const attackingRuns: InstructionCategory = {
  id: "attacking_runs",
  label: "Attacking Runs",
  description: "The run the player makes when the team has controlled possession.",
  icon: "forward",
  groups: ["WIDE", "ST"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description: "Take whichever run the defence leaves available.",
    },
    {
      id: "come_short",
      label: "Come Short",
      description:
        "Drop toward the ball to offer a passing option and help connect midfield with attack.",
      tacticalEffects: ["decrease_forward_runs"],
      summary: "Comes short",
    },
    {
      id: "run_in_behind",
      label: "Run In Behind",
      description:
        "Look to threaten the space behind the defensive line whenever the team has controlled possession.",
      tacticalEffects: ["increase_forward_runs"],
      summary: "Runs in behind",
    },
    {
      id: "attack_half_space",
      label: "Attack Half-Space",
      description:
        "Attack the gap between the opposing full-back and centre-back rather than the touchline.",
      groups: ["WIDE"],
      tacticalEffects: ["decrease_width", "increase_forward_runs"],
      summary: "Attacks the half-space",
    },
    {
      id: "target_player",
      label: "Target Player",
      description:
        "Be the first option for the long ball and compete for it with the centre-backs.",
      groups: ["ST"],
      summary: "Target man",
    },
    {
      id: "move_into_channels",
      label: "Move Into Channels",
      description:
        "Pull out into the channel beside the centre-back to receive facing the game.",
      groups: ["ST"],
      tacticalEffects: ["increase_roaming"],
      summary: "Works the channels",
    },
  ],
};

const finalThirdMovement: InstructionCategory = {
  id: "final_third_movement",
  label: "Final-Third Movement",
  description: "What the wide player does once he gets the ball high up the pitch.",
  icon: "roam",
  groups: ["WIDE"],
  // The plan asks for a role-derived default here. With no tactical-role model
  // in the app, the honest neutral is to leave the choice to the player.
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Mixed",
      description:
        "Take the ball outside or inside depending on how the defender shows him.",
    },
    {
      id: "hold_width",
      label: "Hold Width",
      description: "Stay on the touchline and take the full-back on the outside.",
      tacticalEffects: ["increase_width"],
      summary: "Holds the width",
    },
    {
      id: "cut_inside",
      label: "Cut Inside",
      description:
        "Come onto the stronger foot and attack the box from the half-space.",
      tacticalEffects: ["decrease_width"],
      summary: "Cuts inside",
    },
    {
      id: "attack_byline",
      label: "Attack Byline",
      description: "Drive to the byline and look for the cut-back from the goal line.",
      tacticalEffects: ["increase_forward_runs", "increase_width"],
      summary: "Attacks the byline",
    },
    {
      id: "roam",
      label: "Roam",
      description:
        "Move freely across the front line and swap flanks to find a mismatch.",
      tacticalEffects: ["increase_roaming"],
      summary: "Roams across the front",
    },
  ],
};

const pressing: InstructionCategory = {
  id: "pressing",
  label: "Pressing",
  description: "Who the wide player pressures when the opponent builds up.",
  icon: "press",
  groups: ["WIDE"],
  defaultOptionId: "normal_press",
  options: [
    {
      id: "normal_press",
      label: "Normal Press",
      description: "Press in line with the team's defensive settings.",
    },
    {
      id: "press_full_back",
      label: "Press Full-Back",
      description:
        "Go out to the opposing full-back and stop the ball being switched up the line.",
      tacticalEffects: ["increase_pressing"],
      summary: "Presses the full-back",
    },
    {
      id: "screen_inside_pass",
      label: "Screen Inside Pass",
      description:
        "Stand off and block the pass inside, forcing the opponent down the line.",
      tacticalEffects: ["protect_centre", "reduce_pressing"],
      summary: "Screens the inside",
    },
    {
      id: "aggressive_press",
      label: "Aggressive Press",
      description:
        "Hunt the ball high and early, even when the rest of the team is not pressing.",
      tacticalEffects: ["increase_pressing"],
      summary: "Presses aggressively",
    },
  ],
};

const linkUpPlay: InstructionCategory = {
  id: "link_up_play",
  label: "Link-Up Play",
  description: "What the forward does when the ball comes into him.",
  icon: "pass",
  groups: ["ST"],
  defaultOptionId: "balanced",
  options: [
    {
      id: "balanced",
      label: "Balanced",
      description: "Hold the ball or release it early, whichever the support allows.",
    },
    {
      id: "hold_up_ball",
      label: "Hold Up Ball",
      description:
        "Take the ball in, protect it with his body and wait for the team to get up the pitch.",
      tacticalEffects: ["hold_position"],
      summary: "Holds the ball up",
    },
    {
      id: "play_one_touch",
      label: "Play One-Touch",
      description: "Release the ball first time to keep the move moving at speed.",
      summary: "One-touch",
    },
    {
      id: "drop_between_lines",
      label: "Drop Between Lines",
      description:
        "Drop off the centre-backs to receive between the lines and turn into midfield.",
      tacticalEffects: ["decrease_forward_runs", "increase_roaming"],
      summary: "Drops between the lines",
    },
  ],
};

const penaltyAreaBehaviour: InstructionCategory = {
  id: "penalty_area_behaviour",
  label: "Penalty-Area Behaviour",
  description: "Which post the forward attacks when the ball is delivered.",
  icon: "box",
  groups: ["ST"],
  defaultOptionId: "mixed_movement",
  options: [
    {
      id: "attack_near_post",
      label: "Attack Near Post",
      description:
        "Attack the near post to meet the delivery before the defender can set.",
      tacticalEffects: ["attack_box"],
      summary: "Attacks the near post",
    },
    {
      id: "attack_centre",
      label: "Attack Centre",
      description:
        "Hold the centre of the goal and attack the ball between the centre-backs.",
      tacticalEffects: ["attack_box"],
      summary: "Attacks the centre",
    },
    {
      id: "attack_far_post",
      label: "Attack Far Post",
      description: "Pull to the back post and attack the ball across the defence.",
      tacticalEffects: ["attack_box"],
      summary: "Attacks the far post",
    },
    {
      id: "mixed_movement",
      label: "Mixed Movement",
      description: "Vary the run so the defender cannot settle on one position.",
    },
  ],
};

/* ─── Registry ──────────────────────────────────────────────────────────── */

const CATEGORY_LIST: InstructionCategory[] = [
  startingPosition,
  distribution,
  crosses,
  defensiveAggression,
  marking,
  possessionSupport,
  wideCover,
  attackingSupport,
  runType,
  defensiveApproach,
  width,
  crossingPosition,
  defensiveDuty,
  defensiveCoverage,
  possessionPositioning,
  passingRisk,
  counterAttack,
  positioning,
  defensiveResponsibility,
  boxSupport,
  passingFreedom,
  defensiveSupport,
  attackingMovement,
  positioningFreedom,
  chanceCreation,
  defensivePositioning,
  boxPresence,
  attackingRuns,
  finalThirdMovement,
  pressing,
  linkUpPlay,
  penaltyAreaBehaviour,
];

/** Every category, by ID. */
export const PLAYER_INSTRUCTION_DEFINITIONS: Record<
  string,
  InstructionCategory
> = Object.fromEntries(
  CATEGORY_LIST.map((category) => [category.id, category]),
);

/**
 * The order the cards are laid out in, per kind of player. Written out rather
 * than derived, because no single registry order reads well for every group at
 * once — a striker is asked about his runs first, a winger about how he
 * defends.
 */
export const GROUP_CARD_ORDER: Record<PositionGroup, string[]> = {
  GK: ["starting_position", "distribution", "crosses"],
  CB: ["defensive_aggression", "marking", "possession_support", "wide_cover"],
  FB: [
    "attacking_support",
    "run_type",
    "defensive_approach",
    "width",
    "crossing_position",
  ],
  WB: [
    "attacking_support",
    "run_type",
    "defensive_approach",
    "width",
    "crossing_position",
  ],
  DM: [
    "defensive_duty",
    "defensive_coverage",
    "possession_positioning",
    "passing_risk",
    "counter_attack",
  ],
  CM: [
    "attacking_support",
    "positioning",
    "defensive_responsibility",
    "box_support",
    "passing_freedom",
  ],
  AM: [
    "defensive_support",
    "attacking_movement",
    "positioning_freedom",
    "chance_creation",
    "defensive_positioning",
    "box_presence",
  ],
  WIDE: [
    "defensive_support",
    "width",
    "attacking_runs",
    "final_third_movement",
    "box_presence",
    "pressing",
  ],
  ST: [
    "attacking_runs",
    "positioning",
    "defensive_support",
    "link_up_play",
    "penalty_area_behaviour",
  ],
};
