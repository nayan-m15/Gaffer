import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AthletesService } from '../athletes/athletes.service';
import { DatabaseService } from '../database/database.service';
import { eventRsvps } from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { EventsService } from './events.service';

const team = { id: 'team-id', name: 'Test Team', role: 'coach' as const };

const teamEvent = {
  id: 'event-id',
  teamId: 'team-id',
  title: 'Cup final',
};

describe('EventsService', () => {
  let service: EventsService;

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
  };

  const mockAthletesService = {
    findClaimedAthleteOnTeam: jest.fn(),
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
    jest.clearAllMocks();

    mockTeamsService.findTeamForUser.mockResolvedValue(team);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: TeamsService, useValue: mockTeamsService },
        { provide: AthletesService, useValue: mockAthletesService },
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
