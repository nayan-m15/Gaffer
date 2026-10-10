import { FriendlyFixturesService } from './friendly-fixtures.service';

/** Fixture access must be established before any opposing lineup is fetched. */
describe('opponent lineup access and public projection', () => {
  let previousTwoSidedFlag: string | undefined;

  afterEach(() => {
    if (previousTwoSidedFlag === undefined) {
      delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    } else {
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousTwoSidedFlag;
    }
  });
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
    previousTwoSidedFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    jest.restoreAllMocks();
    databaseService.database.select.mockReset();
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
  type ProjectionService = {
    resolveLegacyOpponentEvent: (...args: unknown[]) => Promise<unknown>;
    resolveConfirmedOpponentEvent: (...args: unknown[]) => Promise<unknown>;
  };
  const projectionService = service as unknown as ProjectionService;
  const athlete = {
    id: 'private-athlete',
    firstName: 'Public',
    lastName: 'Starter',
    squadNumber: null,
    position: 'PRIVATE POSITION',
    started: true,
  };

  it('projects exact confirmed starter slots and only public custom coordinates', async () => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    jest
      .spyOn(projectionService, 'resolveLegacyOpponentEvent')
      .mockResolvedValue({
        available: true,
        teamId: 'away',
        teamName: 'Visitors',
        players: [athlete],
      });
    databaseService.database.select
      .mockReturnValueOnce(selectChain([{ id: 'exact-fixture-event' }]))
      .mockReturnValueOnce(
        selectChain([
          {
            formationId: 'custom-5',
            startingAthleteIds: [athlete.id],
            benchAthleteIds: ['private-bench'],
            pitchAssignments: {
              'custom-5-gk': athlete.id,
              'custom-5-st': 'not-a-starter',
            },
            customPositions: [
              {
                id: 'custom-5-gk',
                label: 'GK',
                x: 23,
                y: 88,
                role: 'GK',
                notes: 'PRIVATE NOTE',
                gamePlanId: 'PRIVATE PLAN',
              },
            ],
            notes: 'PRIVATE TACTICS',
          },
        ]),
      )
      .mockReturnValueOnce(
        selectChain([
          athlete,
          {
            ...athlete,
            id: 'private-bench',
            firstName: 'Bench',
            squadNumber: 20,
          },
        ]),
      );
    const result = await projectionService.resolveConfirmedOpponentEvent(
      'away',
      'exact-fixture',
      true,
    );
    expect(result).toEqual({
      available: true,
      source: 'confirmed',
      formation: 'custom-5',
      customPositions: [{ id: 'custom-5-gk', label: 'GK', x: 23, y: 88 }],
      starters: [
        { name: 'Public Starter', shirtNumber: null, slotId: 'custom-5-gk' },
      ],
      bench: [{ name: 'Bench Starter', shirtNumber: 20 }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /PRIVATE|private-athlete|private-bench|not-a-starter/,
    );
    expect(projectionService.resolveLegacyOpponentEvent).not.toHaveBeenCalled();
  });

  it('labels an exact-fixture squad fallback with unknown formation', async () => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    jest
      .spyOn(projectionService, 'resolveLegacyOpponentEvent')
      .mockResolvedValue({
        available: true,
        teamId: 'away',
        teamName: 'Visitors',
        players: [athlete],
      });
    databaseService.database.select
      .mockReturnValueOnce(selectChain([{ id: 'exact-fixture-event' }]))
      .mockReturnValueOnce(selectChain([]));
    expect(
      await projectionService.resolveConfirmedOpponentEvent(
        'away',
        'exact-fixture',
      ),
    ).toEqual({
      available: true,
      source: 'squad',
      formation: null,
      starters: [{ name: 'Public Starter', shirtNumber: null }],
      bench: [],
    });
  });

  it('does not invent pitch positions when a confirmed snapshot has no slot assignments', async () => {
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
    jest
      .spyOn(projectionService, 'resolveLegacyOpponentEvent')
      .mockResolvedValue({
        available: false,
        teamId: 'away',
        teamName: 'Visitors',
        players: [],
      });
    databaseService.database.select
      .mockReturnValueOnce(selectChain([{ id: 'exact-fixture-event' }]))
      .mockReturnValueOnce(
        selectChain([
          {
            formationId: '4-3-3',
            startingAthleteIds: [athlete.id],
            benchAthleteIds: [],
            pitchAssignments: null,
          },
        ]),
      )
      .mockReturnValueOnce(selectChain([athlete]));
    expect(
      await projectionService.resolveConfirmedOpponentEvent(
        'away',
        'exact-fixture',
      ),
    ).toEqual({
      available: true,
      source: 'confirmed',
      formation: '4-3-3',
      starters: [{ name: 'Public Starter', shirtNumber: null, slotId: null }],
      bench: [],
    });
  });
});
