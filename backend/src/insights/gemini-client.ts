import { Injectable, Logger } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  GoogleGenerativeAIFetchError,
} from '@google/generative-ai';

/** Thrown when GEMINI_API_KEY is unset — insight generation is disabled. */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY not set — insight generation is disabled.');
    this.name = 'GeminiNotConfiguredError';
  }
}

/**
 * Models tried in order, most capable first. The free tier hands out per-model
 * capacity, so a model can 503 ("currently experiencing high demand") for
 * minutes at a time while its siblings answer instantly — falling back keeps
 * the feature working instead of failing every request until Google's load
 * drops. Override with `GEMINI_MODEL` (a single name, or a comma-separated
 * chain to replace this list wholesale).
 */
const DEFAULT_MODEL_CHAIN = [
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

/** Generous enough for the long season/match prompts, which run several seconds. */
const REQUEST_TIMEOUT_MS = 30_000;
const ATTEMPTS_PER_MODEL = 2;
const RETRY_BASE_DELAY_MS = 500;

/** A narrative plus the model that actually produced it (not necessarily the
 * configured first choice — see `DEFAULT_MODEL_CHAIN`). */
export interface GeminiNarrative {
  text: string;
  model: string;
}

/**
 * Transient provider-side failures: free-tier capacity 503s, rate limits, and
 * generic upstream 5xxs. Anything else (400 malformed request, 403 bad key,
 * 404 unknown model) is a real problem with the request that retrying or
 * swapping models will not fix, so it propagates immediately.
 */
function isTransientGeminiError(error: unknown): boolean {
  return (
    error instanceof GoogleGenerativeAIFetchError &&
    (error.status === 429 ||
      (error.status !== undefined && error.status >= 500))
  );
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Thin wrapper around the Gemini free-tier API, mirroring `email.ts`'s
 * lazily-created, env-var-gated client: absent `GEMINI_API_KEY` disables the
 * feature rather than throwing at startup, so local dev/test needs no real
 * credentials.
 *
 * Retrying and model fallback live here rather than in callers so every
 * feature (per-match insights, season summaries, the stats assistant) gets
 * the same resilience against the free tier's frequent capacity 503s.
 */
@Injectable()
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);
  private client: GoogleGenerativeAI | null | undefined;

  private getClient(): GoogleGenerativeAI | null {
    if (this.client === undefined) {
      const apiKey = process.env.GEMINI_API_KEY;
      this.client = apiKey ? new GoogleGenerativeAI(apiKey) : null;
    }
    return this.client;
  }

  private getModelChain(): string[] {
    const configured = (process.env.GEMINI_MODEL ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    return configured.length > 0 ? configured : DEFAULT_MODEL_CHAIN;
  }

  /**
   * Generates text, walking the model chain until one answers. Throws the last
   * transient error if every model is saturated, or the original error
   * straight away for a non-transient failure.
   */
  async generateNarrative(prompt: string): Promise<GeminiNarrative> {
    const client = this.getClient();
    if (!client) throw new GeminiNotConfiguredError();

    const chain = this.getModelChain();
    let lastError: unknown;

    for (const modelName of chain) {
      const model = client.getGenerativeModel({ model: modelName });

      for (let attempt = 1; attempt <= ATTEMPTS_PER_MODEL; attempt++) {
        try {
          const result = await model.generateContent(prompt, {
            timeout: REQUEST_TIMEOUT_MS,
          });
          const text = result.response.text().trim();
          if (!text) {
            throw new Error(
              `Gemini (${modelName}) returned an empty response.`,
            );
          }
          if (modelName !== chain[0]) {
            this.logger.log(
              `Answered with fallback model ${modelName} (${chain[0]} unavailable).`,
            );
          }
          return { text, model: modelName };
        } catch (error) {
          if (!isTransientGeminiError(error)) throw error;
          lastError = error;
          if (attempt < ATTEMPTS_PER_MODEL) {
            await delay(RETRY_BASE_DELAY_MS * attempt);
          }
        }
      }

      this.logger.warn(
        `Model ${modelName} unavailable after ${ATTEMPTS_PER_MODEL} attempts; trying the next one.`,
      );
    }

    throw lastError;
  }

  /** Test-only hook to reset the memoized client between specs. */
  __resetForTests(): void {
    this.client = undefined;
  }
}
