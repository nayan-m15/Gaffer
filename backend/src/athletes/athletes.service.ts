import { Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  eq,
  getTableColumns,
  isNull,
  isNotNull,
  sql,
} from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athleteMatchStats,
  athletes,
  matchEvents,
  playerClaimInvites,
  teams,
} from '../database/schema';
import type { CreateAthleteDto, UpdateAthleteDto } from './athletes.schemas';

export type ClaimStatus = 'unclaimed' | 'invited' | 'claimed';

export interface ClaimedAthleteSummary {
  id: string;
  teamId: string;
  teamName: string;
  firstName: string;
  lastName: string;
  position: string | null;
  squadNumber: number | null;
}

// Computed in the same query as the athlete rows via a left join on pending
// invites — never a per-row lookup. 'claimed' wins over 'invited': a stray
// pending invite alongside an attached userId is irrelevant.
const claimStatus = sql<ClaimStatus>`case
  when ${athletes.userId} is not null then 'claimed'
  when count(${playerClaimInvites.id}) > 0 then 'invited'
  else 'unclaimed'
end`;

const appearances = sql<number>`coalesce((
  select count(*)::int from ${athleteMatchStats}
  where ${athleteMatchStats.athleteId} = ${athletes.id}
), 0)`;

function loggedEventTotal(
  eventType: 'goal' | 'assist' | 'yellow_card' | 'red_card',
) {
  return sql<number>`coalesce((
    select count(*)::int from ${matchEvents}
    where ${matchEvents.athleteId} = ${athletes.id}
      and ${matchEvents.team} = 'own'
      and ${matchEvents.eventType} = ${eventType}
  ), 0)`;
}

const athleteStatistics = {
  appearances,
  goals: loggedEventTotal('goal'),
  assists: loggedEventTotal('assist'),
  yellowCards: loggedEventTotal('yellow_card'),
  redCards: loggedEventTotal('red_card'),
};

@Injectable()
export class AthletesService {
  constructor(private readonly databaseService: DatabaseService) {}

  async create(teamId: string, input: CreateAthleteDto) {
    const [athlete] = await this.databaseService.database
      .insert(athletes)
      .values({
        teamId,
        ...input,
      })
      .returning();

    return athlete;
  }

  async findAll(teamId: string) {
    return this.databaseService.database
      .select({
        ...getTableColumns(athletes),
        claimStatus,
        ...athleteStatistics,
      })
      .from(athletes)
      .leftJoin(
        playerClaimInvites,
        and(
          eq(playerClaimInvites.athleteId, athletes.id),
          eq(playerClaimInvites.status, 'pending'),
        ),
      )
      .where(and(eq(athletes.teamId, teamId), isNull(athletes.archivedAt)))
      .groupBy(athletes.id);
  }

  async findArchived(teamId: string) {
    return this.databaseService.database
      .select({
        ...getTableColumns(athletes),
        ...athleteStatistics,
      })
      .from(athletes)
      .where(and(eq(athletes.teamId, teamId), isNotNull(athletes.archivedAt)));
  }

  /**
   * Every athlete record this user has claimed as themselves, joined to the
   * owning team for display. Empty array — never null — when they have
   * claimed nothing.
   */
  async findClaimedByUser(userId: string): Promise<ClaimedAthleteSummary[]> {
    return this.databaseService.database
      .select({
        id: athletes.id,
        teamId: athletes.teamId,
        teamName: teams.name,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        position: athletes.position,
        squadNumber: athletes.squadNumber,
      })
      .from(athletes)
      .innerJoin(teams, eq(athletes.teamId, teams.id))
      .where(eq(athletes.userId, userId));
  }

  /**
   * The claimed athlete a player endpoint should act as: the row matching
   * `athleteId` when provided (and claimed by this user — anyone else's id
   * resolves to nothing), else the first athlete this user claimed. Null
   * when this user has no matching claim.
   */
  async findClaimedAthleteForUser(userId: string, athleteId?: string) {
    const conditions = [eq(athletes.userId, userId)];
    if (athleteId) {
      conditions.push(eq(athletes.id, athleteId));
    }

    const [athlete] = await this.databaseService.database
      .select({
        id: athletes.id,
        teamId: athletes.teamId,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        position: athletes.position,
        squadNumber: athletes.squadNumber,
      })
      .from(athletes)
      .where(and(...conditions))
      .orderBy(asc(athletes.createdAt))
      .limit(1);

    return athlete ?? null;
  }

  /**
   * The athlete this user claimed on a specific team, if any — used by the
   * RSVP flow, which resolves a player against the event's own team so a
   * multi-team player RSVPs as the right athlete.
   */
  async findClaimedAthleteOnTeam(userId: string, teamId: string) {
    const [athlete] = await this.databaseService.database
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(eq(athletes.userId, userId), eq(athletes.teamId, teamId)))
      .limit(1);

    return athlete ?? null;
  }

  async findOne(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .select({
        ...getTableColumns(athletes),
        claimStatus,
        ...athleteStatistics,
      })
      .from(athletes)
      .leftJoin(
        playerClaimInvites,
        and(
          eq(playerClaimInvites.athleteId, athletes.id),
          eq(playerClaimInvites.status, 'pending'),
        ),
      )
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, teamId),
          isNull(athletes.archivedAt),
        ),
      )
      .groupBy(athletes.id)
      .limit(1);

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }

  async update(teamId: string, athleteId: string, input: UpdateAthleteDto) {
    const [athlete] = await this.databaseService.database
      .update(athletes)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, teamId),
          isNull(athletes.archivedAt),
        ),
      )
      .returning();

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }

  async archive(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .update(athletes)
      .set({
        archivedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(athletes.id, athleteId),
          eq(athletes.teamId, teamId),
          isNull(athletes.archivedAt),
        ),
      )
      .returning();

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }

  async restore(teamId: string, athleteId: string) {
    const [athlete] = await this.databaseService.database
      .update(athletes)
      .set({
        archivedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(athletes.id, athleteId), eq(athletes.teamId, teamId)))
      .returning();

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    return athlete;
  }
}
