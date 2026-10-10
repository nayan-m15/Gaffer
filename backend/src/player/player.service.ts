import { ForbiddenException, Injectable } from '@nestjs/common';
import { AthletesService } from '../athletes/athletes.service';
import { EventsService } from '../events/events.service';
import { StatisticsService } from '../statistics/statistics.service';

/** Athlete availability status, mirroring the `athlete_status` enum. */
export type PlayerRosterStatus = 'available' | 'injured' | 'suspended';

/**
 * The player-facing roster contract for `GET /player/team`: exactly the
 * fields the read-only roster UI renders. Deliberately excludes the raw
 * athlete row's `dateOfBirth` (age is derived server-side), `userId`,
 * internal timestamps, `archivedAt`, `teamId` and `claimStatus`.
 */
export interface PlayerRosterEntry {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
  status: PlayerRosterStatus;
  /** Years since the athlete's date of birth, or null when unknown. */
  age: number | null;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}

/**
 * Age in whole years from an ISO `YYYY-MM-DD` date of birth, evaluated in
 * UTC so the result does not shift with the server's timezone. Null for a
 * missing date of birth.
 */
function ageFrom(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) {
    return null;
  }

  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && now.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }

  return age;
}

/**
 * Projects one raw `AthletesService.findAll` row onto the player-facing
 * contract. Explicit field-by-field — never spread the database row, so a
 * new athlete column cannot leak into the player response unnoticed.
 */
function toPlayerRosterEntry(row: {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
  status: PlayerRosterStatus;
  dateOfBirth: string | null;
  appearances: number;
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
}): PlayerRosterEntry {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    position: row.position,
    squadNumber: row.squadNumber,
    status: row.status,
    age: ageFrom(row.dateOfBirth),
    appearances: row.appearances,
    goals: row.goals,
    assists: row.assists,
    yellowCards: row.yellowCards,
    redCards: row.redCards,
  };
}

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

  /**
   * The claimed athlete's team roster, read-only. Returns the explicit
   * player-facing projection — never the raw athlete rows, which carry
   * teammates' dates of birth, account linkage and internal timestamps.
   */
  async getTeam(
    userId: string,
    athleteId?: string,
  ): Promise<PlayerRosterEntry[]> {
    const athlete = await this.requireClaimedAthlete(userId, athleteId);
    const roster = await this.athletesService.findAll(athlete.teamId);
    return roster.map(toPlayerRosterEntry);
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
