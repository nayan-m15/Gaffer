import { apiFetch } from "@/lib/api";

/** Allowed values for the `sex` field, persisted as a PG enum. */
export type Sex = "male" | "female" | "prefer_not_to_say";

/**
 * Raw user record returned by GET /profile.
 *
 * Mirrors the Better Auth `user` table including the personal-profile
 * columns added for profile management.
 */
export interface BackendProfile {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  phoneNumber: string | null;
  sex: Sex | null;
  dateOfBirth: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Fields accepted by PATCH /profile. */
export interface UpdateProfileInput {
  name: string;
  phoneNumber: string | null;
  sex: Sex | null;
  dateOfBirth: string | null;
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


/** Fields required to securely change the signed-in user's password. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/**
 * Changes the signed-in user's credential password after the backend verifies
 * their current password. Other active sessions are revoked server-side.
 */
export async function changePassword(
  input: ChangePasswordInput,
): Promise<{ status: true }> {
  return apiFetch<{ status: true }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
