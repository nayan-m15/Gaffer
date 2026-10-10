import { ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { validateFixtureResult } from './competition-fixture-results';

const HOME = 'home-team';
const AWAY = 'away-team';
const COMPETITION = 'competition-1';

/**
 * Every statement this module issues is `select()...` and awaited, so the
 * stub hands each call the next queued result in order.
 */
function databaseReturning(results: unknown[][]) {
  let call = 0;
  const select = jest.fn(() => {
    const result = results[call] ?? [];
    call += 1;
    const chain: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy', 'limit', 'innerJoin']) {
      chain[method] = jest.fn(() => chain);
    }
    chain.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve);
    return chain;
  });
  return {
    service: { database: { select } } as unknown as DatabaseService,
    select,
  };
}

const fixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'fixture-1',
  competitionId: COMPETITION,
  stage: 'league',
  round: 1,
  position: 1,
  status: 'scheduled',
  homeCompetitionTeamId: HOME,
  awayCompetitionTeamId: AWAY,
  homeScore: null,
  awayScore: null,
  winnerCompetitionTeamId: null,
  linkedMatchId: null,
  legacyResultId: null,
  sharedSessionId: null,
  nextFixtureId: null,
  ...overrides,
});

const manual = (id = 'result-1') => ({ kind: 'manual' as const, id });
const live = (id = 'match-1', sessionId?: string) => ({
  kind: 'live' as const,
  id,
  sessionId,
});

const score = (homeScore: number, awayScore: number) => ({
  homeCompetitionTeamId: HOME,
  awayCompetitionTeamId: AWAY,
  homeScore,
  awayScore,
});

describe('validateFixtureResult', () => {
  it('leaves legacy competitions without generated fixtures alone', async () => {
    const { service } = databaseReturning([[]]);

    await expect(
      validateFixtureResult(service, COMPETITION, manual(), score(1, 0)),
    ).resolves.toBeNull();
  });

  it('matches a scheduled fixture by its two teams', async () => {
    const row = fixture();
    const { service } = databaseReturning([[row], [{ format: 'league' }]]);

    await expect(
      validateFixtureResult(service, COMPETITION, manual(), score(2, 1)),
    ).resolves.toEqual(row);
  });

  it('matches an already-linked fixture by its manual result id', async () => {
    const row = fixture({ status: 'completed', legacyResultId: 'result-1' });
    const { service } = databaseReturning([[row], [{ format: 'league' }]]);

    await expect(
      validateFixtureResult(
        service,
        COMPETITION,
        manual('result-1'),
        score(3, 1),
      ),
    ).resolves.toEqual(row);
  });

  it('rejects a result that matches no available fixture', async () => {
    const { service } = databaseReturning([
      [fixture({ homeCompetitionTeamId: 'someone-else' })],
    ]);

    await expect(
      validateFixtureResult(service, COMPETITION, manual(), score(1, 0)),
    ).rejects.toThrow('does not match an available generated fixture');
  });

  it('refuses to change the teams on a linked fixture', async () => {
    const row = fixture({
      legacyResultId: 'result-1',
      awayCompetitionTeamId: 'original-away',
    });
    const { service } = databaseReturning([[row]]);

    await expect(
      validateFixtureResult(
        service,
        COMPETITION,
        manual('result-1'),
        score(1, 0),
      ),
    ).rejects.toThrow('Teams cannot be changed');
  });

  it('rejects a second, unrelated result for a fixture that already has one', async () => {
    // Still "scheduled" so it is matched by teams, but a score is already
    // recorded against it from a different source.
    const row = fixture({ homeScore: 2, awayScore: 1 });
    const { service } = databaseReturning([[row]]);

    await expect(
      validateFixtureResult(
        service,
        COMPETITION,
        manual('result-1'),
        score(1, 0),
      ),
    ).rejects.toThrow(ConflictException);
  });

  describe('shared live sessions', () => {
    it('requires a live source for a fixture bound to a shared session', async () => {
      const { service } = databaseReturning([
        [fixture({ sharedSessionId: 'session-1' })],
      ]);

      await expect(
        validateFixtureResult(service, COMPETITION, manual(), score(1, 0)),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('requires the live source to carry a session id', async () => {
      const { service } = databaseReturning([
        [fixture({ sharedSessionId: 'session-1' })],
      ]);

      await expect(
        validateFixtureResult(
          service,
          COMPETITION,
          live('match-1'),
          score(1, 0),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects a live result from a different session', async () => {
      const { service } = databaseReturning([
        [fixture({ sharedSessionId: 'session-1' })],
      ]);

      await expect(
        validateFixtureResult(
          service,
          COMPETITION,
          live('match-1', 'session-2'),
          score(1, 0),
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('accepts the live result from the fixture’s own session', async () => {
      const row = fixture({ sharedSessionId: 'session-1' });
      const { service } = databaseReturning([[row], [{ format: 'league' }]]);

      await expect(
        validateFixtureResult(
          service,
          COMPETITION,
          live('match-1', 'session-1'),
          score(1, 0),
        ),
      ).resolves.toEqual(row);
    });
  });

  describe('knockout rules', () => {
    it('requires a winner for a knockout fixture', async () => {
      const { service } = databaseReturning([[fixture({ stage: 'knockout' })]]);

      await expect(
        validateFixtureResult(service, COMPETITION, manual(), score(1, 1)),
      ).rejects.toThrow('Knockout fixtures require a winner');
    });

    it('accepts a decisive knockout result', async () => {
      const row = fixture({ stage: 'knockout' });
      const { service } = databaseReturning([[row], [{ format: 'knockout' }]]);

      await expect(
        validateFixtureResult(service, COMPETITION, manual(), score(2, 1)),
      ).resolves.toEqual(row);
    });

    it('awards the win to the away side when they score more', async () => {
      const row = fixture({ stage: 'knockout' });
      const { service } = databaseReturning([[row], [{ format: 'knockout' }]]);

      await expect(
        validateFixtureResult(service, COMPETITION, manual(), score(0, 3)),
      ).resolves.toEqual(row);
    });

    it('blocks changing a winner once the next match has started', async () => {
      const row = fixture({
        stage: 'knockout',
        status: 'completed',
        legacyResultId: 'result-1',
        winnerCompetitionTeamId: HOME,
        nextFixtureId: 'fixture-2',
      });
      const { service } = databaseReturning([
        [row],
        [{ format: 'knockout' }],
        [fixture({ id: 'fixture-2', status: 'completed' })],
      ]);

      await expect(
        validateFixtureResult(
          service,
          COMPETITION,
          manual('result-1'),
          score(0, 2),
        ),
      ).rejects.toThrow('next knockout match has already started');
    });

    it('allows changing a winner while the next match is untouched', async () => {
      const row = fixture({
        stage: 'knockout',
        status: 'completed',
        legacyResultId: 'result-1',
        winnerCompetitionTeamId: HOME,
        nextFixtureId: 'fixture-2',
      });
      const { service } = databaseReturning([
        [row],
        [{ format: 'knockout' }],
        [fixture({ id: 'fixture-2' })],
      ]);

      await expect(
        validateFixtureResult(
          service,
          COMPETITION,
          manual('result-1'),
          score(0, 2),
        ),
      ).resolves.toEqual(row);
    });

    it('does not probe the next match when the winner is unchanged', async () => {
      const row = fixture({
        stage: 'knockout',
        status: 'completed',
        legacyResultId: 'result-1',
        winnerCompetitionTeamId: HOME,
        nextFixtureId: 'fixture-2',
      });
      const { service, select } = databaseReturning([
        [row],
        [{ format: 'knockout' }],
      ]);

      await validateFixtureResult(
        service,
        COMPETITION,
        manual('result-1'),
        score(3, 1),
      );

      // Fixture list and competition format only.
      expect(select).toHaveBeenCalledTimes(2);
    });
  });

  describe('hybrid league_knockout competitions', () => {
    it('freezes league results once the knockout stage exists', async () => {
      const row = fixture({ status: 'completed', legacyResultId: 'result-1' });
      const { service } = databaseReturning([
        [row],
        [{ format: 'league_knockout' }],
        [{ id: 'knockout-1' }],
      ]);

      await expect(
        validateFixtureResult(
          service,
          COMPETITION,
          manual('result-1'),
          score(1, 0),
        ),
      ).rejects.toThrow('League-phase results cannot change');
    });

    it('allows league results while no knockout stage exists yet', async () => {
      const row = fixture();
      const { service } = databaseReturning([
        [row],
        [{ format: 'league_knockout' }],
        [],
      ]);

      await expect(
        validateFixtureResult(service, COMPETITION, manual(), score(1, 0)),
      ).resolves.toEqual(row);
    });

    it('does not consult the knockout stage for a plain league', async () => {
      const { service, select } = databaseReturning([
        [fixture()],
        [{ format: 'league' }],
      ]);

      await validateFixtureResult(service, COMPETITION, manual(), score(1, 0));

      expect(select).toHaveBeenCalledTimes(2);
    });

    it('tolerates a competition row that cannot be read', async () => {
      const row = fixture();
      const { service } = databaseReturning([[row], []]);

      await expect(
        validateFixtureResult(service, COMPETITION, manual(), score(1, 0)),
      ).resolves.toEqual(row);
    });
  });
});
