import { apiFetch } from "@/lib/api";
import type { Athlete, AthleteStatus, ClaimStatusUi } from "@/components/roster/data";

/** Athlete availability status values persisted by the backend (Drizzle enum). */
export type AthleteStatusValue = "available" | "injured" | "suspended";

/** Claim lifecycle state for an athlete, computed server-side. */
export type ClaimStatus = "unclaimed" | "invited" | "claimed";

/** All accepted status values, in UI display order. */
export const ATHLETE_STATUS_VALUES: readonly AthleteStatusValue[] = [
  "available",
  "injured",
  "suspended",
] as const;

/** Maps backend status values to the labels shown in the roster and team
 * management UIs (StatusBadge consumes these display labels). */
export const STATUS_LABELS: Record<AthleteStatusValue, AthleteStatus> = {
  available: "Available",
  injured: "Injured",
  suspended: "Suspended",
};

/** Maps backend claim status to the labels shown in the roster UI. */
const CLAIM_STATUS_LABELS: Record<ClaimStatus, ClaimStatusUi> = {
  unclaimed: "Unclaimed",
  invited: "Invited",
  claimed: "Claimed",
};

/**
 * Raw athlete record returned by the backend.
 *
 * Statistics are derived or mocked on the frontend; identity, squad and
 * availability status (available / injured / suspended) are persisted.
 */
export interface BackendAthlete {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  position: string | null;
  squadNumber: number | null;
  status: AthleteStatusValue;
  /** Computed by the active-athlete query; absent on archived-only responses. */
  claimStatus?: ClaimStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted by POST /athletes. */
export interface CreateAthleteInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  position?: string;
  squadNumber?: number;
  status?: AthleteStatusValue;
}

/** Fields accepted by PATCH /athletes/:id. */
export type UpdateAthleteInput = Partial<CreateAthleteInput>;

/** Values managed by the add / edit athlete form. */
export interface AthleteFormValues {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  position: string;
  squadNumber: number;
  status: AthleteStatusValue;
}

const ATHLETES_PATH = "/athletes";

export async function getAthletes(): Promise<BackendAthlete[]> {
  return apiFetch<BackendAthlete[]>(ATHLETES_PATH);
}

export async function getArchivedAthletes(): Promise<BackendAthlete[]> {
  return apiFetch<BackendAthlete[]>(`${ATHLETES_PATH}/archived`);
}

export async function createAthlete(input: CreateAthleteInput): Promise<BackendAthlete> {
  return apiFetch<BackendAthlete>(ATHLETES_PATH, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAthlete(
  id: string,
  input: UpdateAthleteInput,
): Promise<BackendAthlete> {
  return apiFetch<BackendAthlete>(`${ATHLETES_PATH}/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveAthlete(id: string): Promise<BackendAthlete> {
  return apiFetch<BackendAthlete>(`${ATHLETES_PATH}/${id}`, {
    method: "DELETE",
  });
}

export async function restoreAthlete(id: string): Promise<BackendAthlete> {
  return apiFetch<BackendAthlete>(`${ATHLETES_PATH}/${id}/restore`, {
    method: "PATCH",
  });
}

/* ── Mapping helpers ────────────────────────────────────────────────────── */

function calculateAge(dateOfBirth: string | null | undefined): number {
  if (!dateOfBirth) return 0;

  const birth = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }

  return age;
}

function formatJoinedDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

/**
 * Converts a backend athlete into the UI shape used by the roster components.
 *
 * UI-only fields that are not yet persisted are populated with safe defaults.
 */
export function toUiAthlete(backend: BackendAthlete): Athlete {
  const firstName = backend.firstName;
  const lastName = backend.lastName;
  const position = backend.position ?? "UN";

  return {
    id: backend.id,
    jerseyNumber: backend.squadNumber ?? 0,
    name: `${firstName} ${lastName}`,
    position,
    positionLong: position,
    status: STATUS_LABELS[backend.status],
    appearances: 0,
    goals: 0,
    assists: 0,
    age: calculateAge(backend.dateOfBirth),
    joinedDate: formatJoinedDate(backend.createdAt),
    preferredFoot: "Right",
    yellowCards: 0,
    redCards: 0,
    recentAppearances: [],
    initials: getInitials(firstName, lastName),
    isArchived: backend.archivedAt !== null,
    claimStatus: CLAIM_STATUS_LABELS[backend.claimStatus ?? "unclaimed"],
  };
}

/**
 * Converts a backend athlete into the form values used by the add/edit dialog.
 */
export function toFormValues(backend: BackendAthlete): AthleteFormValues {
  return {
    firstName: backend.firstName,
    lastName: backend.lastName,
    dateOfBirth: backend.dateOfBirth ?? "",
    position: backend.position ?? "",
    squadNumber: backend.squadNumber ?? 0,
    status: backend.status,
  };
}

/* ── Claim-invite endpoints ───────────────────────────────────────────── */

export interface ClaimInviteResult {
  token: string;
  claimUrl: string;
  expiresAt: string;
}

/** POST /athletes/:athleteId/claim-invite — generate a one-time invite link. */
export async function createClaimInvite(athleteId: string): Promise<ClaimInviteResult> {
  return apiFetch<ClaimInviteResult>(`${ATHLETES_PATH}/${athleteId}/claim-invite`, {
    method: "POST",
  });
}

/** DELETE /athletes/:athleteId/claim-invite — revoke the active pending invite. */
export async function revokeClaimInvite(athleteId: string): Promise<{ revoked: boolean }> {
  return apiFetch<{ revoked: boolean }>(`${ATHLETES_PATH}/${athleteId}/claim-invite`, {
    method: "DELETE",
  });
}
