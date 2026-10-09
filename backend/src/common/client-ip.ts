import { isIP } from 'node:net';

/** Headers the resolvers below consult, in Node's lowercased form. */
export interface ProxyHeaders {
  [key: string]: string | string[] | undefined;
  'x-vercel-forwarded-for'?: string | string[] | undefined;
  'cf-connecting-ip'?: string | string[] | undefined;
  'x-forwarded-for'?: string | string[] | undefined;
}

/**
 * The two identities a request is rate limited by. `primaryIp` keys the
 * per-client bucket; `edgeIp` — present only when it differs from
 * `primaryIp` — keys the unforgeable backstop bucket.
 */
export interface ClientIdentity {
  primaryIp: string;
  edgeIp?: string;
}

/**
 * Derives the two identities a request answers to, for any limiter keyed on
 * "who is calling".
 *
 * Production traffic reaches this backend as browser → Vercel rewrite
 * (`frontend/vercel.json`) → Render, where Render fronts the service with
 * Cloudflare. Nothing a caller *claims* about its address is trustworthy on
 * its own, because the Render origin is publicly reachable and a client
 * hitting it directly can set arbitrary headers:
 *
 * - `x-vercel-forwarded-for` carries the real client IP *only* on the proxied
 *   path, where Vercel overwrites it. A direct caller can set it to anything,
 *   so on its own it would allow free bucket rotation.
 * - The leftmost `x-forwarded-for` entry and `x-real-ip` are plain
 *   caller-controlled headers on the direct path, and are never trusted.
 *
 * `primaryIp` is therefore the per-client identity (the real client IP on the
 * legitimate path), and `edgeIp` rides along whenever it differs so a caller
 * who forges the former is still bounded by a bucket they cannot rotate. When
 * both resolve to the same address — a direct request with no forged header,
 * or a forgery replaying the caller's own IP — a single unforgeable bucket is
 * counted exactly once rather than double-charging the request.
 */
export function resolveClientIdentity(
  headers: ProxyHeaders,
  socketRemoteAddress?: string,
): ClientIdentity {
  const edgeIp = resolveEdgeObservedIp(headers, socketRemoteAddress);
  const forwarded = headerIp(headers['x-vercel-forwarded-for'], 'first');

  if (forwarded && forwarded !== edgeIp) {
    return { primaryIp: forwarded, edgeIp };
  }
  return { primaryIp: edgeIp };
}

/**
 * The IP Render's Cloudflare edge observed as the immediate client — the one
 * address in the request the caller cannot choose:
 *
 * 1. `cf-connecting-ip`, which Cloudflare writes on every request reaching a
 *    Render web service, overwriting whatever the caller sent. On the proxied
 *    path it holds the shared Vercel egress IP; for a direct caller, their
 *    real source IP.
 * 2. The rightmost `x-forwarded-for` entry — the position the edge appends
 *    its observed peer to (the leftmost is caller-controlled and spoofable).
 * 3. The socket address, for direct requests carrying no proxy headers at all
 *    (local development and tests — behind Render the first two always exist).
 * 4. `'unknown'` — a deliberate shared bucket, so an unresolvable request is
 *    still limited (fail closed) rather than exempted entirely.
 */
export function resolveEdgeObservedIp(
  headers: ProxyHeaders,
  socketRemoteAddress?: string,
): string {
  return (
    headerIp(headers['cf-connecting-ip'], 'first') ??
    headerIp(headers['x-forwarded-for'], 'last') ??
    socketRemoteAddress ??
    'unknown'
  );
}

/**
 * Extracts a validated IP from a header that may hold a comma-separated chain
 * (and, in Node, may arrive as an array of such chains). `which` picks the
 * trustworthy end: the FIRST entry of a single-address header, or the LAST
 * entry of `x-forwarded-for`, the position the edge appends to. Values that
 * are not bare IP addresses are discarded rather than trusted, so a junk value
 * can never become a bucket key or collide with another bucket's prefix by
 * forging something like `x-vercel-forwarded-for: edge:1.2.3.4`.
 */
function headerIp(
  value: string | string[] | undefined,
  which: 'first' | 'last',
): string | undefined {
  const raw = Array.isArray(value)
    ? which === 'last'
      ? value[value.length - 1]
      : value[0]
    : value;
  if (typeof raw !== 'string') return undefined;

  const entries = raw.split(',').map((entry) => entry.trim().toLowerCase());
  const entry = which === 'last' ? entries[entries.length - 1] : entries[0];
  return entry && isIP(entry) ? entry : undefined;
}
