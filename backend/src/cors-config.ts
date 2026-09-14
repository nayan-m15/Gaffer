/**
 * CORS configuration split out of `main.ts` so it can be unit tested without
 * bootstrapping the full Nest app (the e2e test harness never calls
 * `app.enableCors`, since that only happens in `bootstrap()`).
 */

type OriginCallback = (error: Error | null, allow?: boolean) => void;
type CorsCallback = (
  error: Error | null,
  options?: Record<string, unknown>,
) => void;

/**
 * `/v1/formations` and `/v1/tactics` are `PublicApiModule`'s externally
 * accessible, unauthenticated API. They carry no cookies and no user data,
 * so they're meant to be fetched from any origin — the strict allowlist
 * that guards cookie-authenticated routes doesn't apply to them.
 */
export function isPublicApiPath(path: string): boolean {
  return path.startsWith('/v1/formations') || path.startsWith('/v1/tactics');
}

/**
 * Builds the `origin` delegate passed to `app.enableCors`. Per-request
 * because the public API needs a different (permissive, no-credentials)
 * policy than the rest of the cookie-authenticated app.
 */
export function buildCorsOptionsDelegate(allowedOrigins: ReadonlySet<string>) {
  return (req: { path: string }, callback: CorsCallback): void => {
    if (isPublicApiPath(req.path)) {
      callback(null, { origin: '*', credentials: false });
      return;
    }

    callback(null, {
      origin: (origin: string | undefined, originCallback: OriginCallback) => {
        // Allow requests with no origin (e.g. server-to-server, mobile, curl)
        if (!origin || allowedOrigins.has(origin)) {
          originCallback(null, true);
          return;
        }

        originCallback(new Error('Origin is not allowed by CORS.'), false);
      },
      credentials: true,
    });
  };
}
