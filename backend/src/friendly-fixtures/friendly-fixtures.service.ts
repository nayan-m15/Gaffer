import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { events, friendlyFixtures, teams } from '../database/schema';
import { TeamsService } from '../teams/teams.service';

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
        notes: events.notes,
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
          venueAddress: requesterEvent.venueAddress,
          weatherLocation: requesterEvent.weatherLocation,
          weatherLatitude: requesterEvent.weatherLatitude,
          weatherLongitude: requesterEvent.weatherLongitude,
          weatherTimezone: requesterEvent.weatherTimezone,
          notes: requesterEvent.notes,
          friendlyFixtureId: fixture.id,
        })
        .returning();

      return { fixture: accepted, event: opponentEvent };
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
