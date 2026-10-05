import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  competitionFixtures,
  competitionTeams,
  eventLineups,
  events,
  friendlyFixtures,
  matches,
  teams,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import {
  twoSidedLiveLoggingEnabled,
  ensureFriendlyFixtureSession,
} from '../matches/match-sessions';

export interface IncomingFriendlyFixture {
  id: string;
  requesterTeamId: string;
  requesterTeamName: string;
  eventId: string | null;
  scheduledAt: Date | null;
  location: string | null;
  notes: string | null;
  createdAt: Date;
}

/** One member of the opponent's confirmed squad, shaped like the rows of
 * `GET /matches/:matchId/squad` so the frontend reuses its squad model. */
export interface FriendlyOpponentLineupPlayer {
  id: string;
  firstName: string;
  lastName: string;
  squadNumber: number | null;
  position: string | null;
  started: boolean;
}

/**
 * The opposition lineup shared for an accepted friendly fixture between two
 * Gaffer teams. `available` stays false while the fixture is not accepted
 * or the opponent has not confirmed a squad yet; `teamId`/`teamName` are
 * null when the event is not a Gaffer-friendly at all.
 */
export interface ConfirmedOpponentLineup {
  available: boolean;
  formation: string | null;
  starters: Array<{ name: string; shirtNumber: number | null }>;
  bench: Array<{ name: string; shirtNumber: number | null }>;
}

export interface FriendlyOpponentLineup {
  available: boolean;
  teamId: string | null;
  teamName: string | null;
  players: FriendlyOpponentLineupPlayer[];
  formationId?: string | null;
  pitchAssignments?: Record<string, string | null> | null;
  customPositions?: typeof eventLineups.$inferSelect.customPositions;
  confirmedAt?: Date | null;
}

/** The neutral result for lookups where no shared lineup can exist. */
export function unavailableFriendlyOpponentLineup():
  FriendlyOpponentLineup | ConfirmedOpponentLineup {
  if (twoSidedLiveLoggingEnabled())
    return { available: false, formation: null, starters: [], bench: [] };
  return { available: false, teamId: null, teamName: null, players: [] };
}

/**
 * Friendly-fixture request lifecycle between two Gaffer teams. A coach who
 * schedules a manual match against another Gaffer team creates the request
 * (status 'pending') together with their own event; the opponent coach
 * accepts or declines it from their incoming-requests list.
 *
 * Accepting writes the opponent's own event linked to the same
 * friendly_fixtures row, so both calendars then describe one shared match.
 * Declining leaves the requester with their own event and the opponent with
 * nothing — the fixture is never treated as confirmed before acceptance.
 */
@Injectable()
export class FriendlyFixturesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Pending inbound requests for the coach's own team, oldest proposal
   * first. While pending, only the requester's event exists — that event is
   * joined in so the opponent coach sees the proposed date and location.
   */
  async listIncoming(userId: string): Promise<IncomingFriendlyFixture[]> {
    const team = await this.teamsService.requireCoachTeam(userId);

    return this.databaseService.database
      .select({
        id: friendlyFixtures.id,
        requesterTeamId: friendlyFixtures.requesterTeamId,
        requesterTeamName: teams.name,
        eventId: events.id,
        scheduledAt: events.scheduledAt,
        location: events.location,
        // Event notes belong to the requesting team's private calendar.
        notes: sql<string | null>`NULL`,
        createdAt: friendlyFixtures.createdAt,
      })
      .from(friendlyFixtures)
      .innerJoin(teams, eq(teams.id, friendlyFixtures.requesterTeamId))
      .leftJoin(
        events,
        and(
          eq(events.friendlyFixtureId, friendlyFixtures.id),
          eq(events.teamId, friendlyFixtures.requesterTeamId),
        ),
      )
      .where(
        and(
          eq(friendlyFixtures.opponentTeamId, team.id),
          eq(friendlyFixtures.status, 'pending'),
        ),
      )
      .orderBy(asc(friendlyFixtures.createdAt));
  }

  /**
   * Accepts an inbound request on behalf of the coach's team. The status
   * flip is a conditional update, so when an accept and a decline race only
   * one caller ever wins the transition. The winner then materializes the
   * opponent-side event; if that insert fails the status is reverted so the
   * request stays pending and retryable.
   */
  async accept(userId: string, fixtureId: string) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const fixture = await this.requireIncomingFixture(
      team.id,
      fixtureId,
      'pending',
    );

    const requesterEvent = await this.findRequesterEvent(fixture);
    if (!requesterEvent || requesterEvent.status === 'cancelled') {
      // The requesting team removed or cancelled its event, so there is
      // nothing left to accept — retire the request instead of creating a
      // dangling fixture.
      await this.databaseService.database
        .update(friendlyFixtures)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(
          and(
            eq(friendlyFixtures.id, fixture.id),
            eq(friendlyFixtures.status, 'pending'),
          ),
        );
      throw new NotFoundException(
        'This fixture request is no longer available.',
      );
    }

    const [accepted] = await this.databaseService.database
      .update(friendlyFixtures)
      .set({
        status: 'accepted',
        respondedByUserId: userId,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(friendlyFixtures.id, fixture.id),
          eq(friendlyFixtures.status, 'pending'),
        ),
      )
      .returning();

    if (!accepted) {
      throw new ConflictException(
        'This fixture request is no longer awaiting a response.',
      );
    }

    try {
      // The mirror event is titled with the requesting team's name — from
      // the accepting team's calendar it plays "against" that team.
      const [requesterTeam] = await this.databaseService.database
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, fixture.requesterTeamId))
        .limit(1);

      const [opponentEvent] = await this.databaseService.database
        .insert(events)
        .values({
          teamId: fixture.opponentTeamId,
          title: requesterTeam?.name ?? requesterEvent.title,
          type: 'match',
          status: 'scheduled',
          scheduledAt: requesterEvent.scheduledAt,
          location: requesterEvent.location,
          venueName: requesterEvent.venueName,
          venueAddress: requesterEvent.venueAddress,
          weatherLocation: requesterEvent.weatherLocation,
          weatherLatitude: requesterEvent.weatherLatitude,
          weatherLongitude: requesterEvent.weatherLongitude,
          weatherTimezone: requesterEvent.weatherTimezone,
          notes: null,
          friendlyFixtureId: fixture.id,
        })
        .returning();

      const sharedSessionId = await ensureFriendlyFixtureSession(
        this.databaseService,
        fixture.id,
      );

      return {
        fixture: { ...accepted, sharedSessionId },
        event: opponentEvent,
      };
    } catch (error) {
      // Neon HTTP has no interactive transactions: revert the flip so a
      // failed accept can simply be retried from the requests banner.
      await this.databaseService.database
        .update(friendlyFixtures)
        .set({
          status: 'pending',
          respondedByUserId: null,
          respondedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(friendlyFixtures.id, fixture.id));
      throw error;
    }
  }

  /**
   * The opponent's confirmed squad for a friendly fixture — read live:
   * from the opponent's match (`athlete_match_stats`, the same rows that
   * power their squad view) once it exists, otherwise from their confirmed
   * pre-match lineup (`event_lineups`) so an accepted opponent can share
   * their XI before kickoff; nothing is copied or stored here. The caller
   * passes the team the lookup is made for, and the fixture itself decides
   * which side is the opponent — never request input. When
   * `expectedOpponentTeamId` is given (the match-scoped path) the fixture
   * must independently resolve to that same opponent, so a match row can
   * never point the lookup at an unrelated team.
   */
  async resolveOpponentLineup(
    fixtureId: string,
    ownTeamId: string,
    expectedOpponentTeamId?: string,
  ): Promise<FriendlyOpponentLineup | ConfirmedOpponentLineup> {
    const [fixture] = await this.databaseService.database
      .select()
      .from(friendlyFixtures)
      .where(eq(friendlyFixtures.id, fixtureId))
      .limit(1);

    if (!fixture) {
      return unavailableFriendlyOpponentLineup();
    }

    const opponentTeamId = this.friendlyOpponentTeamIdFor(fixture, ownTeamId);
    if (!opponentTeamId) {
      return unavailableFriendlyOpponentLineup();
    }
    if (expectedOpponentTeamId && expectedOpponentTeamId !== opponentTeamId) {
      return unavailableFriendlyOpponentLineup();
    }

    if (fixture.status !== 'accepted') {
      if (twoSidedLiveLoggingEnabled())
        return unavailableFriendlyOpponentLineup();
      const [opponentTeam] = await this.databaseService.database
        .select({ name: teams.name })
        .from(teams)
        .where(eq(teams.id, opponentTeamId))
        .limit(1);
      return {
        available: false,
        teamId: opponentTeamId,
        teamName: opponentTeam?.name ?? null,
        players: [],
      };
    }
    return this.resolveConfirmedOpponentEvent(opponentTeamId, fixture.id);
  }

  /**
   * Generated league/cup fixtures can share an exact lineup only between
   * their two actual, linked Gaffer teams. Never resolve by display name or
   * accept a caller-supplied opponent ID as proof of fixture membership.
   */
  async resolveCompetitionOpponentLineup(
    fixtureId: string,
    ownTeamId: string,
    expectedOpponentTeamId?: string,
  ): Promise<FriendlyOpponentLineup | ConfirmedOpponentLineup> {
    const [fixture] = await this.databaseService.database
      .select()
      .from(competitionFixtures)
      .where(eq(competitionFixtures.id, fixtureId))
      .limit(1);
    if (!fixture?.homeCompetitionTeamId || !fixture.awayCompetitionTeamId) {
      return unavailableFriendlyOpponentLineup();
    }

    const participants = await this.databaseService.database
      .select({ id: competitionTeams.id, teamId: competitionTeams.teamId })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.competitionId, fixture.competitionId),
          inArray(competitionTeams.id, [
            fixture.homeCompetitionTeamId,
            fixture.awayCompetitionTeamId,
          ]),
        ),
      );
    const ownParticipant = participants.find((row) => row.teamId === ownTeamId);
    if (!ownParticipant) return unavailableFriendlyOpponentLineup();
    const opponentParticipantId =
      ownParticipant.id === fixture.homeCompetitionTeamId
        ? fixture.awayCompetitionTeamId
        : fixture.homeCompetitionTeamId;
    const opponentTeamId = participants.find(
      (row) => row.id === opponentParticipantId,
    )?.teamId;
    if (
      !opponentTeamId ||
      opponentTeamId === ownTeamId ||
      (expectedOpponentTeamId && opponentTeamId !== expectedOpponentTeamId)
    ) {
      return unavailableFriendlyOpponentLineup();
    }

    return this.resolveConfirmedOpponentEvent(opponentTeamId, fixtureId, true);
  }

  /** One shared projection for pre-kickoff snapshots and post-kickoff squad rows. */
  private async resolveLegacyOpponentEvent(
    opponentTeamId: string,
    fixtureId: string,
    competition = false,
  ): Promise<FriendlyOpponentLineup> {
    const [opponentTeam] = await this.databaseService.database
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.id, opponentTeamId))
      .limit(1);

    const base: FriendlyOpponentLineup = {
      available: false,
      teamId: opponentTeamId,
      teamName: opponentTeam?.name ?? null,
      players: [],
    };

    const [opponentEvent] = await this.databaseService.database
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          competition
            ? eq(events.competitionFixtureId, fixtureId)
            : eq(events.friendlyFixtureId, fixtureId),
          eq(events.teamId, opponentTeamId),
        ),
      )
      .limit(1);

    if (!opponentEvent) {
      return base;
    }

    const [opponentMatch] = await this.databaseService.database
      .select({ id: matches.id })
      .from(matches)
      .where(eq(matches.eventId, opponentEvent.id))
      .limit(1);

    if (opponentMatch) {
      const players = await this.databaseService.database
        .select({
          id: athletes.id,
          firstName: athletes.firstName,
          lastName: athletes.lastName,
          squadNumber: athletes.squadNumber,
          position: athletes.position,
          started: athleteMatchStats.started,
        })
        .from(athleteMatchStats)
        .innerJoin(athletes, eq(athleteMatchStats.athleteId, athletes.id))
        .where(eq(athleteMatchStats.matchId, opponentMatch.id))
        .orderBy(
          asc(athletes.squadNumber),
          asc(athletes.lastName),
          asc(athletes.firstName),
        );

      if (players.length > 0) {
        return { ...base, available: true, players };
      }
    }

    // Pre-kickoff fallback: before the opponent starts their match its
    // squad does not exist yet, so their confirmed lineup (event_lineups)
    // is the shared squad. Starting a match retires that record, which
    // keeps the match squad as the single post-kickoff source of truth.
    const [opponentLineup] = await this.databaseService.database
      .select()
      .from(eventLineups)
      .where(eq(eventLineups.eventId, opponentEvent.id))
      .limit(1);

    if (!opponentLineup) {
      return base;
    }

    const lineupAthleteIds = [
      ...new Set([
        ...opponentLineup.startingAthleteIds,
        ...opponentLineup.benchAthleteIds,
      ]),
    ];
    if (lineupAthleteIds.length === 0) {
      return base;
    }

    const lineupAthletes = await this.databaseService.database
      .select({
        id: athletes.id,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        squadNumber: athletes.squadNumber,
        position: athletes.position,
      })
      .from(athletes)
      .where(inArray(athletes.id, lineupAthleteIds))
      .orderBy(
        asc(athletes.squadNumber),
        asc(athletes.lastName),
        asc(athletes.firstName),
      );

    if (lineupAthletes.length === 0) {
      return base;
    }

    const startingIds = new Set(opponentLineup.startingAthleteIds);
    return {
      ...base,
      available: true,
      formationId: opponentLineup.formationId,
      pitchAssignments: opponentLineup.pitchAssignments,
      customPositions: opponentLineup.customPositions,
      confirmedAt: opponentLineup.confirmedAt,
      players: lineupAthletes.map((athlete) => ({
        ...athlete,
        started: startingIds.has(athlete.id),
      })),
    };
  }

  private async resolveConfirmedOpponentEvent(
    opponentTeamId: string,
    fixtureId: string,
    competition = false,
  ): Promise<FriendlyOpponentLineup | ConfirmedOpponentLineup> {
    const legacy = await this.resolveLegacyOpponentEvent(
      opponentTeamId,
      fixtureId,
      competition,
    );
    if (!twoSidedLiveLoggingEnabled()) return legacy;
    const [event] = await this.databaseService.database
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.teamId, opponentTeamId),
          competition
            ? eq(events.competitionFixtureId, fixtureId)
            : eq(events.friendlyFixtureId, fixtureId),
        ),
      )
      .limit(1);
    const [lineup] = event
      ? await this.databaseService.database
          .select()
          .from(eventLineups)
          .where(eq(eventLineups.eventId, event.id))
          .limit(1)
      : [];
    let players = legacy.players;
    if (lineup) {
      const ids = [...lineup.startingAthleteIds, ...lineup.benchAthleteIds];
      const roster = ids.length
        ? await this.databaseService.database
            .select({
              id: athletes.id,
              firstName: athletes.firstName,
              lastName: athletes.lastName,
              squadNumber: athletes.squadNumber,
              position: athletes.position,
            })
            .from(athletes)
            .where(
              and(
                eq(athletes.teamId, opponentTeamId),
                inArray(athletes.id, ids),
              ),
            )
        : [];
      players = roster.map((athlete) => ({
        ...athlete,
        started: lineup.startingAthleteIds.includes(athlete.id),
      }));
    }
    const toPlayer = (player: FriendlyOpponentLineupPlayer) => ({
      name: (player.firstName + ' ' + player.lastName).trim(),
      shirtNumber: player.squadNumber,
    });
    players.sort(
      (a, b) =>
        (a.squadNumber ?? 999) - (b.squadNumber ?? 999) ||
        a.lastName.localeCompare(b.lastName) ||
        a.firstName.localeCompare(b.firstName),
    );
    return {
      available: Boolean(lineup) || legacy.available,
      formation: lineup?.formationId ?? null,
      starters: players.filter((player) => player.started).map(toPlayer),
      bench: players.filter((player) => !player.started).map(toPlayer),
    };
  }

  /** The other team on a friendly fixture, from `teamId`'s perspective. */
  private friendlyOpponentTeamIdFor(
    fixture: typeof friendlyFixtures.$inferSelect,
    teamId: string,
  ): string | null {
    if (fixture.requesterTeamId === teamId) {
      return fixture.opponentTeamId;
    }
    if (fixture.opponentTeamId === teamId) {
      return fixture.requesterTeamId;
    }
    return null;
  }

  /** Declines an inbound request; the requester's own event is left alone. */
  async decline(userId: string, fixtureId: string) {
    const team = await this.teamsService.requireCoachTeam(userId);
    const fixture = await this.requireIncomingFixture(
      team.id,
      fixtureId,
      'pending',
    );

    const [declined] = await this.databaseService.database
      .update(friendlyFixtures)
      .set({
        status: 'declined',
        respondedByUserId: userId,
        respondedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(friendlyFixtures.id, fixture.id),
          eq(friendlyFixtures.status, 'pending'),
        ),
      )
      .returning();

    if (!declined) {
      throw new ConflictException(
        'This fixture request is no longer awaiting a response.',
      );
    }

    return declined;
  }

  /**
   * Loads a fixture the caller's team is the opponent of. A fixture that is
   * not addressed to this team is an identical 404 with no existence leak.
   */
  private async requireIncomingFixture(
    teamId: string,
    fixtureId: string,
    expectedStatus: (typeof friendlyFixtures.status.enumValues)[number],
  ) {
    const [fixture] = await this.databaseService.database
      .select()
      .from(friendlyFixtures)
      .where(
        and(
          eq(friendlyFixtures.id, fixtureId),
          eq(friendlyFixtures.opponentTeamId, teamId),
        ),
      )
      .limit(1);

    if (!fixture) {
      throw new NotFoundException('Fixture request not found.');
    }

    if (fixture.status !== expectedStatus) {
      throw new ConflictException(
        'This fixture request is no longer awaiting a response.',
      );
    }

    return fixture;
  }

  private async findRequesterEvent(
    fixture: typeof friendlyFixtures.$inferSelect,
  ) {
    const [event] = await this.databaseService.database
      .select()
      .from(events)
      .where(
        and(
          eq(events.friendlyFixtureId, fixture.id),
          eq(events.teamId, fixture.requesterTeamId),
        ),
      )
      .limit(1);

    return event ?? null;
  }
}
