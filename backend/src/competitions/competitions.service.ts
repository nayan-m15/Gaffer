import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, gte, ilike, inArray, ne, sql } from 'drizzle-orm';
import { calculateCompetitionStandings } from '../common/competition-standings';
import { DatabaseService } from '../database/database.service';
import {
  athletes,
  competitionMatches,
  competitions,
  competitionTeams,
  events,
  matchEvents,
  matches,
  standings,
} from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import type {
  CreateCompetitionDto,
  CreateCompetitionResultDto,
  CreateCompetitionTeamDto,
  UpdateCompetitionDto,
  UpdateCompetitionResultDto,
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

export interface CompetitionResultView {
  id: string;
  competitionId: string;
  homeCompetitionTeamId: string;
  awayCompetitionTeamId: string;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  playedAt: Date;
  source: 'live_logged' | 'manual';
  linkedMatchId: string | null;
  createdAt: Date;
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
      results: CompetitionResultView[];
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
    const [competitionStandings, results] = await Promise.all([
      this.listStandings(competitionId, participants, viewerTeamId),
      this.listResults(competitionId, participants),
    ]);

    return {
      ...competition,
      participants,
      standings: competitionStandings,
      results,
    };
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

  /* ── Results ───────────────────────────────────────────────────────────── */

  async createManualResult(
    userId: string,
    competitionId: string,
    dto: CreateCompetitionResultDto,
  ): Promise<CompetitionResultView> {
    await this.requireAdmin(userId, competitionId);
    await this.requireResultParticipants(competitionId, dto);

    const [created] = await this.databaseService.database
      .insert(competitionMatches)
      .values({
        competitionId,
        homeCompetitionTeamId: dto.homeCompetitionTeamId,
        awayCompetitionTeamId: dto.awayCompetitionTeamId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        playedAt: new Date(dto.playedAt),
        createdByUserId: userId,
      })
      .returning();

    return this.requireResultView(competitionId, created.id);
  }

  async updateManualResult(
    userId: string,
    competitionId: string,
    resultId: string,
    dto: UpdateCompetitionResultDto,
  ): Promise<CompetitionResultView> {
    await this.requireAdmin(userId, competitionId);
    await this.requireResultParticipants(competitionId, dto);

    const [existing] = await this.databaseService.database
      .select({ id: competitionMatches.id })
      .from(competitionMatches)
      .where(
        and(
          eq(competitionMatches.id, resultId),
          eq(competitionMatches.competitionId, competitionId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Competition result not found.');
    }
    await this.databaseService.database
      .update(competitionMatches)
      .set({
        homeCompetitionTeamId: dto.homeCompetitionTeamId,
        awayCompetitionTeamId: dto.awayCompetitionTeamId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        playedAt: new Date(dto.playedAt),
        updatedAt: new Date(),
      })
      .where(eq(competitionMatches.id, resultId));

    return this.requireResultView(competitionId, resultId);
  }

  async removeManualResult(
    userId: string,
    competitionId: string,
    resultId: string,
  ): Promise<void> {
    await this.requireAdmin(userId, competitionId);

    const [existing] = await this.databaseService.database
      .select({ id: competitionMatches.id })
      .from(competitionMatches)
      .where(
        and(
          eq(competitionMatches.id, resultId),
          eq(competitionMatches.competitionId, competitionId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Competition result not found.');
    }
    await this.databaseService.database
      .delete(competitionMatches)
      .where(eq(competitionMatches.id, resultId));
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
   * Shared standings are calculated from two kinds of completed results:
   * app matches completed through the live logger, plus admin-entered manual
   * results for fixtures that were not logged in the app. Existing manual
   * standings rows remain as a legacy baseline so deployment does not erase
   * historical values already entered before result tracking existed.
   */
  private async listStandings(
    competitionId: string,
    participants: CompetitionTeamView[],
    viewerTeamId: string | null,
  ): Promise<CompetitionStandingView[]> {
    const [baseline, results] = await Promise.all([
      this.databaseService.database
        .select({
          id: standings.id,
          teamName: standings.teamName,
          played: standings.played,
          won: standings.won,
          drawn: standings.drawn,
          lost: standings.lost,
          goalsFor: standings.goalsFor,
          goalsAgainst: standings.goalsAgainst,
          points: standings.points,
        })
        .from(standings)
        .where(eq(standings.competitionId, competitionId)),
      this.loadCompetitionResults(competitionId),
    ]);

    return calculateCompetitionStandings(
      competitionId,
      participants,
      results.map((row) => ({
        homeCompetitionTeamId: row.homeCompetitionTeamId,
        awayCompetitionTeamId: row.awayCompetitionTeamId,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
      })),
      viewerTeamId,
      baseline,
    );
  }

  private async listResults(
    competitionId: string,
    participants: CompetitionTeamView[],
  ): Promise<CompetitionResultView[]> {
    const rows = await this.loadCompetitionResults(competitionId);
    const names = new Map(
      participants.map((participant) => [participant.id, participant.displayName]),
    );

    return rows.map((row) => ({
      id: row.id,
      competitionId,
      homeCompetitionTeamId: row.homeCompetitionTeamId,
      awayCompetitionTeamId: row.awayCompetitionTeamId,
      homeTeamName: names.get(row.homeCompetitionTeamId) ?? 'Unknown team',
      awayTeamName: names.get(row.awayCompetitionTeamId) ?? 'Unknown team',
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      playedAt: row.playedAt,
      source: row.source,
      linkedMatchId: row.linkedMatchId,
      createdAt: row.createdAt,
    }));
  }

  private async loadCompetitionResults(competitionId: string) {
    const [manualRows, liveRows] = await Promise.all([
      this.databaseService.database
        .select()
        .from(competitionMatches)
        .where(eq(competitionMatches.competitionId, competitionId)),
      this.databaseService.database
        .select({
          matchId: matches.id,
          ownCompetitionTeamId: competitionTeams.id,
          opponentCompetitionTeamId: matches.opponentCompetitionTeamId,
          isHome: matches.isHome,
          playedAt: events.scheduledAt,
          createdAt: matches.createdAt,
          teamScore: sql<number>`count(*) filter (where ${matchEvents.team} = 'own' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`,
          opponentScore: sql<number>`count(*) filter (where ${matchEvents.team} = 'opponent' and ${matchEvents.eventType} = 'goal' and ${matchEvents.lifecycleStatus} <> 'voided')::int`,
        })
        .from(matches)
        .innerJoin(events, eq(matches.eventId, events.id))
        .innerJoin(competitions, eq(matches.competitionId, competitions.id))
        .innerJoin(
          competitionTeams,
          and(
            eq(competitionTeams.competitionId, matches.competitionId),
            eq(competitionTeams.teamId, events.teamId),
          ),
        )
        .leftJoin(matchEvents, eq(matchEvents.matchId, matches.id))
        .where(
          and(
            eq(matches.competitionId, competitionId),
            eq(events.status, 'completed'),
            gte(matches.createdAt, competitions.resultTrackingStartedAt),
            sql`${matches.opponentCompetitionTeamId} is not null`,
          ),
        )
        .groupBy(
          matches.id,
          competitionTeams.id,
          events.scheduledAt,
          matches.createdAt,
        ),
    ]);

    const manual = manualRows.map((row) => ({
      id: row.id,
      homeCompetitionTeamId: row.homeCompetitionTeamId,
      awayCompetitionTeamId: row.awayCompetitionTeamId,
      homeScore: row.homeScore,
      awayScore: row.awayScore,
      playedAt: row.playedAt,
      source: 'manual' as const,
      linkedMatchId: null,
      createdAt: row.createdAt,
    }));

    const live = liveRows
      .filter(
        (row): row is typeof row & { opponentCompetitionTeamId: string } =>
          row.opponentCompetitionTeamId !== null,
      )
      .map((row) => ({
        id: `match:${row.matchId}`,
        homeCompetitionTeamId: row.isHome
          ? row.ownCompetitionTeamId
          : row.opponentCompetitionTeamId,
        awayCompetitionTeamId: row.isHome
          ? row.opponentCompetitionTeamId
          : row.ownCompetitionTeamId,
        homeScore: row.isHome ? row.teamScore : row.opponentScore,
        awayScore: row.isHome ? row.opponentScore : row.teamScore,
        playedAt: row.playedAt,
        source: 'live_logged' as const,
        linkedMatchId: row.matchId,
        createdAt: row.createdAt,
      }));

    return [...manual, ...live].sort((a, b) => {
      const dateDifference = a.playedAt.getTime() - b.playedAt.getTime();
      if (dateDifference !== 0) return dateDifference;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
  }

  private async requireResultParticipants(
    competitionId: string,
    dto: {
      homeCompetitionTeamId: string;
      awayCompetitionTeamId: string;
    },
  ): Promise<void> {
    if (dto.homeCompetitionTeamId === dto.awayCompetitionTeamId) {
      throw new BadRequestException('Home and away teams must be different.');
    }

    const rows = await this.databaseService.database
      .select({ id: competitionTeams.id })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.competitionId, competitionId),
          inArray(competitionTeams.id, [
            dto.homeCompetitionTeamId,
            dto.awayCompetitionTeamId,
          ]),
        ),
      );

    if (rows.length !== 2) {
      throw new BadRequestException(
        'Both teams must participate in this competition.',
      );
    }
  }

  private async requireResultView(
    competitionId: string,
    resultId: string,
  ): Promise<CompetitionResultView> {
    const participants = await this.listParticipants(competitionId);
    const results = await this.listResults(competitionId, participants);
    const result = results.find((row) => row.id === resultId);
    if (!result) {
      throw new NotFoundException('Competition result not found.');
    }
    return result;
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
