import { neon, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import './environment';
import * as schema from './schema';

/**
 * Resilient fetch wrapper with automatic retry and exponential backoff.
 * Handles transient network timeouts (UND_ERR_CONNECT_TIMEOUT, ConnectTimeoutError, etc.)
 * common on slow connections, mobile data, or when serverless instances cold-start.
 */
async function resilientFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  // Retrying Neon's POST-based SQL requests after an ambiguous network failure
  // can replay writes. Let callers retry idempotent operations explicitly.
  const maxRetries = 1;
  const timeoutMs = 15000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(input, {
        ...init,
        signal: init?.signal ?? controller.signal,
      });
      clearTimeout(timer);
      return response;
    } catch (err: unknown) {
      clearTimeout(timer);
      const isLastAttempt = attempt === maxRetries;
      const isRetryable =
        err instanceof Error &&
        (err.name === 'AbortError' ||
          err.name === 'TimeoutError' ||
          err.message.includes('fetch failed') ||
          err.message.includes('ConnectTimeoutError') ||
          err.message.includes('UND_ERR_CONNECT_TIMEOUT') ||
          err.message.includes('ECONNRESET') ||
          err.message.includes('ETIMEDOUT'));

      if (isLastAttempt || !isRetryable) {
        throw err;
      }

      // Exponential backoff: 300ms, 600ms, 1200ms
      const delay = Math.min(300 * Math.pow(2, attempt - 1), 2000);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error('Database request failed after retries.');
}

// Attach the resilient fetch handler to Neon serverless
neonConfig.fetchFunction = resilientFetch;

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
