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
    it('returns the claimed athlete team roster, read-only', async () => {
      const roster = [{ id: 'athlete-id', claimStatus: 'claimed' }];
      mockAthletesService.findAll.mockResolvedValue(roster);

      const result = await service.getTeam('user-id');

      expect(mockAthletesService.findAll).toHaveBeenCalledWith('team-id');
      expect(result).toBe(roster);
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
