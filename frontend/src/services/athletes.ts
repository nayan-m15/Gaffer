import { apiFetch } from "@/lib/api";
import type { Athlete } from "@/components/roster/data";

/**
 * Raw athlete record returned by the backend.
 *
 * The Sprint 1 schema stores only identity / squad information; statistics and
 * availability are derived or mocked on the frontend.
 */
export interface BackendAthlete {
  id: string;
  teamId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  position: string | null;
  squadNumber: number | null;
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
    status: "Available",
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
  };
}
