const POSITION_LABELS: Record<string, string> = {
  GK: "Goalkeeper",
  CB: "Centre Back",
  LB: "Left Back",
  RB: "Right Back",
  LWB: "Left Wing Back",
  RWB: "Right Wing Back",
  SW: "Sweeper",
  DEF: "Defender",
  DF: "Defender",
  DM: "Defensive Midfielder",
  CM: "Central Midfielder",
  AM: "Attacking Midfielder",
  LM: "Left Midfielder",
  RM: "Right Midfielder",
  MID: "Midfielder",
  MF: "Midfielder",
  LW: "Left Winger",
  RW: "Right Winger",
  ST: "Striker",
  CF: "Centre Forward",
  SS: "Second Striker",
  FWD: "Forward",
  FW: "Forward",
  UN: "Position not set",
};

export type PositionGroup = "goalkeeper" | "defender" | "midfielder" | "forward";

export const MOBILE_POSITION_GROUPS = [
  {
    id: "goalkeeper",
    label: "Goalkeepers",
    positions: new Set(["GK", "GOALKEEPER", "GOAL KEEPER", "KEEPER"]),
  },
  {
    id: "defender",
    label: "Defenders",
    positions: new Set([
      "CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB", "SW", "DEF", "DF",
      "DEFENDER", "CENTRE BACK", "CENTER BACK", "LEFT BACK", "RIGHT BACK",
      "LEFT WING BACK", "RIGHT WING BACK", "WING BACK", "SWEEPER",
    ]),
  },
  {
    id: "midfielder",
    label: "Midfielders",
    positions: new Set([
      "CM", "LCM", "RCM", "CDM", "LDM", "RDM", "DM", "CAM", "LAM", "RAM",
      "AM", "LM", "RM", "MF", "MID", "MIDFIELDER", "CENTRAL MIDFIELDER",
      "CENTRE MIDFIELDER", "DEFENSIVE MIDFIELDER", "ATTACKING MIDFIELDER",
      "LEFT MIDFIELDER", "RIGHT MIDFIELDER", "CENTRAL MIDFIELD", "DEFENSIVE MIDFIELD",
      "ATTACKING MIDFIELD",
    ]),
  },
  {
    id: "forward",
    label: "Forwards",
    positions: new Set([
      "LW", "RW", "ST", "CF", "LF", "RF", "SS", "FWD", "FW", "ATT",
      "FORWARD", "STRIKER", "WINGER", "LEFT WINGER", "RIGHT WINGER",
      "LEFT WING", "RIGHT WING", "CENTRE FORWARD", "CENTER FORWARD",
      "SECOND STRIKER", "ATTACKER",
    ]),
  },
] as const;

function normalizePosition(position: string): string {
  return position.trim().toUpperCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

export function getPositionGroup(position: string | null | undefined): PositionGroup | null {
  const normalized = normalizePosition(position ?? "");
  return MOBILE_POSITION_GROUPS.find((group) => group.positions.has(normalized))?.id ?? null;
}

export function getPositionLabel(position: string): string {
  const normalized = position.trim().toUpperCase();
  return POSITION_LABELS[normalized] ?? (position || "Position not set");
}

export function getPositionGroupLabel(position: string): string {
  const group = getPositionGroup(position);
  return MOBILE_POSITION_GROUPS.find((entry) => entry.id === group)?.label ?? "Squad";
}
