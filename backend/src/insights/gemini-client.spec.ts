import { GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { GeminiClient, GeminiNotConfiguredError } from './gemini-client';

/**
 * `GoogleGenerativeAI` is mocked at the module boundary so these specs never
 * touch the network: `getGenerativeModel` hands back one shared stub whose
 * `generateContent` the tests script per attempt, and records which model was
 * asked for so fallback order can be asserted.
 */
const generateContent = jest.fn();
const requestedModels: string[] = [];

jest.mock('@google/generative-ai', () => {
  const actual = jest.requireActual<typeof import('@google/generative-ai')>(
    '@google/generative-ai',
  );
  return {
    ...actual,
    GoogleGenerativeAI: jest.fn(() => ({
      getGenerativeModel: (params: { model: string }) => {
        requestedModels.push(params.model);
        return { generateContent };
      },
    })),
  };
});

/** Shapes a resolved `generateContent` result the way the SDK does. */
const reply = (text: string) => ({ response: { text: () => text } });

const capacityError = () =>
  new GoogleGenerativeAIFetchError('high demand', 503);

describe('GeminiClient', () => {
  let client: GeminiClient;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    requestedModels.length = 0;
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.GEMINI_MODEL;
    client = new GeminiClient();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('throws GeminiNotConfiguredError when no API key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    client = new GeminiClient();

    await expect(client.generateNarrative('prompt')).rejects.toBeInstanceOf(
      GeminiNotConfiguredError,
    );
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('returns the trimmed text and the model that produced it', async () => {
    generateContent.mockResolvedValue(reply('  An answer.  '));

    await expect(client.generateNarrative('prompt')).resolves.toEqual({
      text: 'An answer.',
      model: 'gemini-3.6-flash',
    });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  /**
   * The bug this chain exists for: a free-tier model can 503 every single call
   * for minutes, which made the stats assistant look permanently broken.
   */
  it('falls back to the next model when one is saturated', async () => {
    generateContent
      .mockRejectedValueOnce(capacityError())
      .mockResolvedValueOnce(reply('Fallback answer.'));

    await expect(client.generateNarrative('prompt')).resolves.toEqual({
      text: 'Fallback answer.',
      model: 'gemini-3.1-flash-lite',
    });
    expect(requestedModels).toEqual([
      'gemini-3.6-flash',
      'gemini-3.1-flash-lite',
    ]);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  /**
   * A model gets exactly one attempt: retrying the same saturated model just
   * burns more of its quota for essentially no chance of success within the
   * span of a single request (a 429 window or a 503 outage both last far
   * longer than an immediate retry).
   */
  it('does not retry the same model — moves to the next one immediately', async () => {
    generateContent
      .mockRejectedValueOnce(
        new GoogleGenerativeAIFetchError('rate limited', 429),
      )
      .mockResolvedValueOnce(reply('Answered by the next model.'));

    await expect(client.generateNarrative('prompt')).resolves.toEqual({
      text: 'Answered by the next model.',
      model: 'gemini-3.1-flash-lite',
    });
    expect(requestedModels).toEqual([
      'gemini-3.6-flash',
      'gemini-3.1-flash-lite',
    ]);
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it('throws the last capacity error once every model is exhausted', async () => {
    generateContent.mockRejectedValue(capacityError());

    await expect(client.generateNarrative('prompt')).rejects.toThrow(
      'high demand',
    );
    // Five models in the default chain, one attempt each.
    expect(generateContent).toHaveBeenCalledTimes(5);
  });

  it('does not retry or fall back on a 400 bad request', async () => {
    generateContent.mockRejectedValue(
      new GoogleGenerativeAIFetchError('bad request', 400),
    );

    await expect(client.generateNarrative('prompt')).rejects.toThrow(
      'bad request',
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('treats an empty response as a hard failure rather than retrying', async () => {
    generateContent.mockResolvedValue(reply('   '));

    await expect(client.generateNarrative('prompt')).rejects.toThrow(
      'empty response',
    );
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('pins to GEMINI_MODEL when it names a single model', async () => {
    process.env.GEMINI_MODEL = 'gemini-3.8-flash';
    client = new GeminiClient();
    generateContent.mockRejectedValue(capacityError());

    await expect(client.generateNarrative('prompt')).rejects.toThrow(
      'high demand',
    );
    expect(requestedModels).toEqual(['gemini-3.8-flash']);
    // Pinned means pinned: no silent fallback to the built-in chain.
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it('uses a comma-separated GEMINI_MODEL as the whole chain', async () => {
    process.env.GEMINI_MODEL = 'model-a, model-b';
    client = new GeminiClient();
    generateContent
      .mockRejectedValueOnce(capacityError())
      .mockResolvedValueOnce(reply('From model-b.'));

    await expect(client.generateNarrative('prompt')).resolves.toEqual({
      text: 'From model-b.',
      model: 'model-b',
    });
    expect(requestedModels).toEqual(['model-a', 'model-b']);
  });
});
