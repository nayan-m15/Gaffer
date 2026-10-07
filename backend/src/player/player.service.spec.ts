import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AthletesService } from '../athletes/athletes.service';
import { EventsService } from '../events/events.service';
import { StatisticsService } from '../statistics/statistics.service';
import { PlayerService } from './player.service';

const claimedAthlete = {
  id: 'athlete-id',
  teamId: 'team-id',
  firstName: 'Alex',
  lastName: 'Morgan',
  position: 'ST',
  squadNumber: 9,
};

/**
 * A raw `AthletesService.findAll` row: every athlete column plus the
 * computed claimStatus and statistics. Carrying the sensitive fields here
 * proves the player projection drops them rather than never seeing them.
 */
function rawRosterRow(overrides = {}) {
  return {
    id: 'athlete-id',
    teamId: 'team-id',
    firstName: 'Alex',
    lastName: 'Morgan',
    dateOfBirth: '2001-06-15',
    position: 'ST',
    squadNumber: 9,
    status: 'available',
    archivedAt: null,
    userId: 'another-user-id',
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-02-01T00:00:00Z'),
    claimStatus: 'unclaimed',
    appearances: 12,
    goals: 5,
    assists: 3,
    yellowCards: 1,
    redCards: 0,
    ...overrides,
  };
}

describe('PlayerService', () => {
  let service: PlayerService;

  const mockAthletesService = {
    findClaimedAthleteForUser: jest.fn(),
    findAll: jest.fn(),
  };

  const mockEventsService = {
    listForTeam: jest.fn(),
    findRsvpsForAthlete: jest.fn(),
  };

  const mockStatisticsService = {
    aggregateAthleteStatistics: jest.fn(),
    getCompetitionsForTeam: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockAthletesService.findClaimedAthleteForUser.mockResolvedValue(
      claimedAthlete,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlayerService,
        { provide: AthletesService, useValue: mockAthletesService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: StatisticsService, useValue: mockStatisticsService },
      ],
    }).compile();

    service = module.get<PlayerService>(PlayerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('requireClaimedAthlete', () => {
    it('rejects with ForbiddenException when the user has no claimed profile', async () => {
      mockAthletesService.findClaimedAthleteForUser.mockResolvedValue(null);

      await expect(service.getMe('user-id')).rejects.toThrow(
        'No claimed player profile.',
      );
      await expect(service.getTeam('user-id')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.listEvents('user-id')).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getStandings('user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('passes the optional athleteId through to disambiguate multi-team claims', async () => {
      mockStatisticsService.aggregateAthleteStatistics.mockResolvedValue({});
      await service.getMe('user-id', 'other-athlete-id');

      expect(
        mockAthletesService.findClaimedAthleteForUser,
      ).toHaveBeenCalledWith('user-id', 'other-athlete-id');
    });
  });

  describe('getMe', () => {
    it('returns the claimed athlete record with aggregated stats', async () => {
      const stats = { athleteId: 'athlete-id', goals: 12, appearances: 20 };
      mockStatisticsService.aggregateAthleteStatistics.mockResolvedValue(stats);

      const result = await service.getMe('user-id');

      expect(
        mockStatisticsService.aggregateAthleteStatistics,
      ).toHaveBeenCalledWith(claimedAthlete);
      expect(result).toBe(stats);
    });
  });

  describe('getTeam', () => {
    it('returns only the player-facing roster fields — exact contract', async () => {
      mockAthletesService.findAll.mockResolvedValue([rawRosterRow()]);

      const result = await service.getTeam('user-id');

      // Exact key assertion: any field added to (or removed from) the
      // player-facing contract fails this test, so a sensitive database
      // column can never re-enter the response unnoticed.
      expect(Object.keys(result[0]).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'position',
          'squadNumber',
          'status',
          'age',
          'appearances',
          'goals',
          'assists',
          'yellowCards',
          'redCards',
        ].sort(),
      );
      expect(result[0]).toEqual({
        id: 'athlete-id',
        firstName: 'Alex',
        lastName: 'Morgan',
        position: 'ST',
        squadNumber: 9,
        status: 'available',
        age: expect.any(Number) as number,
        appearances: 12,
        goals: 5,
        assists: 3,
        yellowCards: 1,
        redCards: 0,
      });
    });

    it('omits sensitive and internal fields present on the raw row', async () => {
      mockAthletesService.findAll.mockResolvedValue([rawRosterRow()]);

      const [entry] = await service.getTeam('user-id');

      expect(entry).not.toHaveProperty('dateOfBirth');
      expect(entry).not.toHaveProperty('userId');
      expect(entry).not.toHaveProperty('createdAt');
      expect(entry).not.toHaveProperty('updatedAt');
      expect(entry).not.toHaveProperty('archivedAt');
      expect(entry).not.toHaveProperty('teamId');
      expect(entry).not.toHaveProperty('claimStatus');
    });

    it('derives age server-side from the date of birth instead of exposing it', async () => {
      // Birth dates relative to "now" keep the expectations exact on any
      // future run date, including the birthday-not-yet-reached edge.
      // Calendar arithmetic (not 365-day multiples) avoids leap-year drift.
      const isoUtc = (date: Date) => date.toISOString().slice(0, 10);
      const birthDateYearsAgo = (years: number, dayOffset: number) => {
        const date = new Date();
        date.setUTCFullYear(date.getUTCFullYear() - years);
        date.setUTCDate(date.getUTCDate() + dayOffset);
        return isoUtc(date);
      };

      mockAthletesService.findAll.mockResolvedValue([
        // 16th birthday already passed → 16.
        rawRosterRow({
          id: 'had-birthday',
          dateOfBirth: birthDateYearsAgo(16, -1),
        }),
        // 16th birthday not yet reached → 15.
        rawRosterRow({ id: 'not-yet', dateOfBirth: birthDateYearsAgo(16, 1) }),
        rawRosterRow({ id: 'unknown-dob', dateOfBirth: null }),
      ]);

      const result = await service.getTeam('user-id');

      // The exact date of birth never leaves the server — only whole years.
      expect(result[0].age).toBe(16);
      expect(result[1].age).toBe(15);
      expect(result[2].age).toBeNull();
    });

    it('scopes the roster to the claimed athlete own team', async () => {
      mockAthletesService.findAll.mockResolvedValue([]);

      await service.getTeam('user-id', 'claimed-athlete-id');

      // The roster is always read through the claimed athlete's team — a
      // caller can never point it at another team's players.
      expect(
        mockAthletesService.findClaimedAthleteForUser,
      ).toHaveBeenCalledWith('user-id', 'claimed-athlete-id');
      expect(mockAthletesService.findAll).toHaveBeenCalledWith('team-id');
    });
  });

  describe('listEvents', () => {
    it('annotates each team event with the player own RSVP status', async () => {
      const teamEvents = [
        { id: 'event-1', title: 'Training' },
        { id: 'event-2', title: 'Cup final' },
      ];
      mockEventsService.listForTeam.mockResolvedValue(teamEvents);
      mockEventsService.findRsvpsForAthlete.mockResolvedValue([
        {
          eventId: 'event-2',
          athleteId: 'athlete-id',
          status: 'going',
          note: 'See you there',
        },
      ]);

      const result = await service.listEvents('user-id');

      expect(mockEventsService.listForTeam).toHaveBeenCalledWith('team-id');
      expect(mockEventsService.findRsvpsForAthlete).toHaveBeenCalledWith(
        'athlete-id',
      );
      expect(result).toEqual([
        { id: 'event-1', title: 'Training', rsvpStatus: null, rsvpNote: null },
        {
          id: 'event-2',
          title: 'Cup final',
          rsvpStatus: 'going',
          rsvpNote: 'See you there',
        },
      ]);
    });

    it('annotates unresponded events with null status', async () => {
      mockEventsService.listForTeam.mockResolvedValue([{ id: 'event-1' }]);
      mockEventsService.findRsvpsForAthlete.mockResolvedValue([]);

      const result = await service.listEvents('user-id');

      expect(result).toEqual([
        { id: 'event-1', rsvpStatus: null, rsvpNote: null },
      ]);
    });
  });

  describe('getStandings', () => {
    it('returns standings for the claimed athlete team competitions', async () => {
      const standings = [{ id: 'competition-1', name: 'League' }];
      mockStatisticsService.getCompetitionsForTeam.mockResolvedValue(standings);

      const result = await service.getStandings('user-id');

      expect(mockStatisticsService.getCompetitionsForTeam).toHaveBeenCalledWith(
        'team-id',
      );
      expect(result).toBe(standings);
    });
  });
});
