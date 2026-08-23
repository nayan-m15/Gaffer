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
  const maxRetries = 3;
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
  let message = '';
  let cause = '';

  if (error instanceof Error) {
    message = error.message;
    if ('cause' in error && error.cause) {
      cause =
        error.cause instanceof Error
          ? error.cause.message
          : typeof error.cause === 'string'
            ? error.cause
            : JSON.stringify(error.cause);
    }
  } else if (typeof error === 'string') {
    message = error;
  } else if (typeof error === 'object') {
    try {
      message = JSON.stringify(error);
    } catch {
      message = '';
    }
  }

  const str = `${message} ${cause}`.toLowerCase();

  return (
    str.includes('connecttimeouterror') ||
    str.includes('und_err_connect_timeout') ||
    str.includes('failed to get session') ||
    str.includes('failed query') ||
    str.includes('fetch failed') ||
    str.includes('econnrefused') ||
    str.includes('econnreset') ||
    str.includes('etimedout') ||
    str.includes('neondberror')
  );
}

export function createDatabaseClient(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to create a database client.');
  }

  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
