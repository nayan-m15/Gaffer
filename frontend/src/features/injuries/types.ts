/**
 * Injury & Recovery response and request shapes.
 *
 * These mirror the backend Zod contracts in
 * `backend/src/injuries/injuries.schemas.ts` and the Drizzle tables behind
 * them; both must be updated in the same change when a contract moves.
 */

export type BodyRegion =
  | "head"
  | "neck"
  | "shoulder_left"
  | "shoulder_right"
  | "upper_arm_left"
  | "upper_arm_right"
  | "forearm_left"
  | "forearm_right"
  | "wrist_hand_left"
  | "wrist_hand_right"
  | "chest"
  | "abdomen"
  | "groin"
  | "back_upper"
  | "back_lower"
  | "glute_left"
  | "glute_right"
  | "hamstring_left"
  | "hamstring_right"
  | "quad_left"
  | "quad_right"
  | "knee_left"
  | "knee_right"
  | "calf_left"
  | "calf_right"
  | "achilles_left"
  | "achilles_right"
  | "ankle_left"
  | "ankle_right"
  | "foot_left"
  | "foot_right";

export type InjuryType =
  | "strain"
  | "sprain"
  | "tear"
  | "fracture"
  | "contusion"
  | "dislocation"
  | "tendinopathy"
  | "concussion"
  | "laceration"
  | "illness"
  | "other";

export type InjurySeverity = "minor" | "moderate" | "severe";

export type InjuryStatus =
  | "reported"
  | "assessment"
  | "rehab"
  | "return_to_training"
  | "returned"
  | "season_ending";

export type InjuryContext = "match" | "training" | "other";

export type InjuryTimelineKind =
  | "sustained"
  | "assessment"
  | "rehab_started"
  | "reassessment"
  | "setback"
  | "return_to_training"
  | "returned"
  | "note"
  | "estimated_return";

export interface RehabPhase {
  name: string;
  fromDay: number;
  toDay: number;
  focus: string;
  completedOn: string | null;
}

export interface InjuryTimelineEntry {
  id: string;
  injuryId: string;
  kind: InjuryTimelineKind;
  occurredOn: string;
  title: string;
  detail: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

/** One row of the injury record, as the list and detail endpoints return it. */
export interface InjuryRecord {
  id: string;
  teamId: string;
  athleteId: string;
  bodyRegion: BodyRegion;
  injuryType: InjuryType;
  severity: InjurySeverity;
  status: InjuryStatus;
  context: InjuryContext;
  occurredOn: string;
  matchId: string | null;
  matchEventId: string | null;
  minute: number | null;
  estimatedReturnMinDays: number;
  estimatedReturnMaxDays: number;
  estimatedReturnFrom: string;
  estimatedReturnTo: string;
  actualReturnOn: string | null;
  diagnosedBy: string | null;
  description: string | null;
  notes: string | null;
  rehabPhases: RehabPhase[] | null;
  closedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  /* Joined athlete identity, so the record renders without a second query. */
  athleteFirstName: string;
  athleteLastName: string;
  athleteSquadNumber: number | null;
  athletePosition: string | null;
  /* Server-derived. */
  daysOut: number;
  returnVarianceDays: number | null;
  isOpen: boolean;
}

export interface InjuryListItem extends InjuryRecord {
  /** A re-injury of the same region within 90 days of a previous return. */
  isRecurrence: boolean;
}

export interface InjuryDetail extends InjuryRecord {
  timeline: InjuryTimelineEntry[];
}

export type RecoveryGroup =
  | "chest"
  | "shoulders"
  | "arms"
  | "back"
  | "core"
  | "legs"
  | "head_neck";

/**
 * A recovery reading derived from injury records — never measured load. The
 * UI must label it as such wherever it appears.
 */
export interface RecoveryReading {
  group: RecoveryGroup;
  label: string;
  percent: number;
  affectedRegions: BodyRegion[];
}

/** Return-time guidance for a prospective injury, previewed before saving. */
export interface InjuryProtocolPreview {
  bodyRegion: BodyRegion;
  injuryType: InjuryType;
  severity: InjurySeverity;
  occurredOn: string;
  minDays: number;
  maxDays: number;
  estimatedReturnFrom: string;
  estimatedReturnTo: string;
  phases: RehabPhase[];
}

export interface CreateInjuryInput {
  athleteId: string;
  bodyRegion: BodyRegion;
  injuryType: InjuryType;
  severity: InjurySeverity;
  occurredOn: string;
  context?: InjuryContext;
  status?: InjuryStatus;
  matchId?: string;
  matchEventId?: string;
  minute?: number;
  diagnosedBy?: string;
  description?: string;
  notes?: string;
  estimatedReturnMinDays?: number;
  estimatedReturnMaxDays?: number;
}

export interface UpdateInjuryInput {
  bodyRegion?: BodyRegion;
  injuryType?: InjuryType;
  severity?: InjurySeverity;
  status?: InjuryStatus;
  occurredOn?: string;
  diagnosedBy?: string | null;
  description?: string | null;
  notes?: string | null;
  estimatedReturnMinDays?: number;
  estimatedReturnMaxDays?: number;
}

export interface CloseInjuryInput {
  actualReturnOn: string;
  notes?: string;
}

export interface CreateInjuryTimelineEntryInput {
  kind: InjuryTimelineKind;
  occurredOn: string;
  title: string;
  detail?: string;
}

export interface ListInjuriesQuery {
  status?: "open" | "closed" | "all";
  athleteId?: string;
}
