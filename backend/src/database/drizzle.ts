import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { setDefaultAutoSelectFamilyAttemptTimeout } from 'node:net';

import './environment';
import * as schema from './schema';

/**
 * Whether a fetch failed while opening the connection, before any of the
 * request was sent. undici reports these as "fetch failed" with the socket
 * error as the cause; with happy-eyeballs (autoSelectFamily) that cause is an
 * AggregateError holding one error per address tried.
 */
function failedBeforeRequestWasSent(cause: unknown): boolean {
  if (cause instanceof AggregateError) {
    return (
      cause.errors.length > 0 && cause.errors.every(failedBeforeRequestWasSent)
    );
  }
  if (typeof cause !== 'object' || cause === null) return false;
  const { code, syscall } = cause as { code?: unknown; syscall?: unknown };
  return (
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    syscall === 'connect' ||
    syscall === 'getaddrinfo'
  );
}

/**
 * Fetch for Neon's HTTP driver that retries connection failures with
 * exponential backoff. Slow or distant networks (mobile data, CI runners far
 * from the database region) intermittently time out while connecting.
 *
 * Only failures to connect are retried: Neon's SQL requests are POSTs, and
 * replaying one after an ambiguous failure (a reset or timeout once the
 * request was sent) could apply a write twice. Callers retry idempotent
 * operations explicitly.
 */
export async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const maxAttempts = 4;
  const timeoutMs = 15000;

  for (let attempt = 1; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
    } catch (err: unknown) {
      const retryable =
        err instanceof Error && failedBeforeRequestWasSent(err.cause);
      if (attempt >= maxAttempts || !retryable) {
        throw err;
      }

      // Exponential backoff: 300ms, 600ms, 1200ms
      await new Promise((resolve) =>
        setTimeout(resolve, 300 * Math.pow(2, attempt - 1)),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

// Attach the resilient fetch handler to Neon serverless
neonConfig.fetchFunction = resilientFetch;

// Node tries each resolved address for only 250ms before moving to the next
// (happy eyeballs). The database host resolves to several IPv4 and IPv6
// addresses; where a TCP handshake takes longer than that (high-latency links,
// busy CI runners) every IPv4 attempt is abandoned, the IPv6 ones fail on
// hosts without IPv6, and the request fails as "fetch failed" with an
// AggregateError of ETIMEDOUT/ENETUNREACH. Give each address time to answer.
setDefaultAutoSelectFamilyAttemptTimeout(2500);

/**
 * Helper to determine if an error is due to a database connection/timeout failure.
 */
export function isDatabaseConnectionError(error: unknown): boolean {
  if (!error) return false;
  return isDatabaseFailureText(getDatabaseErrorText(error));
}

function getDatabaseErrorText(error: unknown): string {
  if (error instanceof Error) {
    const cause = 'cause' in error ? error.cause : undefined;
    return `${error.message} ${stringifyErrorCause(cause)}`;
  }
  if (typeof error === 'string') return error;
  return stringifyUnknownError(error);
}

function stringifyErrorCause(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'string') return cause;
  return cause ? stringifyUnknownError(cause) : '';
}

function stringifyUnknownError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  try {
    return JSON.stringify(error);
  } catch {
    return '';
  }
}

function isDatabaseFailureText(text: string): boolean {
  const indicators = [
    'connecttimeouterror',
    'und_err_connect_timeout',
    'failed to get session',
    'failed query',
    'fetch failed',
    'econnrefused',
    'econnreset',
    'etimedout',
    'neondberror',
  ];
  const normalized = text.toLowerCase();
  return indicators.some((indicator) => normalized.includes(indicator));
}

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a database client.');
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
