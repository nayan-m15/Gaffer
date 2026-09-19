import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike, ne, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  athletes,
  competitions,
  competitionTeams,
  standings,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateCompetitionDto,
  CreateCompetitionTeamDto,
  UpdateCompetitionDto,
} from './competitions.schemas';

/** Postgres unique-constraint violation — the race backstop when two creates
 * pass the friendly duplicate-name check concurrently. Drizzle wraps driver
 * errors in a DrizzleQueryError, so the 23505 code may sit on `cause`. */
function isUniqueViolation(error: unknown): boolean {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  return candidates.some(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'code' in candidate &&
      (candidate as { code?: unknown }).code === '23505',
  );
}

export interface CompetitionTeamView {
  id: string;
  displayName: string;
  teamId: string | null;
  createdAt: Date;
}

export interface CompetitionView {
  id: string;
  name: string;
  type: (typeof competitions.type.enumValues)[number];
  season: string | null;
  seasonId: string | null;
  isAdmin: boolean;
  createdAt: Date;
}

export interface CompetitionSummaryView extends CompetitionView {
  participantCount: number;
}

export interface CompetitionStandingView {
  id: string;
  competitionId: string;
  teamName: string;
  position: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  isOwnTeam: boolean;
}

/**
 * Shared league/competition behaviour: creation, search, the caller's
 * membership list, and admin-gated mutation of the competition and its
 * participating-team slots. `competitions.teamId` keeps naming the creator's
 * team for legacy compatibility, but access is governed by `adminUserId` and
 * the `competition_teams` membership rows.
 */
@Injectable()
export class CompetitionsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  /* ── Read endpoints ─────────────────────────────────────────────────────── */

  /** Search by name for any signed-in user. Search grants no membership. */
  async search(
    userId: string,
    term: string,
  ): Promise<CompetitionSummaryView[]> {
    const rows = await this.databaseService.database
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        season: competitions.season,
        seasonId: competitions.seasonId,
        isAdmin: sql<boolean>`coalesce(${competitions.adminUserId} = ${userId}, false)`,
        createdAt: competitions.createdAt,
        participantCount: count(competitionTeams.id),
      })
      .from(competitions)
      .leftJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(and(ne(competitions.type, 'friendly'), ilike(competitions.name, `%${term}%`)))
      .groupBy(competitions.id)
      .orderBy(asc(competitions.name))
      .limit(25);

    return rows;
  }

  /**
   * Competitions where the caller's team participates via
   * `competition_teams` — the membership source of truth — with admin
   * metadata. Competitions the caller created but whose team is not a
   * participant cannot exist: creation always inserts the creator's team.
   */
  async listMine(userId: string): Promise<CompetitionSummaryView[]> {
    const teamId = await this.findViewerTeamId(userId);
    if (!teamId) {
      throw new ForbiddenException('No team associated with this account.');
    }

    const rows = await this.databaseService.database
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        season: competitions.season,
        seasonId: competitions.seasonId,
        isAdmin: sql<boolean>`coalesce(${competitions.adminUserId} = ${userId}, false)`,
        createdAt: competitions.createdAt,
        participantCount: sql<number>`(
          select count(*)::int
          from competition_teams all_participants
          where all_participants.competition_id = ${competitions.id}
        )`,
      })
      .from(competitions)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(
        and(
          eq(competitionTeams.teamId, teamId),
          ne(competitions.type, 'friendly'),
        ),
      )
      .orderBy(asc(competitions.name));

    return rows;
  }

  /**
   * Detail view for a competition reachable by any signed-in user (search
   * must be able to open it), including participants and a read-only standings
   * table. Participant slots are the source of truth for which teams appear:
   * when a participant has no stored standings row yet, a zero-filled row is
   * synthesized so a new league never renders as an empty table.
   */
  async findOne(
    userId: string,
    competitionId: string,
  ): Promise<
    CompetitionView & {
      participants: CompetitionTeamView[];
      standings: CompetitionStandingView[];
    }
  > {
    const [competition] = await this.databaseService.database
      .select({
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        season: competitions.season,
        seasonId: competitions.seasonId,
        isAdmin: sql<boolean>`coalesce(${competitions.adminUserId} = ${userId}, false)`,
        createdAt: competitions.createdAt,
      })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);

    if (!competition) {
      throw new NotFoundException('Competition not found.');
    }

    const [participants, viewerTeamId] = await Promise.all([
      this.listParticipants(competitionId),
      this.findViewerTeamId(userId),
    ]);
    const competitionStandings = await this.listStandings(
      competitionId,
      participants,
      viewerTeamId,
    );

    return { ...competition, participants, standings: competitionStandings };
  }

  /* ── Competition CRUD ───────────────────────────────────────────────────── */

  /**
   * Creates a shared competition. The creating coach becomes `adminUserId`,
   * their team keeps being recorded on `teamId` for legacy compatibility, and
   * the team is inserted automatically as the first participant.
   */
  async create(
    userId: string,
    dto: CreateCompetitionDto,
  ): Promise<CompetitionView & { participants: CompetitionTeamView[] }> {
    const team = await this.requireCoachTeam(userId);

    await this.assertNameAvailable(dto.name);

    // neon-http has no interactive transactions, so — mirroring
    // TeamsService.createTeamForUser — the competition and participant row
    // are inserted sequentially. The unique index on lower(name) is the
    // race backstop when two creates pass the friendly check concurrently.
    let competition: typeof competitions.$inferSelect | undefined;
    try {
      [competition] = await this.databaseService.database
        .insert(competitions)
        .values({
          teamId: team.id,
          name: dto.name,
          type: dto.type,
          season: dto.season,
          adminUserId: userId,
        })
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A competition with this name already exists.',
        );
      }
      throw error;
    }

    try {
      await this.insertParticipant(competition.id, team.id, team.name);
    } catch (error) {
      // Never leave a competition without its founding participant — if the
      // automatic participant row cannot be created, roll the competition
      // itself back (mirroring TeamsService.createTeamForUser's cleanup).
      await this.databaseService.database
        .delete(competitions)
        .where(eq(competitions.id, competition.id));
      throw error;
    }

    return {
      id: competition.id,
      name: competition.name,
      type: competition.type,
      season: competition.season,
      seasonId: competition.seasonId,
      isAdmin: true,
      createdAt: competition.createdAt,
      participants: await this.listParticipants(competition.id),
    };
  }

  async update(
    userId: string,
    competitionId: string,
    dto: UpdateCompetitionDto,
  ): Promise<CompetitionView> {
    await this.requireAdmin(userId, competitionId);

    if (dto.name !== undefined) {
      await this.assertNameAvailable(dto.name, competitionId);
    }

    let updated: typeof competitions.$inferSelect | undefined;
    try {
      [updated] = await this.databaseService.database
        .update(competitions)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(competitions.id, competitionId))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A competition with this name already exists.',
        );
      }
      throw error;
    }

    if (!updated) {
      throw new NotFoundException('Competition not found.');
    }

    return {
      id: updated.id,
      name: updated.name,
      type: updated.type,
      season: updated.season,
      seasonId: updated.seasonId,
      isAdmin: true,
      createdAt: updated.createdAt,
    };
  }

  async remove(userId: string, competitionId: string): Promise<void> {
    await this.requireAdmin(userId, competitionId);

    await this.databaseService.database
      .delete(competitions)
      .where(eq(competitions.id, competitionId));
  }

  /* ── Participants ───────────────────────────────────────────────────────── */

  /**
   * Adds an unlinked participant slot. Stage 1 takes only a display name;
   * linking a real team happens when an invitation is accepted (Stage 2).
   */
  async addParticipant(
    userId: string,
    competitionId: string,
    dto: CreateCompetitionTeamDto,
  ): Promise<CompetitionTeamView> {
    await this.requireAdmin(userId, competitionId);

    return this.insertParticipant(competitionId, null, dto.displayName);
  }

  /**
   * Removes a participant slot. The admin's own team can never be removed —
   * it entered automatically at creation and its removal would leave the
   * competition without its founding participant.
   */
  async removeParticipant(
    userId: string,
    competitionId: string,
    competitionTeamId: string,
  ): Promise<void> {
    const competition = await this.requireAdmin(userId, competitionId);

    const [participant] = await this.databaseService.database
      .select({
        id: competitionTeams.id,
        teamId: competitionTeams.teamId,
      })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.id, competitionTeamId),
          eq(competitionTeams.competitionId, competitionId),
        ),
      )
      .limit(1);

    if (!participant) {
      throw new NotFoundException('Participant not found.');
    }

    if (participant.teamId === competition.teamId) {
      throw new ForbiddenException(
        'The admin team cannot be removed from its competition.',
      );
    }

    await this.databaseService.database
      .delete(competitionTeams)
      .where(eq(competitionTeams.id, competitionTeamId));
  }

  /* ── Internals ──────────────────────────────────────────────────────────── */

  /**
   * Resolves the team whose competitions the current viewer should see. Team
   * members (coach or assistant) resolve through team_members; player-only
   * accounts resolve through their first claimed athlete. Search/detail do not
   * require a team, but this identity lets "My competitions" and own-team
   * highlighting work consistently across all three roles.
   */
  private async findViewerTeamId(userId: string): Promise<string | null> {
    const memberTeam = await this.teamsService.findTeamForUser(userId);
    if (memberTeam) return memberTeam.id;

    const [claimedAthlete] = await this.databaseService.database
      .select({ teamId: athletes.teamId })
      .from(athletes)
      .where(eq(athletes.userId, userId))
      .orderBy(asc(athletes.createdAt))
      .limit(1);

    return claimedAthlete?.teamId ?? null;
  }

  /**
   * Merges stored manual standings with participant membership. Missing rows
   * are deliberately represented by zeroes so newly-created competitions and
   * newly-added teams are visible immediately.
   */
  private async listStandings(
    competitionId: string,
    participants: CompetitionTeamView[],
    viewerTeamId: string | null,
  ): Promise<CompetitionStandingView[]> {
    const stored = await this.databaseService.database
      .select({
        id: standings.id,
        competitionId: standings.competitionId,
        teamName: standings.teamName,
        position: standings.position,
        played: standings.played,
        won: standings.won,
        drawn: standings.drawn,
        lost: standings.lost,
        goalsFor: standings.goalsFor,
        goalsAgainst: standings.goalsAgainst,
        points: standings.points,
      })
      .from(standings)
      .where(eq(standings.competitionId, competitionId));

    const byTeamName = new Map(
      stored.map((row) => [row.teamName.trim().toLocaleLowerCase(), row]),
    );

    const rows = participants.map((participant) => {
      const existing = byTeamName.get(
        participant.displayName.trim().toLocaleLowerCase(),
      );
      const isOwnTeam =
        viewerTeamId !== null && participant.teamId === viewerTeamId;

      if (existing) {
        return {
          id: existing.id,
          competitionId: existing.competitionId,
          teamName: existing.teamName,
          position: existing.position,
          played: existing.played,
          won: existing.won,
          drawn: existing.drawn,
          lost: existing.lost,
          goalsFor: existing.goalsFor,
          goalsAgainst: existing.goalsAgainst,
          points: existing.points,
          isOwnTeam,
        };
      }

      return {
        id: `participant:${participant.id}`,
        competitionId,
        teamName: participant.displayName,
        position: 0,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        points: 0,
        isOwnTeam,
      };
    });

    const ordered = rows.sort((a, b) => {
      if (a.position === 0 && b.position === 0) {
        return a.teamName.localeCompare(b.teamName, undefined, {
          sensitivity: 'base',
        });
      }
      if (a.position === 0) return 1;
      if (b.position === 0) return -1;
      const positionDifference = a.position - b.position;
      if (positionDifference !== 0) return positionDifference;
      return a.teamName.localeCompare(b.teamName, undefined, {
        sensitivity: 'base',
      });
    });

    let nextFallbackPosition =
      ordered.reduce((max, row) => Math.max(max, row.position), 0) + 1;

    return ordered.map((row) => {
      if (row.position !== 0) return row;
      return { ...row, position: nextFallbackPosition++ };
    });
  }

  /** Coach-only gate — only a team's coach may create competitions. */
  private async requireCoachTeam(userId: string) {
    return this.teamsService.requireCoachTeam(userId);
  }

  /**
   * Resolves the competition and rejects unless `userId` is its admin. A
   * missing competition and a foreign competition produce the same 404 —
   * no existence leak.
   */
  private async requireAdmin(userId: string, competitionId: string) {
    const [competition] = await this.databaseService.database
      .select()
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);

    if (!competition || competition.adminUserId !== userId) {
      throw new NotFoundException('Competition not found.');
    }

    return competition;
  }

  /** Friendly duplicate-name check; the unique index is the race backstop. */
  private async assertNameAvailable(
    name: string,
    excludeCompetitionId?: string,
  ): Promise<void> {
    const nameMatch = sql`lower(${competitions.name}) = lower(${name})`;
    const [existing] = await this.databaseService.database
      .select({ id: competitions.id })
      .from(competitions)
      .where(
        excludeCompetitionId
          ? and(nameMatch, ne(competitions.id, excludeCompetitionId))
          : nameMatch,
      )
      .limit(1);

    if (existing) {
      throw new ConflictException(
        'A competition with this name already exists.',
      );
    }
  }

  /**
   * Single insert point for participant rows. Maps both unique violations to
   * the same friendly conflict so the caller cannot tell which constraint
   * tripped.
   */
  private async insertParticipant(
    competitionId: string,
    teamId: string | null,
    displayName: string,
  ): Promise<CompetitionTeamView> {
    try {
      const [participant] = await this.databaseService.database
        .insert(competitionTeams)
        .values({ competitionId, teamId, displayName })
        .returning();

      return {
        id: participant.id,
        displayName: participant.displayName,
        teamId: participant.teamId,
        createdAt: participant.createdAt,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'This team is already a participant in the competition.',
        );
      }
      throw error;
    }
  }

  /** Participants ordered by creation — creation order reads as seeding order. */
  private async listParticipants(
    competitionId: string,
  ): Promise<CompetitionTeamView[]> {
    const rows = await this.databaseService.database
      .select({
        id: competitionTeams.id,
        displayName: competitionTeams.displayName,
        teamId: competitionTeams.teamId,
        createdAt: competitionTeams.createdAt,
      })
      .from(competitionTeams)
      .where(eq(competitionTeams.competitionId, competitionId))
      .orderBy(asc(competitionTeams.createdAt));

    return rows;
  }
}
