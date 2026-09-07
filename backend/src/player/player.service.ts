import { ForbiddenException, Injectable } from '@nestjs/common';
import { AthletesService } from '../athletes/athletes.service';
import { EventsService } from '../events/events.service';
import { StatisticsService } from '../statistics/statistics.service';

/**
 * Read-only, player-scoped data: everything resolves through the athlete
 * record the current user claimed, never through a coach's owned team.
 */
@Injectable()
export class PlayerService {
  constructor(
    private readonly athletesService: AthletesService,
    private readonly eventsService: EventsService,
    private readonly statisticsService: StatisticsService,
  ) {}

  /** The claimed athlete's own record plus their aggregated season stats. */
  async getMe(userId: string, athleteId?: string) {
    const athlete = await this.requireClaimedAthlete(userId, athleteId);
    return this.statisticsService.aggregateAthleteStatistics(athlete);
  }

  /** The claimed athlete's team roster, read-only. */
  async getTeam(userId: string, athleteId?: string) {
    const athlete = await this.requireClaimedAthlete(userId, athleteId);
    return this.athletesService.findAll(athlete.teamId);
  }

  /**
   * The team's events, each annotated with the player's own RSVP status
   * (null when they haven't responded).
   */
  async listEvents(userId: string, athleteId?: string) {
    const athlete = await this.requireClaimedAthlete(userId, athleteId);

    const [teamEvents, rsvps] = await Promise.all([
      this.eventsService.listForTeam(athlete.teamId),
      this.eventsService.findRsvpsForAthlete(athlete.id),
    ]);

    const rsvpByEventId = new Map(rsvps.map((rsvp) => [rsvp.eventId, rsvp]));

    return teamEvents.map((event) => ({
      ...event,
      rsvpStatus: rsvpByEventId.get(event.id)?.status ?? null,
      rsvpNote: rsvpByEventId.get(event.id)?.note ?? null,
    }));
  }

  /** League/cup standings for the claimed athlete's team. */
  async getStandings(userId: string, athleteId?: string) {
    const athlete = await this.requireClaimedAthlete(userId, athleteId);
    return this.statisticsService.getCompetitionsForTeam(athlete.teamId);
  }

  /**
   * Mirrors the team resolution in AthletesController.getTeamId /
   * EventsService.requireTeam, but resolves the athlete the current user
   * claimed instead of a coach's owned team. `athleteId` disambiguates when
   * the user has claimed athletes on more than one team.
   */
  private async requireClaimedAthlete(userId: string, athleteId?: string) {
    const athlete = await this.athletesService.findClaimedAthleteForUser(
      userId,
      athleteId,
    );

    if (!athlete) {
      throw new ForbiddenException('No claimed player profile.');
    }

    return athlete;
  }
}
