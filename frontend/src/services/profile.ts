import { apiFetch } from "@/lib/api";

/**
 * Raw user record returned by GET /profile.
 *
 * Mirrors the Better Auth `user` table — Sprint 1 only persists identity
 * information. Statistics and team membership are resolved separately.
 */
export interface BackendProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted by PATCH /profile. */
export interface UpdateProfileInput {
  name: string;
}

const PROFILE_PATH = "/profile";

export async function getProfile(): Promise<BackendProfile> {
  return apiFetch<BackendProfile>(PROFILE_PATH);
}

export async function updateProfile(
  input: UpdateProfileInput,
): Promise<BackendProfile> {
  return apiFetch<BackendProfile>(PROFILE_PATH, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
