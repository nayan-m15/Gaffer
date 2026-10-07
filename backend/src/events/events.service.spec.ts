import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AthletesService } from '../athletes/athletes.service';
import { DatabaseService } from '../database/database.service';
import { eventLineups, eventRsvps } from '../database/schema';
import { FriendlyFixturesService } from '../friendly-fixtures/friendly-fixtures.service';
import { TeamsService } from '../teams/teams.service';
import { EventsService } from './events.service';

const team = { id: 'team-id', name: 'Test Team', role: 'coach' as const };

const teamEvent = {
  id: 'event-id',
  teamId: 'team-id',
  title: 'Cup final',
  status: 'scheduled',
  scheduledAt: new Date('2099-10-10T15:00:00Z'),
};

describe('EventsService', () => {
  let service: EventsService;
  let previousTwoSidedFlag: string | undefined;

  afterEach(() => {
    if (previousTwoSidedFlag === undefined) {
      delete process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    } else {
      process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = previousTwoSidedFlag;
    }
  });

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
  };

  const mockAthletesService = {
    findClaimedAthleteOnTeam: jest.fn(),
  };

  const mockFriendlyFixturesService = {
    resolveOpponentLineup: jest.fn(),
    resolveCompetitionOpponentLineup: jest.fn(),
  };

  /**
   * Creates a thenable query-chain stub. Drizzle query builders are
   * awaitable (they expose `.then`), so every chained method returns the
   * same object and `await` resolves to `result`.
   */
  function selectChain(result: unknown) {
    const chain: Record<string, unknown> = {
      from: jest.fn(() => chain),
      innerJoin: jest.fn(() => chain),
      leftJoin: jest.fn(() => chain),
      where: jest.fn(() => chain),
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(result).then(resolve),
    };
    return chain;
  }

  /** Stubs an insert ... on conflict do update ... returning chain. */
  function upsertChain(result: unknown) {
    const onConflictDoUpdate = jest.fn().mockReturnValue({
      returning: jest.fn().mockResolvedValue([result]),
    });
    const values = jest.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = jest.fn().mockReturnValue({ values });
    return { insert, values, onConflictDoUpdate };
  }

  const mockDatabaseService = {
    database: {} as Record<string, unknown>,
  };

  beforeEach(async () => {
    previousTwoSidedFlag = process.env.TWO_SIDED_LIVE_LOGGING_ENABLED;
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    jest.clearAllMocks();

    mockTeamsService.findTeamForUser.mockResolvedValue(team);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: AthletesService, useValue: mockAthletesService },
        {
          provide: FriendlyFixturesService,
          useValue: mockFriendlyFixturesService,
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('accepts a shared competition linked through competition-team membership', async () => {
      const membershipQuery = selectChain([{ id: 'competition-id' }]);
      const returning = jest.fn().mockResolvedValue([
        {
          id: 'event-id',
          teamId: team.id,
          type: 'match',
          competitionId: 'competition-id',
        },
      ]);
      const values = jest.fn().mockReturnValue({ returning });
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(membershipQuery),
        insert: jest.fn().mockReturnValue({ values }),
      };

      const result = await service.create('user-id', {
        title: 'League match',
        type: 'match',
        scheduledAt: '2026-10-10T15:00:00.000Z',
        location: 'Home Ground',
        competitionId: 'competition-id',
      });

      expect(result).toEqual(
        expect.objectContaining({ competitionId: 'competition-id' }),
      );
      expect(membershipQuery.innerJoin).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it('scopes the shared team query to the coach own team', async () => {
      const listForTeam = jest
        .spyOn(service, 'listForTeam')
        .mockResolvedValue([]);

      await service.list('user-id');

      expect(mockTeamsService.findTeamForUser).toHaveBeenCalledWith('user-id');
      expect(listForTeam).toHaveBeenCalledWith('team-id');
    });
  });

  describe('findRsvpsForAthlete', () => {
    it('queries all RSVP rows for the athlete', async () => {
      const chain = selectChain([{ id: 'rsvp-id' }]);
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(chain),
      };

      const result = await service.findRsvpsForAthlete('athlete-id');

      expect(result).toEqual([{ id: 'rsvp-id' }]);
      expect(chain.from).toHaveBeenCalledWith(eventRsvps);
    });
  });

  describe('rsvp', () => {
    it('records the caller RSVP for their claimed athlete on the event team', async () => {
      const rsvpRow = {
        id: 'rsvp-id',
        eventId: 'event-id',
        athleteId: 'athlete-id',
        status: 'going',
      };
      const upsert = upsertChain(rsvpRow);
      mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue({
        id: 'athlete-id',
      });
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(selectChain([teamEvent])),
        insert: upsert.insert,
      };

      const result = await service.rsvp('user-id', 'event-id', {
        status: 'going',
      });

      expect(result).toBe(rsvpRow);
      // The athlete is resolved against the event's own team, so a
      // multi-team player RSVPs as the right athlete.
      expect(mockAthletesService.findClaimedAthleteOnTeam).toHaveBeenCalledWith(
        'user-id',
        'team-id',
      );
      expect(upsert.values).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'event-id',
          athleteId: 'athlete-id',
          status: 'going',
        }),
      );
    });

    it('upserts: a second RSVP from the same athlete updates the existing row instead of inserting a new one', async () => {
      const rsvpRow = {
        id: 'rsvp-id',
        eventId: 'event-id',
        athleteId: 'athlete-id',
        status: 'going',
      };
      const upsert = upsertChain(rsvpRow);
      mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue({
        id: 'athlete-id',
      });
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(selectChain([teamEvent])),
        insert: upsert.insert,
      };

      await service.rsvp('user-id', 'event-id', { status: 'going' });
      await service.rsvp('user-id', 'event-id', {
        status: 'not_going',
        note: 'Injured',
      });

      // Both responses route through the same insert ... on conflict do
      // update statement targeting the (eventId, athleteId) unique index,
      // which is what makes the second response an UPDATE of the first
      // row rather than a second row.
      expect(upsert.insert).toHaveBeenCalledTimes(2);
      expect(upsert.onConflictDoUpdate).toHaveBeenCalledTimes(2);
      expect(upsert.onConflictDoUpdate).toHaveBeenLastCalledWith({
        target: [eventRsvps.eventId, eventRsvps.athleteId],
        set: expect.objectContaining({
          status: 'not_going',
          note: 'Injured',
          respondedAt: expect.any(Date) as Date,
          updatedAt: expect.any(Date) as Date,
        }) as Record<string, unknown>,
      });
    });

    it('rejects an RSVP on an event from a previous day', async () => {
      mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue({
        id: 'athlete-id',
      });
      const insert = jest.fn();
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValue(
            selectChain([
              { ...teamEvent, scheduledAt: new Date('2020-01-01T12:00:00Z') },
            ]),
          ),
        insert,
      };
      await expect(
        service.rsvp('user-id', 'event-id', { status: 'going' }),
      ).rejects.toThrow(ConflictException);
      expect(insert).not.toHaveBeenCalled();
    });

    it.each(['cancelled', 'completed'])(
      'rejects a %s event even when its date is in the future',
      async (status) => {
        mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue({
          id: 'athlete-id',
        });
        const insert = jest.fn();
        mockDatabaseService.database = {
          select: jest
            .fn()
            .mockReturnValue(selectChain([{ ...teamEvent, status }])),
          insert,
        };
        await expect(
          service.rsvp('user-id', 'event-id', { status: 'maybe' }),
        ).rejects.toThrow(ConflictException);
        expect(insert).not.toHaveBeenCalled();
      },
    );

    it('closes at the exact start time, including on the same day', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-09-29T17:00:00Z'));
      try {
        mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue({
          id: 'athlete-id',
        });
        const insert = jest.fn();
        mockDatabaseService.database = {
          select: jest
            .fn()
            .mockReturnValue(
              selectChain([
                { ...teamEvent, scheduledAt: new Date('2026-09-29T17:00:00Z') },
              ]),
            ),
          insert,
        };
        await expect(
          service.rsvp('user-id', 'event-id', { status: 'going' }),
        ).rejects.toThrow(ConflictException);
        expect(insert).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('reopens RSVP when a scheduled event is moved into the future', async () => {
      mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue({
        id: 'athlete-id',
      });
      const upsert = upsertChain({ status: 'maybe' });
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValue(
            selectChain([
              { ...teamEvent, scheduledAt: new Date('2099-12-01T12:00:00Z') },
            ]),
          ),
        insert: upsert.insert,
      };
      await expect(
        service.rsvp('user-id', 'event-id', { status: 'maybe' }),
      ).resolves.toEqual({ status: 'maybe' });
      expect(upsert.insert).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundException for an unknown event', async () => {
      const insert = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(selectChain([])),
        insert,
      };

      await expect(
        service.rsvp('user-id', 'event-id', { status: 'going' }),
      ).rejects.toThrow('Event not found.');
      expect(insert).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller has no claimed athlete on the event team', async () => {
      mockAthletesService.findClaimedAthleteOnTeam.mockResolvedValue(null);
      const insert = jest.fn();
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(selectChain([teamEvent])),
        insert,
      };

      await expect(
        service.rsvp('user-id', 'event-id', { status: 'going' }),
      ).rejects.toThrow('No claimed player profile on this team.');
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe('listRsvps', () => {
    it('returns the roster with each athlete RSVP status', async () => {
      const roster = [
        {
          id: 'athlete-1',
          firstName: 'Alex',
          lastName: 'Morgan',
          rsvpStatus: 'going',
          rsvpNote: null,
          rsvpRespondedAt: new Date('2026-01-01T10:00:00Z'),
        },
        {
          id: 'athlete-2',
          rsvpStatus: null,
          rsvpNote: null,
          rsvpRespondedAt: null,
        },
      ];
      const rosterChain = selectChain(roster);
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(selectChain([teamEvent])) // requireEvent
          .mockReturnValueOnce(rosterChain), // roster + rsvps join
      };

      const result = await service.listRsvps('user-id', 'event-id');

      expect(result).toEqual(roster);
      expect(rosterChain.from).toHaveBeenCalled();
      expect(rosterChain.leftJoin).toHaveBeenCalled();
    });

    it('throws ForbiddenException when the caller has no team', async () => {
      mockTeamsService.findTeamForUser.mockResolvedValue(null);

      await expect(service.listRsvps('user-id', 'event-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("throws NotFoundException when the event is not on the caller's team", async () => {
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValueOnce(selectChain([])),
      };

      await expect(service.listRsvps('user-id', 'event-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when the event is not on the team', async () => {
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(selectChain([])),
      };

      await expect(service.findOne('user-id', 'event-id')).rejects.toThrow(
        'Event not found.',
      );
    });
  });

  describe('getFriendlyOpponentLineup', () => {
    it('returns the neutral unavailable shape for events without a friendly fixture', async () => {
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(selectChain([teamEvent])),
      };

      const result = await service.getFriendlyOpponentLineup(
        'user-id',
        'event-id',
      );

      expect(result).toEqual({
        available: false,
        teamId: null,
        teamName: null,
        players: [],
      });
      expect(
        mockFriendlyFixturesService.resolveOpponentLineup,
      ).not.toHaveBeenCalled();
    });

    it('resolves a generated competition fixture by fixture ID and own team', async () => {
      const resolved = {
        available: true,
        teamId: 'linked-opponent-team',
        teamName: 'Linked opponent',
        players: [],
      };
      mockFriendlyFixturesService.resolveCompetitionOpponentLineup.mockResolvedValue(
        resolved,
      );
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(
          selectChain([
            {
              ...teamEvent,
              competitionId: 'competition-id',
              competitionFixtureId: 'fixture-id',
              friendlyFixtureId: null,
            },
          ]),
        ),
      };
      const result = await service.getFriendlyOpponentLineup(
        'user-id',
        'event-id',
      );
      expect(result).toBe(resolved);
      expect(
        mockFriendlyFixturesService.resolveCompetitionOpponentLineup,
      ).toHaveBeenCalledWith('fixture-id', 'team-id');
      expect(
        mockFriendlyFixturesService.resolveOpponentLineup,
      ).not.toHaveBeenCalled();
    });

    it('delegates to the friendly fixture resolver scoped to the caller team', async () => {
      const resolved = {
        available: true,
        teamId: 'opponent-team-id',
        teamName: 'Opponent FC',
        players: [],
      };
      mockFriendlyFixturesService.resolveOpponentLineup.mockResolvedValue(
        resolved,
      );
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValue(
            selectChain([{ ...teamEvent, friendlyFixtureId: 'fixture-id' }]),
          ),
      };

      const result = await service.getFriendlyOpponentLineup(
        'user-id',
        'event-id',
      );

      expect(result).toBe(resolved);
      expect(
        mockFriendlyFixturesService.resolveOpponentLineup,
      ).toHaveBeenCalledWith('fixture-id', 'team-id');
    });
  });

  describe('confirmLineup', () => {
    const startingAthleteIds = Array.from(
      { length: 11 },
      (_, index) => `athlete-${String(index).padStart(2, '0')}`,
    );

    it('rejects non-match events with a 404', async () => {
      const insert = jest.fn();
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValue(
            selectChain([
              { ...teamEvent, type: 'training', status: 'scheduled' },
            ]),
          ),
        insert,
      };

      await expect(
        service.confirmLineup('user-id', 'event-id', { startingAthleteIds }),
      ).rejects.toThrow('Event not found.');
      expect(insert).not.toHaveBeenCalled();
    });

    it('rejects non-scheduled matches', async () => {
      const insert = jest.fn();
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValue(
            selectChain([{ ...teamEvent, type: 'match', status: 'cancelled' }]),
          ),
        insert,
      };

      await expect(
        service.confirmLineup('user-id', 'event-id', { startingAthleteIds }),
      ).rejects.toThrow('Only scheduled matches can have a confirmed lineup.');
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses to overwrite the squad of an already-started match', async () => {
      const insert = jest.fn();
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(
            selectChain([{ ...teamEvent, type: 'match', status: 'scheduled' }]),
          )
          .mockReturnValueOnce(selectChain([{ id: 'match-id' }])),
        insert,
      };

      await expect(
        service.confirmLineup('user-id', 'event-id', { startingAthleteIds }),
      ).rejects.toThrow('This match has already started');
      expect(insert).not.toHaveBeenCalled();
    });

    it('saves the pre-match lineup and returns the confirmation', async () => {
      const confirmedAt = new Date('2026-09-20T10:00:00Z');
      const lineupRow = {
        id: 'lineup-id',
        eventId: 'event-id',
        teamId: 'team-id',
        startingAthleteIds,
        benchAthleteIds: [],
        confirmedByUserId: 'user-id',
        confirmedAt,
      };
      const upsert = upsertChain(lineupRow);
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(
            selectChain([{ ...teamEvent, type: 'match', status: 'scheduled' }]),
          ) // requireEvent
          .mockReturnValueOnce(selectChain([])) // no existing match
          .mockReturnValueOnce(
            selectChain(
              startingAthleteIds.map((id) => ({ id, status: 'active' })),
            ),
          ), // team athletes
        insert: upsert.insert,
      };

      const result = await service.confirmLineup('user-id', 'event-id', {
        startingAthleteIds,
      });

      expect(result).toEqual({
        startingAthleteIds,
        benchAthleteIds: [],
        confirmedAt,
      });
      expect(upsert.onConflictDoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          target: eventLineups.eventId,
          set: expect.objectContaining({
            startingAthleteIds,
            benchAthleteIds: [],
          }) as Record<string, unknown>,
        }),
      );
    });
  });

  describe('getLineup', () => {
    it('returns null when the team has not confirmed a lineup', async () => {
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(selectChain([teamEvent]))
          .mockReturnValueOnce(selectChain([])),
      };

      await expect(
        service.getLineup('user-id', 'event-id'),
      ).resolves.toBeNull();
    });

    it('returns the stored confirmation for the team', async () => {
      const confirmedAt = new Date('2026-09-20T10:00:00Z');
      mockDatabaseService.database = {
        select: jest
          .fn()
          .mockReturnValueOnce(selectChain([teamEvent]))
          .mockReturnValueOnce(
            selectChain([
              {
                id: 'lineup-id',
                startingAthleteIds: ['athlete-1'],
                benchAthleteIds: ['athlete-2'],
                confirmedAt,
              },
            ]),
          ),
      };

      await expect(service.getLineup('user-id', 'event-id')).resolves.toEqual({
        startingAthleteIds: ['athlete-1'],
        benchAthleteIds: ['athlete-2'],
        confirmedAt,
      });
    });
  });

  describe('update', () => {
    it('edits the venue address independently from forecast coordinates', async () => {
      const setEvent = jest.fn();
      const eventUpdate = {
        set: setEvent.mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([{ id: 'event-id' }]),
          }),
        }),
      };
      const matchUpdate = {
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockResolvedValue(undefined),
        }),
      };
      mockDatabaseService.database = {
        select: jest.fn().mockReturnValue(
          selectChain([
            {
              ...teamEvent,
              type: 'training',
              competitionId: null,
            },
          ]),
        ),
        update: jest
          .fn()
          .mockReturnValueOnce(eventUpdate)
          .mockReturnValueOnce(matchUpdate),
      };

      await service.update('user-id', 'event-id', {
        venueAddress: '12 River Road',
        weatherLocation: 'Stellenbosch, South Africa',
        weatherLatitude: -33.9321,
        weatherLongitude: 18.8602,
        weatherTimezone: 'Africa/Johannesburg',
      });

      expect(setEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          venueAddress: '12 River Road',
          weatherLocation: 'Stellenbosch, South Africa',
          weatherLatitude: -33.9321,
          weatherLongitude: 18.8602,
          weatherTimezone: 'Africa/Johannesburg',
        }),
      );
    });
  });
});
