import { apiFetch } from "@/lib/api";

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch<{ status: true }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<void> {
  await apiFetch<{ status: true }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}
