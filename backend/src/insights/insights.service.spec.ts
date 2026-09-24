import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InsightsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: GeminiClient, useValue: mockGeminiClient },
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
});
