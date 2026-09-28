import { FriendlyFixturesService } from './friendly-fixtures.service';

/** Fixture access must be established before any opposing lineup is fetched. */
describe('generated competition opponent lineup access', () => {
  const databaseService = { database: { select: jest.fn() } };
  const teamsService = {};
  const service = new FriendlyFixturesService(
    databaseService as never,
    teamsService as never,
  );

  function selectChain(rows: unknown) {
    const chain: Record<string, unknown> = {
      from: jest.fn(() => chain),
      where: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve),
    };
    return chain;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not expose an opponent when the viewer is outside the fixture', async () => {
    databaseService.database.select
      .mockReturnValueOnce({
        from: () =>
          selectChain([
            {
              id: 'fixture-id',
              competitionId: 'league-id',
              homeCompetitionTeamId: 'home-slot',
              awayCompetitionTeamId: 'away-slot',
            },
          ]),
      })
      .mockReturnValueOnce({
        from: () =>
          selectChain([
            { id: 'home-slot', teamId: 'home-team' },
            { id: 'away-slot', teamId: 'away-team' },
          ]),
      });

    const result = await service.resolveCompetitionOpponentLineup(
      'fixture-id',
      'unrelated-team',
    );
    expect(result).toEqual({
      available: false,
      teamId: null,
      teamName: null,
      players: [],
    });
    expect(databaseService.database.select).toHaveBeenCalledTimes(2);
  });

  it('does not expose a not-yet-linked participant as a Gaffer opponent', async () => {
    databaseService.database.select
      .mockReturnValueOnce({
        from: () =>
          selectChain([
            {
              id: 'fixture-id',
              competitionId: 'league-id',
              homeCompetitionTeamId: 'home-slot',
              awayCompetitionTeamId: 'away-slot',
            },
          ]),
      })
      .mockReturnValueOnce({
        from: () =>
          selectChain([
            { id: 'home-slot', teamId: 'home-team' },
            { id: 'away-slot', teamId: null },
          ]),
      });

    const result = await service.resolveCompetitionOpponentLineup(
      'fixture-id',
      'home-team',
    );
    expect(result.available).toBe(false);
    expect(result.teamId).toBeNull();
    expect(databaseService.database.select).toHaveBeenCalledTimes(2);
  });

  it('rejects an expected opponent that disagrees with the fixture', async () => {
    databaseService.database.select
      .mockReturnValueOnce({
        from: () =>
          selectChain([
            {
              id: 'fixture-id',
              competitionId: 'cup-id',
              homeCompetitionTeamId: 'home-slot',
              awayCompetitionTeamId: 'away-slot',
            },
          ]),
      })
      .mockReturnValueOnce({
        from: () =>
          selectChain([
            { id: 'home-slot', teamId: 'home-team' },
            { id: 'away-slot', teamId: 'away-team' },
          ]),
      });

    const result = await service.resolveCompetitionOpponentLineup(
      'fixture-id',
      'home-team',
      'wrong-team',
    );
    expect(result.available).toBe(false);
    expect(databaseService.database.select).toHaveBeenCalledTimes(2);
  });
});
