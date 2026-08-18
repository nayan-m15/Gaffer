/**
 * Roster mock data and shared types for the Athlete Roster UI.
 *
 * This is intentionally UI-only data.  No database schema is implied here;
 * statistics such as appearances, goals and cards will later be derived from
 * dedicated match / event modules rather than stored on the athlete record.
 */

/** Player availability state shown in the roster table. */
export type AthleteStatus = "Available" | "Injured" | "Suspended";

/** A single recent match appearance used in the athlete detail panel. */
export interface RecentAppearance {
  /** Opposing team name. */
  opponent: string;
  /** Minutes played in the match. */
  minutes: number;
  /** Short human-readable contribution (e.g. "1 Goal, 2 Assists"). */
  contribution: string;
}

/** Temporary athlete shape used to drive the roster UI. */
export interface Athlete {
  /** Stable local identifier. */
  id: string;
  /** Jersey number used for squad identification. */
  jerseyNumber: number;
  /** Display name. */
  name: string;
  /** Short position abbreviation (e.g. GK, CB, AM). */
  position: string;
  /** Full position description (e.g. Attacking Midfielder). */
  positionLong: string;
  /** Current squad status. */
  status: AthleteStatus;
  /** Season appearances. */
  appearances: number;
  /** Season goals. */
  goals: number;
  /** Season assists. */
  assists: number;
  /** Current age in years. */
  age: number;
  /** Human-readable joined date (e.g. "Aug 2022"). */
  joinedDate: string;
  /** Preferred kicking foot. */
  preferredFoot: "Left" | "Right" | "Both";
  /** Season yellow cards. */
  yellowCards: number;
  /** Season red cards. */
  redCards: number;
  /** Recently logged matches for the detail panel. */
  recentAppearances: RecentAppearance[];
  /** Initials used for fallback avatars. */
  initials: string;
  /** Whether the athlete has been archived (soft-delete state). */
  isArchived: boolean;
}

/** Sample squad used while the backend API is not yet connected. */
export const MOCK_ATHLETES: Athlete[] = [
  {
    id: "ath-001",
    jerseyNumber: 1,
    name: "Danny Cole",
    position: "GK",
    positionLong: "Goalkeeper",
    status: "Available",
    appearances: 14,
    goals: 0,
    assists: 0,
    age: 24,
    joinedDate: "Jul 2021",
    preferredFoot: "Right",
    yellowCards: 1,
    redCards: 0,
    initials: "DC",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "Clean Sheet" },
      { opponent: "Riverside United", minutes: 90, contribution: "2 Saves" },
    ],
  },
  {
    id: "ath-002",
    jerseyNumber: 4,
    name: "Sam Sterling",
    position: "CB",
    positionLong: "Centre-Back",
    status: "Available",
    appearances: 14,
    goals: 1,
    assists: 1,
    age: 26,
    joinedDate: "Jun 2020",
    preferredFoot: "Right",
    yellowCards: 3,
    redCards: 0,
    initials: "SS",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "1 Goal" },
      { opponent: "Eastside Athletic", minutes: 90, contribution: "Clean Sheet" },
    ],
  },
  {
    id: "ath-003",
    jerseyNumber: 5,
    name: "Toby Vance",
    position: "CB",
    positionLong: "Centre-Back",
    status: "Injured",
    appearances: 10,
    goals: 0,
    assists: 0,
    age: 25,
    joinedDate: "Aug 2021",
    preferredFoot: "Left",
    yellowCards: 2,
    redCards: 0,
    initials: "TV",
    isArchived: false,
    recentAppearances: [
      { opponent: "Metro Rovers", minutes: 23, contribution: "Injured 23'" },
      { opponent: "Riverside United", minutes: 90, contribution: "Clean Sheet" },
    ],
  },
  {
    id: "ath-004",
    jerseyNumber: 8,
    name: "Leo Miller",
    position: "CM",
    positionLong: "Central Midfielder",
    status: "Available",
    appearances: 13,
    goals: 2,
    assists: 4,
    age: 23,
    joinedDate: "Sep 2022",
    preferredFoot: "Right",
    yellowCards: 4,
    redCards: 0,
    initials: "LM",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "1 Assist" },
      { opponent: "Riverside United", minutes: 82, contribution: "1 Assist, 1 Yellow Card" },
    ],
  },
  {
    id: "ath-005",
    jerseyNumber: 10,
    name: "Zachary Knight",
    position: "AM",
    positionLong: "Attacking Midfielder",
    status: "Available",
    appearances: 14,
    goals: 8,
    assists: 9,
    age: 22,
    joinedDate: "Aug 2022",
    preferredFoot: "Right",
    yellowCards: 2,
    redCards: 0,
    initials: "ZK",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "1 Goal, 2 Assists" },
      { opponent: "Riverside United", minutes: 82, contribution: "1 Assist, 1 Yellow Card" },
      { opponent: "Eastside Athletic", minutes: 90, contribution: "2 Goals" },
      { opponent: "Metro Rovers", minutes: 74, contribution: "1 Goal" },
    ],
  },
  {
    id: "ath-006",
    jerseyNumber: 11,
    name: "Mason Reed",
    position: "LW",
    positionLong: "Left Winger",
    status: "Available",
    appearances: 12,
    goals: 6,
    assists: 3,
    age: 21,
    joinedDate: "Jan 2023",
    preferredFoot: "Right",
    yellowCards: 1,
    redCards: 0,
    initials: "MR",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 78, contribution: "1 Goal" },
      { opponent: "Eastside Athletic", minutes: 90, contribution: "1 Goal, 1 Assist" },
    ],
  },
  {
    id: "ath-007",
    jerseyNumber: 9,
    name: "Connor Bailey",
    position: "ST",
    positionLong: "Striker",
    status: "Suspended",
    appearances: 11,
    goals: 11,
    assists: 2,
    age: 27,
    joinedDate: "May 2019",
    preferredFoot: "Left",
    yellowCards: 5,
    redCards: 1,
    initials: "CB",
    isArchived: false,
    recentAppearances: [
      { opponent: "Riverside United", minutes: 90, contribution: "1 Goal" },
      { opponent: "Metro Rovers", minutes: 90, contribution: "Red Card" },
    ],
  },
  {
    id: "ath-008",
    jerseyNumber: 2,
    name: "Jude Mercer",
    position: "RB",
    positionLong: "Right-Back",
    status: "Available",
    appearances: 14,
    goals: 0,
    assists: 2,
    age: 24,
    joinedDate: "Feb 2021",
    preferredFoot: "Right",
    yellowCards: 3,
    redCards: 0,
    initials: "JM",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "Clean Sheet" },
      { opponent: "Eastside Athletic", minutes: 90, contribution: "1 Assist" },
    ],
  },
  {
    id: "ath-009",
    jerseyNumber: 3,
    name: "Archie Cross",
    position: "LB",
    positionLong: "Left-Back",
    status: "Available",
    appearances: 13,
    goals: 0,
    assists: 1,
    age: 22,
    joinedDate: "Nov 2021",
    preferredFoot: "Left",
    yellowCards: 2,
    redCards: 0,
    initials: "AC",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "Clean Sheet" },
      { opponent: "Riverside United", minutes: 90, contribution: "Clean Sheet" },
    ],
  },
  {
    id: "ath-010",
    jerseyNumber: 14,
    name: "Nate Fletcher",
    position: "ST",
    positionLong: "Striker",
    status: "Available",
    appearances: 8,
    goals: 3,
    assists: 1,
    age: 20,
    joinedDate: "Mar 2023",
    preferredFoot: "Right",
    yellowCards: 0,
    redCards: 0,
    initials: "NF",
    isArchived: false,
    recentAppearances: [
      { opponent: "Eastside Athletic", minutes: 65, contribution: "1 Goal" },
      { opponent: "Metro Rovers", minutes: 74, contribution: "1 Assist" },
    ],
  },
  {
    id: "ath-011",
    jerseyNumber: 6,
    name: "Ollie Thorne",
    position: "DM",
    positionLong: "Defensive Midfielder",
    status: "Available",
    appearances: 11,
    goals: 0,
    assists: 0,
    age: 28,
    joinedDate: "Jul 2019",
    preferredFoot: "Right",
    yellowCards: 6,
    redCards: 0,
    initials: "OT",
    isArchived: false,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 90, contribution: "Clean Sheet" },
      { opponent: "Riverside United", minutes: 90, contribution: "Clean Sheet" },
    ],
  },
  {
    id: "ath-012",
    jerseyNumber: 17,
    name: "Finn Hayes",
    position: "RW",
    positionLong: "Right Winger",
    status: "Available",
    appearances: 6,
    goals: 2,
    assists: 1,
    age: 19,
    joinedDate: "Jan 2024",
    preferredFoot: "Left",
    yellowCards: 1,
    redCards: 0,
    initials: "FH",
    isArchived: true,
    recentAppearances: [
      { opponent: "Apex Wanderers", minutes: 45, contribution: "1 Goal" },
    ],
  },
  {
    id: "ath-013",
    jerseyNumber: 21,
    name: "Eli Brooks",
    position: "CM",
    positionLong: "Central Midfielder",
    status: "Injured",
    appearances: 4,
    goals: 0,
    assists: 1,
    age: 30,
    joinedDate: "Aug 2020",
    preferredFoot: "Right",
    yellowCards: 2,
    redCards: 0,
    initials: "EB",
    isArchived: true,
    recentAppearances: [
      { opponent: "Metro Rovers", minutes: 12, contribution: "Injured 12'" },
    ],
  },
];
