import { Injectable, Logger } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

/** Thrown when GEMINI_API_KEY is unset — insight generation is disabled. */
export class GeminiNotConfiguredError extends Error {
  constructor() {
    super('GEMINI_API_KEY not set — insight generation is disabled.');
    this.name = 'GeminiNotConfiguredError';
  }
}

const DEFAULT_MODEL = 'gemini-3.8-flash';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Thin wrapper around the Gemini free-tier API, mirroring `email.ts`'s
 * lazily-created, env-var-gated client: absent `GEMINI_API_KEY` disables the
 * feature rather than throwing at startup, so local dev/test needs no real
 * credentials.
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

  async generateNarrative(prompt: string): Promise<string> {
    const client = this.getClient();
    if (!client) throw new GeminiNotConfiguredError();

    const modelName = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
    const model = client.getGenerativeModel({ model: modelName });

    const result = await model.generateContent(prompt, {
      timeout: REQUEST_TIMEOUT_MS,
    });

    const text = result.response.text().trim();
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return text;
  }

  /** Test-only hook to reset the memoized client between specs. */
  __resetForTests(): void {
    this.client = undefined;
  }
}
