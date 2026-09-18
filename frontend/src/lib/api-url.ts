/**
 * Resolve an API path for the current environment.
 *
 * Production requests deliberately stay on the frontend origin. Vercel
 * rewrites /auth and /api to Render, which keeps Better Auth's OAuth state
 * and session cookies first-party. Calling Render directly from the browser
 * would put those cookies on a different host and break the OAuth callback.
 */
export function apiUrl(path: string): string {
  if (import.meta.env.DEV && import.meta.env.VITE_API_URL) {
    return `${import.meta.env.VITE_API_URL}${path}`;
  }

  return path.startsWith("/auth") ? path : `/api${path}`;
}
