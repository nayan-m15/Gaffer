import { apiUrl } from "@/lib/api-url";

/** Thrown when the backend responds with a non-2xx status. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Thin fetch wrapper for the backend API.
 *
 * Always sends the Better Auth session cookie (`credentials: "include"`),
 * serializes/parses JSON, and throws an `ApiError` with the backend's
 * message on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = apiUrl(path);

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const body = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const message =
      (body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : undefined) ?? "Request failed.";
    throw new ApiError(message, response.status);
  }

  if (body === undefined && response.status !== 204) {
    throw new ApiError("Invalid response from server", response.status);
  }

  return body as T;
}
