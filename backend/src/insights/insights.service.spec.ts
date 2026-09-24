import { Test, TestingModule } from '@nestjs/testing';
import { GoogleGenerativeAIFetchError } from '@google/generative-ai';
import { DatabaseService } from '../database/database.service';
import { SeasonsService } from '../seasons/seasons.service';
import { GeminiClient, GeminiNotConfiguredError } from './gemini-client';
import { InsightsService } from './insights.service';

/**
 * Creates a thenable query-chain stub. Drizzle query builders are awaitable
 * (they expose `.then`), so every chained method returns the same object and
 * `await` resolves to `result`.
 */
function thenable(result: unknown) {
  const obj: Record<string, unknown> = {};
  obj.from = jest.fn(() => obj);
  obj.innerJoin = jest.fn(() => obj);
  obj.leftJoin = jest.fn(() => obj);
  obj.where = jest.fn(() => obj);
  obj.groupBy = jest.fn(() => obj);
  obj.orderBy = jest.fn(() => obj);
  obj.limit = jest.fn(() => obj);
  obj.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return obj;
}

describe('InsightsService', () => {
  let service: InsightsService;

  const mockGeminiClient = {
    generateNarrative: jest.fn(),
  };

  const selectResults: unknown[][] = [];
  const insertValuesSpy = jest.fn();
  const onConflictDoUpdateSpy = jest.fn();

  const mockDatabaseService = {
    database: {
      select: jest.fn(() => {
        const next = selectResults.shift() ?? [];
        return thenable(next);
      }),
      insert: jest.fn(() => ({
        values: (values: unknown) => {
          insertValuesSpy(values);
          return { onConflictDoUpdate: onConflictDoUpdateSpy };
        },
      })),
      update: jest.fn(() => ({
        set: jest.fn(() => ({ where: jest.fn(() => Promise.resolve([])) })),
      })),
    },
  };

  const mockSeasonsService = { resolveSeasonWindow: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: GeminiClient, useValue: mockGeminiClient },
        { provide: SeasonsService, useValue: mockSeasonsService },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
    jest.clearAllMocks();
    selectResults.length = 0;
  });

  /** Queues the seven `select` calls `loadContext` + digest-check issue, in order. */
  function queueGenerationSelects(overrides?: {
    matchRow?: Record<string, unknown>;
    existingInsight?: Record<string, unknown> | null;
  }) {
    const matchRow = overrides?.matchRow ?? {
      opponentName: 'City',
      isHome: true,
      competitionId: null,
      teamScore: 2,
      opponentScore: 1,
      eventDate: new Date('2025-09-14T14:00:00.000Z'),
      teamId: 'team-1',
      teamName: 'Rovers',
    };
    selectResults.push([matchRow]); // match/team/event row
    selectResults.push([]); // match events
    selectResults.push([]); // per-athlete performance
    selectResults.push([]); // team matches (season trends)
    selectResults.push(
      overrides?.existingInsight === undefined
        ? []
        : overrides.existingInsight
          ? [overrides.existingInsight]
          : [],
    ); // existing insight digest check
  }

  describe('generateForMatch', () => {
    it('writes a ready insight on success', async () => {
      queueGenerationSelects();
      mockGeminiClient.generateNarrative.mockResolvedValue(
        'Rovers won 2-1 against City.',
      );

      await service.generateForMatch('match-1', { projectionRevision: 3 });

      expect(mockGeminiClient.generateNarrative).toHaveBeenCalledTimes(1);
      expect(insertValuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          matchId: 'match-1',
          status: 'ready',
          narrativeText: 'Rovers won 2-1 against City.',
          projectionRevision: 3,
        }),
      );
      expect(onConflictDoUpdateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          set: expect.objectContaining({ status: 'ready' }),
        }),
      );
    });

    it('writes a failed insight without throwing when Gemini is not configured', async () => {
      queueGenerationSelects();
      mockGeminiClient.generateNarrative.mockRejectedValue(
        new GeminiNotConfiguredError(),
      );

      await expect(
        service.generateForMatch('match-1', { projectionRevision: 1 }),
      ).resolves.toBeUndefined();

      expect(insertValuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ matchId: 'match-1', status: 'failed' }),
      );
    });

    it('writes a failed insight without throwing when Gemini call errors', async () => {
      queueGenerationSelects();
      mockGeminiClient.generateNarrative.mockRejectedValue(
        new Error('Gemini provider returned 429.'),
      );

      await expect(
        service.generateForMatch('match-1', { projectionRevision: 1 }),
      ).resolves.toBeUndefined();

      expect(insertValuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          failureReason: 'Gemini provider returned 429.',
        }),
      );
      // A failed attempt never overwrites narrativeText via this write path.
      expect(insertValuesSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({ narrativeText: expect.anything() }),
      );
    });

    it('stores a sanitized player-of-the-match pick alongside the narrative', async () => {
      selectResults.push([
        {
          opponentName: 'City',
          isHome: true,
          competitionId: null,
          teamScore: 2,
          opponentScore: 1,
          eventDate: new Date('2025-09-14T14:00:00.000Z'),
          teamId: 'team-1',
          teamName: 'Rovers',
        },
      ]); // match/team/event row
      selectResults.push([]); // match events
      selectResults.push([
        { firstName: 'Sam', lastName: 'Rivers', goals: 1, assists: 0, yellowCards: 0, redCards: 0 },
      ]); // per-athlete performance
      selectResults.push([]); // team matches (season trends)
      selectResults.push([]); // existing insight digest check
      mockGeminiClient.generateNarrative.mockResolvedValue(
        'SUMMARY: Rovers won 2-1.\nPLAYER_OF_THE_MATCH: Sam Rivers - scored the winner.',
      );

      await service.generateForMatch('match-1', { projectionRevision: 1 });

      expect(insertValuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          narrativeText: 'Rovers won 2-1.',
          highlights: {
            playerOfTheMatch: {
              athleteName: 'Sam Rivers',
              reason: 'scored the winner.',
            },
          },
        }),
      );
    });

    it('drops a player-of-the-match pick that names an unknown player', async () => {
      selectResults.push([
        {
          opponentName: 'City',
          isHome: true,
          competitionId: null,
          teamScore: 2,
          opponentScore: 1,
          eventDate: new Date('2025-09-14T14:00:00.000Z'),
          teamId: 'team-1',
          teamName: 'Rovers',
        },
      ]);
      selectResults.push([]); // match events
      selectResults.push([]); // per-athlete performance — nobody scored/carded
      selectResults.push([]); // team matches
      selectResults.push([]); // existing insight digest check
      mockGeminiClient.generateNarrative.mockResolvedValue(
        'SUMMARY: A quiet win.\nPLAYER_OF_THE_MATCH: Someone Invented - played well.',
      );

      await service.generateForMatch('match-1', { projectionRevision: 1 });

      expect(insertValuesSpy).toHaveBeenCalledWith(
        expect.objectContaining({ highlights: null }),
      );
    });

    it('skips calling Gemini when the input digest matches the last ready run', async () => {
      // Compute the digest the same way loadContext + buildInsightPrompt will,
      // by running once to observe the payload, then reusing it as "existing".
      queueGenerationSelects();
      mockGeminiClient.generateNarrative.mockResolvedValue('First summary.');
      await service.generateForMatch('match-1', { projectionRevision: 1 });
      const firstDigest = (insertValuesSpy.mock.calls[0][0] as {
        inputDigest: string;
      }).inputDigest;

      jest.clearAllMocks();
      selectResults.length = 0;
      queueGenerationSelects({
        existingInsight: { status: 'ready', inputDigest: firstDigest },
      });

      await service.generateForMatch('match-1', { projectionRevision: 1 });

      expect(mockGeminiClient.generateNarrative).not.toHaveBeenCalled();
      expect(insertValuesSpy).not.toHaveBeenCalled();
    });
  });

  describe('answerQuestion', () => {
    it('returns a ready answer on success', async () => {
      mockGeminiClient.generateNarrative.mockResolvedValue('Sam Rivers, with 5 goals.');

      const result = await service.answerQuestion('Who scored the most?');

      expect(result).toEqual({
        status: 'ready',
        answer: 'Sam Rivers, with 5 goals.',
      });
    });

    it('returns a failed status without throwing when Gemini errors', async () => {
      mockGeminiClient.generateNarrative.mockRejectedValue(
        new Error('Gemini provider returned 429.'),
      );

      const result = await service.answerQuestion('Who scored the most?');

      expect(result).toEqual({ status: 'failed', answer: null });
      expect(mockGeminiClient.generateNarrative).toHaveBeenCalledTimes(1);
    });

    it('retries once after a short delay on a 503 and succeeds', async () => {
      jest.useFakeTimers();
      mockGeminiClient.generateNarrative
        .mockRejectedValueOnce(
          new GoogleGenerativeAIFetchError('high demand', 503),
        )
        .mockResolvedValueOnce('Second attempt answer.');

      const promise = service.answerQuestion('Who scored the most?');
      await jest.advanceTimersByTimeAsync(1_000);
      const result = await promise;

      expect(result).toEqual({
        status: 'ready',
        answer: 'Second attempt answer.',
      });
      expect(mockGeminiClient.generateNarrative).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('gives up as failed if the retry also 503s', async () => {
      jest.useFakeTimers();
      mockGeminiClient.generateNarrative.mockRejectedValue(
        new GoogleGenerativeAIFetchError('high demand', 503),
      );

      const promise = service.answerQuestion('Who scored the most?');
      await jest.advanceTimersByTimeAsync(1_000);
      const result = await promise;

      expect(result).toEqual({ status: 'failed', answer: null });
      expect(mockGeminiClient.generateNarrative).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('does not retry a non-503 error', async () => {
      mockGeminiClient.generateNarrative.mockRejectedValue(
        new GoogleGenerativeAIFetchError('bad request', 400),
      );

      const result = await service.answerQuestion('Who scored the most?');

      expect(result).toEqual({ status: 'failed', answer: null });
      expect(mockGeminiClient.generateNarrative).toHaveBeenCalledTimes(1);
    });

    it('does not write to the database', async () => {
      mockGeminiClient.generateNarrative.mockResolvedValue('An answer.');

      await service.answerQuestion('Who scored the most?');

      expect(mockDatabaseService.database.insert).not.toHaveBeenCalled();
      expect(mockDatabaseService.database.update).not.toHaveBeenCalled();
    });
  });
});

describe('InsightsService — season insights', () => {
  let service: InsightsService;

  const mockGeminiClient = { generateNarrative: jest.fn() };
  const mockSeasonsService = { resolveSeasonWindow: jest.fn() };
  const selectResults: unknown[][] = [];
  const insertValuesSpy = jest.fn();
  const updateSetSpy = jest.fn();

  const mockDatabaseService = {
    database: {
      select: jest.fn(() => thenable(selectResults.shift() ?? [])),
      insert: jest.fn(() => ({
        values: (values: unknown) => {
          insertValuesSpy(values);
          return {
            returning: () =>
              Promise.resolve([
                { id: 'season-insight-1', ...(values as object) },
              ]),
          };
        },
      })),
      update: jest.fn(() => ({
        set: (setValues: unknown) => {
          updateSetSpy(setValues);
          return {
            where: () => ({
              returning: () =>
                Promise.resolve([
                  { id: 'season-insight-1', ...(setValues as object) },
                ]),
            }),
          };
        },
      })),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: GeminiClient, useValue: mockGeminiClient },
        { provide: SeasonsService, useValue: mockSeasonsService },
      ],
    }).compile();

    service = module.get<InsightsService>(InsightsService);
    jest.clearAllMocks();
    selectResults.length = 0;
  });

  /** Queues the four `select` calls `runSeasonGeneration` issues, in order. */
  function queueSeasonGenerationSelects(overrides?: {
    existing?: Record<string, unknown> | null;
  }) {
    selectResults.push([]); // loadTeamMatches
    selectResults.push([{ name: 'Rovers' }]); // team name
    selectResults.push([]); // loadTopPlayers
    selectResults.push(overrides?.existing ? [overrides.existing] : []); // findSeasonInsightRow digest check
  }

  it('generates a ready season insight for the all-time overview', async () => {
    queueSeasonGenerationSelects();
    mockGeminiClient.generateNarrative.mockResolvedValue('Solid season overall.');

    const result = await service.generateSeasonInsight('team-1', null, 'user-1');

    expect(result.status).toBe('ready');
    expect(result.narrativeText).toBe('Solid season overall.');
    expect(mockSeasonsService.resolveSeasonWindow).not.toHaveBeenCalled();
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        seasonId: null,
        status: 'ready',
      }),
    );
  });

  it('resolves the season window when a seasonId is given', async () => {
    mockSeasonsService.resolveSeasonWindow.mockResolvedValue({
      season: { id: 'season-1', name: '2025/26' },
      window: {
        start: new Date('2025-08-01T00:00:00.000Z'),
        end: new Date('2026-05-31T23:59:59.999Z'),
      },
    });
    queueSeasonGenerationSelects();
    mockGeminiClient.generateNarrative.mockResolvedValue('Good season.');

    await service.generateSeasonInsight('team-1', 'season-1', 'user-1');

    expect(mockSeasonsService.resolveSeasonWindow).toHaveBeenCalledWith(
      'team-1',
      'season-1',
    );
    expect(insertValuesSpy).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: 'season-1' }),
    );
  });

  it('returns a failed summary without throwing when Gemini errors', async () => {
    queueSeasonGenerationSelects();
    mockGeminiClient.generateNarrative.mockRejectedValue(
      new Error('Gemini provider returned 429.'),
    );
    selectResults.push([]); // findSeasonInsightRow inside markSeasonFailed

    const result = await service.generateSeasonInsight('team-1', null, 'user-1');

    expect(result.status).toBe('failed');
    expect(result.failureReason).toBe('Gemini provider returned 429.');
  });

  it('skips calling Gemini when the input digest matches the last ready run', async () => {
    queueSeasonGenerationSelects();
    mockGeminiClient.generateNarrative.mockResolvedValue('First season summary.');
    const first = await service.generateSeasonInsight('team-1', null, 'user-1');
    const firstDigest = (
      insertValuesSpy.mock.calls[0][0] as { inputDigest: string }
    ).inputDigest;

    jest.clearAllMocks();
    selectResults.length = 0;
    queueSeasonGenerationSelects({
      existing: {
        id: 'season-insight-1',
        teamId: 'team-1',
        seasonId: null,
        status: 'ready',
        narrativeText: first.narrativeText,
        generatedAt: new Date(),
        failureReason: null,
        inputDigest: firstDigest,
        attemptCount: 1,
      },
    });

    const second = await service.generateSeasonInsight('team-1', null, 'user-1');

    expect(mockGeminiClient.generateNarrative).not.toHaveBeenCalled();
    expect(insertValuesSpy).not.toHaveBeenCalled();
    expect(updateSetSpy).not.toHaveBeenCalled();
    expect(second.status).toBe('ready');
  });
});
