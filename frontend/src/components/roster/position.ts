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

export const MOBILE_POSITION_GROUPS = [
  { label: "Goalkeepers", positions: new Set(["GK", "GOALKEEPER"]) },
  {
    label: "Defenders",
    positions: new Set(["CB", "LB", "RB", "LWB", "RWB", "SW", "DEF", "DF", "DEFENDER"]),
  },
  {
    label: "Midfielders",
    positions: new Set(["DM", "CM", "AM", "LM", "RM", "MID", "MF", "MIDFIELDER"]),
  },
  {
    label: "Forwards",
    positions: new Set(["LW", "RW", "ST", "CF", "SS", "FWD", "FW", "FORWARD", "STRIKER"]),
  },
] as const;

export function getPositionLabel(position: string): string {
  const normalized = position.trim().toUpperCase();
  return POSITION_LABELS[normalized] ?? (position || "Position not set");
}

export function getPositionGroupLabel(position: string): string {
  const normalized = position.trim().toUpperCase();
  return MOBILE_POSITION_GROUPS.find((group) => group.positions.has(normalized))?.label ?? "Squad";
}
