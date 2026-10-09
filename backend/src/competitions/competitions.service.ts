import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  count,
  eq,
  gte,
  ilike,
  inArray,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { calculateCompetitionStandings } from '../common/competition-standings';
import { competitionAttributedEvents } from './competition-attributed-events';
import { finaliseTimedOutCompetitionSessions } from './competition-fixture-results';
import { DatabaseService } from '../database/database.service';
import {
  ensureCompetitionFixtureSession,
  twoSidedLiveLoggingEnabled,
} from '../matches/match-sessions';
import {
  athletes,
  competitionMatches,
  competitionFixtures,
  competitions,
  competitionTeams,
  hiddenCompetitions,
  events,
  matches,
  standings,
  teams,
} from '../database/schema';
import {
  planFixtures,
  settingsView,
  settingKeys,
  settingsColumns,
  validateSettings,
} from './competition-fixtures';
import { TeamsService } from '../teams/teams.service';
import {
  resetManualFixtureResult,
  syncFixtureResult,
  validateFixtureResult,
} from './competition-fixture-results';
import type {
  CreateCompetitionDto,
  CreateCompetitionResultDto,
  CreateCompetitionTeamDto,
  FixtureScheduleAcceptDto,
  FixtureScheduleProposalDto,
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
  originalDisplayName?: string | null;
  teamId: string | null;
  createdAt: Date;
}

export interface CompetitionView extends Partial<
  Pick<typeof competitions.$inferSelect, (typeof settingKeys)[number]>
> {
  id: string;
  name: string;
  type: (typeof competitions.type.enumValues)[number];
  season: string | null;
  seasonId: string | null;
  isAdmin: boolean;
  createdAt: Date;
  archivedAt: Date | null;
  hiddenByMe: boolean;
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

interface FixtureScheduleParticipant {
  id: string;
  teamId: string | null;
  displayName: string;
}

interface FixtureScheduleContext {
  fixture: typeof competitionFixtures.$inferSelect;
  home: FixtureScheduleParticipant;
  away: FixtureScheduleParticipant;
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
        ...settingsColumns,
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        season: competitions.season,
        seasonId: competitions.seasonId,
        isAdmin: sql<boolean>`coalesce(${competitions.adminUserId} = ${userId}, false)`,
        createdAt: competitions.createdAt,
        archivedAt: competitions.archivedAt,
        hiddenByMe: sql<boolean>`exists (select 1 from hidden_competitions hidden where hidden.competition_id = ${competitions.id} and hidden.user_id = ${userId})`,
        participantCount: count(competitionTeams.id),
      })
      .from(competitions)
      .leftJoin(
        competitionTeams,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(
        and(
          ne(competitions.type, 'friendly'),
          ilike(competitions.name, `%${term}%`),
        ),
      )
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
        ...settingsColumns,
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        season: competitions.season,
        seasonId: competitions.seasonId,
        isAdmin: sql<boolean>`coalesce(${competitions.adminUserId} = ${userId}, false)`,
        createdAt: competitions.createdAt,
        archivedAt: competitions.archivedAt,
        hiddenByMe: sql<boolean>`exists (select 1 from hidden_competitions hidden where hidden.competition_id = ${competitions.id} and hidden.user_id = ${userId})`,
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
        ...settingsColumns,
        id: competitions.id,
        name: competitions.name,
        type: competitions.type,
        season: competitions.season,
        seasonId: competitions.seasonId,
        isAdmin: sql<boolean>`coalesce(${competitions.adminUserId} = ${userId}, false)`,
        createdAt: competitions.createdAt,
        archivedAt: competitions.archivedAt,
        hiddenByMe: sql<boolean>`exists (select 1 from hidden_competitions hidden where hidden.competition_id = ${competitions.id} and hidden.user_id = ${userId})`,
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
      this.listStandings(
        competitionId,
        participants,
        viewerTeamId,
        competition,
      ),
      this.listResults(competitionId, participants),
    ]);

    return {
      ...competition,
      participants,
      standings: competitionStandings,
      results,
    };
  }

  /** Hide is per user; archive is global and administrator-only. */
  async setHidden(userId: string, competitionId: string, hidden: boolean) {
    const [exists] = await this.databaseService.database
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);
    if (!exists) throw new NotFoundException('Competition not found.');
    const teamId = await this.findViewerTeamId(userId);
    const [member] = teamId
      ? await this.databaseService.database
          .select({ id: competitionTeams.id })
          .from(competitionTeams)
          .where(
            and(
              eq(competitionTeams.competitionId, competitionId),
              eq(competitionTeams.teamId, teamId),
            ),
          )
          .limit(1)
      : [];
    if (!member)
      throw new ForbiddenException(
        'Only competition participants can hide this competition.',
      );
    if (hidden)
      await this.databaseService.database
        .insert(hiddenCompetitions)
        .values({ userId, competitionId })
        .onConflictDoNothing();
    else
      await this.databaseService.database
        .delete(hiddenCompetitions)
        .where(
          and(
            eq(hiddenCompetitions.userId, userId),
            eq(hiddenCompetitions.competitionId, competitionId),
          ),
        );
    return { hidden };
  }

  async setArchived(userId: string, competitionId: string, archived: boolean) {
    const current = await this.requireAdmin(userId, competitionId, true);
    if (archived && !current.archivedAt) {
      const [active] = await this.databaseService.database
        .select({ id: competitionFixtures.id })
        .from(competitionFixtures)
        .where(
          and(
            eq(competitionFixtures.competitionId, competitionId),
            eq(competitionFixtures.status, 'in_progress'),
          ),
        )
        .limit(1);
      if (active)
        throw new ConflictException(
          'Finish or cancel live fixtures before archiving this competition.',
        );
    }
    await this.databaseService.database
      .update(competitions)
      .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(competitions.id, competitionId));
    return { archived };
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
    validateSettings(dto);

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
          ...dto,
          format: dto.format ?? (dto.type === 'cup' ? 'knockout' : 'league'),
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
      this.rethrowFixtureGuard(error);
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
      this.rethrowFixtureGuard(error);
      throw error;
    }

    return {
      ...settingsView(competition),
      id: competition.id,
      name: competition.name,
      type: competition.type,
      season: competition.season,
      seasonId: competition.seasonId,
      isAdmin: true,
      createdAt: competition.createdAt,
      archivedAt: null,
      hiddenByMe: false,
      participants: await this.listParticipants(competition.id),
    };
  }

  async update(
    userId: string,
    competitionId: string,
    dto: UpdateCompetitionDto,
  ): Promise<CompetitionView> {
    const current = await this.requireAdmin(userId, competitionId);
    const settingsChanged =
      settingKeys.some((key) => dto[key] !== undefined) ||
      dto.type !== undefined;
    if (settingsChanged) {
      if (
        dto.type !== undefined &&
        dto.type !== current.type &&
        dto.format === undefined
      ) {
        dto = {
          ...dto,
          format: dto.type === 'cup' ? 'knockout' : 'league',
          qualifierCount: null,
        };
      }
      validateSettings({ ...current, ...dto });
    }

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
      this.rethrowFixtureGuard(error);
      throw error;
    }

    if (!updated) {
      throw new NotFoundException('Competition not found.');
    }

    return {
      ...settingsView(updated),
      id: updated.id,
      name: updated.name,
      type: updated.type,
      season: updated.season,
      seasonId: updated.seasonId,
      isAdmin: true,
      createdAt: updated.createdAt,
      archivedAt: updated.archivedAt,
      hiddenByMe: false,
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

  /** Correct only unlinked participant labels; never mutate the registered team. */
  async renameParticipant(
    userId: string,
    competitionId: string,
    slotId: string,
    dto: CreateCompetitionTeamDto,
  ) {
    await this.requireAdmin(userId, competitionId);
    try {
      const [row] = await this.databaseService.database
        .update(competitionTeams)
        .set({ displayName: dto.displayName, updatedAt: new Date() })
        .where(
          and(
            eq(competitionTeams.id, slotId),
            eq(competitionTeams.competitionId, competitionId),
            sql`${competitionTeams.teamId} is null`,
          ),
        )
        .returning();
      if (!row)
        throw new ConflictException(
          'Only existing unlinked participants can be renamed.',
        );
      return {
        id: row.id,
        displayName: row.displayName,
        teamId: row.teamId,
        createdAt: row.createdAt,
      };
    } catch (error) {
      if (isUniqueViolation(error))
        throw new ConflictException(
          'Another participant already uses that name.',
        );
      this.rethrowFixtureGuard(error);
      throw error;
    }
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

    try {
      await this.databaseService.database
        .delete(competitionTeams)
        .where(eq(competitionTeams.id, competitionTeamId));
    } catch (error) {
      this.rethrowFixtureGuard(error);
      throw error;
    }
  }

  /* ── Results ───────────────────────────────────────────────────────────── */

  async createManualResult(
    userId: string,
    competitionId: string,
    dto: CreateCompetitionResultDto,
  ): Promise<CompetitionResultView> {
    await this.requireAdmin(userId, competitionId);
    await this.requireResultParticipants(competitionId, dto);
    const resultId = randomUUID();
    await validateFixtureResult(
      this.databaseService,
      competitionId,
      { kind: 'manual', id: resultId },
      dto,
    );

    const [created] = await this.databaseService.database
      .insert(competitionMatches)
      .values({
        id: resultId,
        competitionId,
        homeCompetitionTeamId: dto.homeCompetitionTeamId,
        awayCompetitionTeamId: dto.awayCompetitionTeamId,
        homeScore: dto.homeScore,
        awayScore: dto.awayScore,
        playedAt: new Date(dto.playedAt),
        createdByUserId: userId,
      })
      .returning();

    try {
      await syncFixtureResult(
        this.databaseService,
        competitionId,
        { kind: 'manual', id: created.id },
        dto,
      );
    } catch (error) {
      await this.databaseService.database
        .delete(competitionMatches)
        .where(eq(competitionMatches.id, created.id));
      throw error;
    }

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
    await validateFixtureResult(
      this.databaseService,
      competitionId,
      { kind: 'manual', id: resultId },
      dto,
    );
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

    await syncFixtureResult(
      this.databaseService,
      competitionId,
      { kind: 'manual', id: resultId },
      dto,
    );
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
    await resetManualFixtureResult(
      this.databaseService,
      competitionId,
      resultId,
    );
    await this.databaseService.database
      .delete(competitionMatches)
      .where(eq(competitionMatches.id, resultId));
  }

  /** Competition-wide leaderboard, sourced exclusively from finalized fixture logs.
   * Manual score-only results are intentionally excluded: they have no player attribution.
   */
  async getPlayerStats(userId: string, competitionId: string) {
    // Detail has the same authenticated visibility rules as other public competition reads.
    await this.findOne(userId, competitionId);
    // Count the canonical persisted event ledger directly. In a bilateral
    // session, either coach's match may own a canonical event, and only one
    // match is stored in competition_fixtures.linked_match_id. The fixture's
    // durable event association includes BOTH finalized match sheets.
    const metricRows = await this.databaseService.database.execute(sql`
      ${competitionAttributedEvents}
      select a.id::text as athlete_id, a.first_name, a.last_name, a.position,
             ct.team_id::text as team_id, ct.display_name as team_name,
             count(*) filter (where d.event_type = 'goal')::int as goals,
             count(*) filter (where d.event_type = 'assist')::int as assists,
             count(*) filter (where d.event_type = 'goalkeeper_save')::int as saves,
             count(*) filter (where d.event_type = 'yellow_card')::int as yellow_cards,
             count(*) filter (where d.event_type = 'red_card')::int as red_cards
      from deduplicated d
      join competition_fixtures f on f.id = d.fixture_id
      join athletes a on a.id = d.athlete_id and a.team_id = d.team_id
      join competition_teams ct on ct.team_id = a.team_id and ct.competition_id = f.competition_id
      where f.competition_id = ${competitionId}::uuid
      group by a.id, a.first_name, a.last_name, a.position, ct.team_id, ct.display_name
    `);
    const appearances = await this.databaseService.database.execute(sql`
      select a.id::text as athlete_id, a.first_name, a.last_name, a.position,
             ct.team_id::text as team_id, ct.display_name as team_name,
             count(distinct m.id)::int as appearances
      from athlete_match_stats ams
      join athletes a on a.id = ams.athlete_id
      join matches m on m.id = ams.match_id
      join events e on e.id = m.event_id and e.team_id = a.team_id
      join competition_teams ct on ct.team_id = a.team_id and ct.competition_id = ${competitionId}::uuid
      join competition_fixtures f on f.id = e.competition_fixture_id
      where e.competition_id = ${competitionId}::uuid
        and f.competition_id = ${competitionId}::uuid
        and e.status = 'completed' and f.status = 'completed'
        and (m.shared_match_id is null or f.shared_session_id = m.shared_match_id)
        and (ams.started or exists (
          select 1 from match_events sub where sub.match_id = m.id
            and sub.team = 'own' and sub.event_type = 'substitution'
            and sub.detail = ams.athlete_id::text
            and sub.lifecycle_status not in ('voided','needs_review')
        ))
      group by a.id, a.first_name, a.last_name, a.position, ct.team_id, ct.display_name
    `);
    const players = new Map<
      string,
      {
        athleteId: string;
        name: string;
        position: string | null;
        teamId: string;
        teamName: string;
        goals: number;
        assists: number;
        goalContributions: number;
        saves: number;
        appearances: number;
        yellowCards: number;
        redCards: number;
      }
    >();
    type StatRow = Record<string, unknown>;
    const ensurePlayer = (row: StatRow) => {
      const athleteId = String(row.athlete_id);
      let player = players.get(athleteId);
      if (!player) {
        player = {
          athleteId,
          name: [
            typeof row.first_name === 'string' ? row.first_name : '',
            typeof row.last_name === 'string' ? row.last_name : '',
          ]
            .join(' ')
            .trim(),
          position: (row.position as string | null) ?? null,
          teamId: String(row.team_id),
          teamName: String(row.team_name),
          goals: 0,
          assists: 0,
          goalContributions: 0,
          saves: 0,
          appearances: 0,
          yellowCards: 0,
          redCards: 0,
        };
        players.set(athleteId, player);
      }
      return player;
    };
    for (const row of metricRows.rows) {
      const player = ensurePlayer(row);
      player.goals += Number(row.goals ?? 0);
      player.assists += Number(row.assists ?? 0);
      player.saves += Number(row.saves ?? 0);
      player.yellowCards += Number(row.yellow_cards ?? 0);
      player.redCards += Number(row.red_cards ?? 0);
      player.goalContributions = player.goals + player.assists;
    }
    for (const row of appearances.rows) {
      ensurePlayer(row).appearances += Number(row.appearances ?? 0);
    }
    return Array.from(players.values()).sort(
      (a, b) =>
        b.goals - a.goals ||
        b.assists - a.assists ||
        a.name.localeCompare(b.name),
    );
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
    scoring: {
      pointsWin?: number;
      pointsDraw?: number;
      pointsLoss?: number;
      format?: 'league' | 'knockout' | 'league_knockout' | null;
    },
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

    let standingsResults = results;
    if (scoring.format === 'league_knockout') {
      const fixtureLinks = await this.databaseService.database
        .select({
          stage: competitionFixtures.stage,
          legacyResultId: competitionFixtures.legacyResultId,
          linkedMatchId: competitionFixtures.linkedMatchId,
        })
        .from(competitionFixtures)
        .where(eq(competitionFixtures.competitionId, competitionId));
      if (fixtureLinks.some((fixture) => fixture.stage === 'knockout')) {
        const leagueManualIds = new Set(
          fixtureLinks
            .filter((fixture) => fixture.stage === 'league')
            .map((fixture) => fixture.legacyResultId)
            .filter((id): id is string => id !== null),
        );
        const leagueMatchIds = new Set(
          fixtureLinks
            .filter((fixture) => fixture.stage === 'league')
            .map((fixture) => fixture.linkedMatchId)
            .filter((id): id is string => id !== null),
        );
        standingsResults = results.filter((row) =>
          row.source === 'manual'
            ? leagueManualIds.has(row.id)
            : row.linkedMatchId !== null &&
              leagueMatchIds.has(row.linkedMatchId),
        );
      }
    }

    return calculateCompetitionStandings(
      competitionId,
      participants,
      standingsResults.map((row) => ({
        homeCompetitionTeamId: row.homeCompetitionTeamId,
        awayCompetitionTeamId: row.awayCompetitionTeamId,
        homeScore: row.homeScore,
        awayScore: row.awayScore,
      })),
      viewerTeamId,
      baseline,
      scoring,
    );
  }

  private async listResults(
    competitionId: string,
    participants: CompetitionTeamView[],
  ): Promise<CompetitionResultView[]> {
    const rows = await this.loadCompetitionResults(competitionId);
    const names = new Map(
      participants.map((participant) => [
        participant.id,
        participant.displayName,
      ]),
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
    await finaliseTimedOutCompetitionSessions(
      this.databaseService,
      competitionId,
    );
    const [manualRows, liveRows] = await Promise.all([
      this.databaseService.database
        .select()
        .from(competitionMatches)
        .where(eq(competitionMatches.competitionId, competitionId)),
      this.databaseService.database
        .select({
          matchId: matches.id,
          fixtureId: competitionFixtures.id,
          fixtureHomeId: competitionFixtures.homeCompetitionTeamId,
          fixtureAwayId: competitionFixtures.awayCompetitionTeamId,
          fixtureHomeScore: competitionFixtures.homeScore,
          fixtureAwayScore: competitionFixtures.awayScore,
          fixtureLinkedMatchId: competitionFixtures.linkedMatchId,
          playedAt: events.scheduledAt,
          createdAt: matches.createdAt,
        })
        .from(matches)
        .innerJoin(events, eq(matches.eventId, events.id))
        .innerJoin(competitions, eq(matches.competitionId, competitions.id))
        .leftJoin(
          competitionFixtures,
          or(
            eq(competitionFixtures.linkedMatchId, matches.id),
            and(
              sql`${matches.sharedMatchId} is not null`,
              eq(competitionFixtures.sharedSessionId, matches.sharedMatchId),
            ),
          ),
        )
        .where(
          and(
            eq(matches.competitionId, competitionId),
            eq(events.status, 'completed'),
            gte(matches.createdAt, competitions.resultTrackingStartedAt),
            sql`${competitionFixtures.id} is not null`,
            eq(competitionFixtures.status, 'completed'),
          ),
        )
        .groupBy(
          matches.id,
          events.scheduledAt,
          matches.createdAt,
          competitionFixtures.id,
          competitionFixtures.homeCompetitionTeamId,
          competitionFixtures.awayCompetitionTeamId,
          competitionFixtures.homeScore,
          competitionFixtures.awayScore,
          competitionFixtures.linkedMatchId,
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

    const liveByFixture = new Map<string, (typeof liveRows)[number]>();
    for (const row of liveRows) {
      if (row.fixtureId && !liveByFixture.has(row.fixtureId)) {
        liveByFixture.set(row.fixtureId, row);
      }
    }
    const live = [...liveByFixture.values()].flatMap((row) =>
      row.fixtureId &&
      row.fixtureHomeId &&
      row.fixtureAwayId &&
      row.fixtureHomeScore !== null &&
      row.fixtureAwayScore !== null
        ? [
            {
              id: `fixture:${row.fixtureId}`,
              homeCompetitionTeamId: row.fixtureHomeId,
              awayCompetitionTeamId: row.fixtureAwayId,
              homeScore: row.fixtureHomeScore,
              awayScore: row.fixtureAwayScore,
              playedAt: row.playedAt,
              source: 'live_logged' as const,
              linkedMatchId: row.fixtureLinkedMatchId ?? row.matchId,
              createdAt: row.createdAt,
            },
          ]
        : [],
    );

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
  private rethrowFixtureGuard(error: unknown): void {
    const cause = error as {
      cause?: { code?: string; message?: string };
      code?: string;
      message?: string;
    };
    const detail = cause?.cause ?? cause;
    if (detail?.code === 'P0001') throw new ConflictException(detail.message);
  }

  /** Sanitized, read-only match centre: never expose private team tactics or notes. */
  async getFixtureMatchCentre(
    userId: string,
    competitionId: string,
    fixtureId: string,
  ) {
    await this.findOne(userId, competitionId);
    const [fixture] = await this.databaseService.database
      .select()
      .from(competitionFixtures)
      .where(
        and(
          eq(competitionFixtures.id, fixtureId),
          eq(competitionFixtures.competitionId, competitionId),
        ),
      )
      .limit(1);
    if (!fixture) throw new NotFoundException('Fixture not found.');
    if (fixture.status !== 'completed')
      throw new BadRequestException('The match has not finished.');
    const rows = await this.databaseService.database.execute(sql`
      with raw as (
        select me.id, me.match_id, me.event_type::text as type, me.minute,
          me.team::text as recorded_team, me.detail, me.athlete_id,
          me.opponent_label, e.team_id as logger_team_id,
          case when me.team = 'own' then e.team_id
            when own_ct.id = f.home_competition_team_id then away_ct.team_id
            when own_ct.id = f.away_competition_team_id then home_ct.team_id
            else null end as credited_team_id
        from match_events me
        join matches m on m.id = me.match_id
        join events e on e.id = m.event_id
        join competition_fixtures f on f.id = e.competition_fixture_id
        join competition_teams own_ct on own_ct.team_id = e.team_id and own_ct.competition_id = f.competition_id
        join competition_teams home_ct on home_ct.id = f.home_competition_team_id
        join competition_teams away_ct on away_ct.id = f.away_competition_team_id
        where f.id = ${fixtureId}::uuid and f.competition_id = ${competitionId}::uuid
          and f.status = 'completed' and e.status = 'completed'
          and (m.shared_match_id is null or m.shared_match_id = f.shared_session_id)
          and me.lifecycle_status not in ('voided','needs_review')
          and me.event_type in ('goal','assist','yellow_card','red_card','substitution','goalkeeper_save','penalty')
      ), resolved as (
        select r.*, coalesce(own_a.id, opponent_a.id) as player_id,
          case when own_a.id is not null then concat_ws(' ',own_a.first_name,own_a.last_name) when opponent_a.id is not null then concat_ws(' ',opponent_a.first_name,opponent_a.last_name) else r.opponent_label end as player_name
        from raw r
        left join athletes own_a on r.recorded_team = 'own' and own_a.id = r.athlete_id and own_a.team_id = r.credited_team_id
        left join lateral (
          select a.id,a.first_name,a.last_name from athletes a
          where r.recorded_team = 'opponent' and a.team_id = r.credited_team_id
            and r.opponent_label ~ '^#[0-9]+[[:space:]]+'
            and a.squad_number::text = substring(r.opponent_label from '^#([0-9]+)')
            and lower(trim(a.first_name || ' ' || a.last_name)) = lower(trim(regexp_replace(r.opponent_label,'^#[0-9]+[[:space:]]+','')))
          limit 1
        ) opponent_a on true
      ), numbered as (
        select *, row_number() over (
          partition by credited_team_id, type, minute, coalesce(player_id::text,opponent_label, id::text), recorded_team
          order by id) as occurrence from resolved
      )
      select distinct on (credited_team_id,type,minute,coalesce(player_id::text,opponent_label,id::text),occurrence)
        id::text as id, type, minute, credited_team_id::text as team_id,
        player_name, detail, player_id::text as player_id
      from numbered
      order by credited_team_id,type,minute,coalesce(player_id::text,opponent_label,id::text),occurrence,
        case when recorded_team='own' then 0 else 1 end,id
    `);
    const events = rows.rows
      .map((row) => ({
        id: String(row.id),
        type: String(row.type),
        minute: Number(row.minute),
        teamId: typeof row.team_id === 'string' ? row.team_id : null,
        playerName:
          typeof row.player_name === 'string' && row.player_name
            ? row.player_name
            : 'Unknown player',
        // Do not expose raw detail, which can include internal identifiers or private notes.
        playerId: typeof row.player_id === 'string' ? row.player_id : null,
      }))
      .sort((a, b) => a.minute - b.minute || a.id.localeCompare(b.id));
    return {
      fixtureId,
      homeScore: fixture.homeScore,
      awayScore: fixture.awayScore,
      hasReport: events.length > 0,
      events,
    };
  }

  async listFixtures(userId: string, competitionId: string) {
    const [competition] = await this.databaseService.database
      .select({ id: competitions.id })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);
    if (!competition) throw new NotFoundException('Competition not found.');
    return this.databaseService.database
      .select()
      .from(competitionFixtures)
      .where(eq(competitionFixtures.competitionId, competitionId))
      .orderBy(
        asc(competitionFixtures.stage),
        asc(competitionFixtures.round),
        asc(competitionFixtures.position),
      );
  }

  async acceptFixtureSchedule(
    userId: string,
    competitionId: string,
    fixtureId: string,
    dto: FixtureScheduleAcceptDto,
  ) {
    const context = await this.requireFixtureScheduleContext(
      competitionId,
      fixtureId,
    );
    const actor = await this.resolveFixtureScheduleActor(
      userId,
      competitionId,
      context,
      dto.competitionTeamId,
    );
    if (context.fixture.scheduleRevision !== dto.expectedRevision) {
      throw new ConflictException(
        'This fixture date changed while you were viewing it. Refresh and review the latest proposal.',
      );
    }
    const response = actor.participant.teamId
      ? ('accepted' as const)
      : ('external_confirmed' as const);
    const now = new Date();

    const [updated] = await this.databaseService.database
      .update(competitionFixtures)
      .set(
        actor.side === 'home'
          ? {
              homeScheduleResponse: response,
              homeScheduleRespondedAt: now,
              homeScheduleRespondedByUserId: userId,
              updatedAt: now,
            }
          : {
              awayScheduleResponse: response,
              awayScheduleRespondedAt: now,
              awayScheduleRespondedByUserId: userId,
              updatedAt: now,
            },
      )
      .where(
        and(
          eq(competitionFixtures.id, fixtureId),
          eq(competitionFixtures.competitionId, competitionId),
          eq(competitionFixtures.status, 'scheduled'),
          eq(competitionFixtures.scheduleRevision, dto.expectedRevision),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'This fixture changed before your confirmation was saved. Refresh and try again.',
      );
    }
    return updated;
  }

  async proposeFixtureSchedule(
    userId: string,
    competitionId: string,
    fixtureId: string,
    dto: FixtureScheduleProposalDto,
  ) {
    const context = await this.requireFixtureScheduleContext(
      competitionId,
      fixtureId,
    );
    const actor = await this.resolveFixtureScheduleActor(
      userId,
      competitionId,
      context,
      dto.competitionTeamId,
    );
    if (context.fixture.scheduleRevision !== dto.expectedRevision) {
      throw new ConflictException(
        'This fixture date changed while you were viewing it. Refresh and review the latest proposal.',
      );
    }
    const scheduledAt = new Date(dto.scheduledAt);
    const now = new Date();
    if (scheduledAt.getTime() <= now.getTime()) {
      throw new BadRequestException(
        'Choose a date and time in the future for the reschedule proposal.',
      );
    }
    if (scheduledAt.getTime() === context.fixture.scheduledAt.getTime()) {
      throw new BadRequestException(
        'Choose a different date or time for the reschedule proposal.',
      );
    }

    const response = actor.participant.teamId
      ? ('accepted' as const)
      : ('external_confirmed' as const);
    const common = {
      scheduledAt,
      scheduleRevision: sql<number>`${competitionFixtures.scheduleRevision} + 1`,
      scheduleProposedByCompetitionTeamId: actor.participant.id,
      scheduleProposalNote: dto.note?.trim() || null,
      scheduleConfirmedAt: null,
      updatedAt: now,
    };

    const [updated] = await this.databaseService.database
      .update(competitionFixtures)
      .set(
        actor.side === 'home'
          ? {
              ...common,
              homeScheduleResponse: response,
              homeScheduleRespondedAt: now,
              homeScheduleRespondedByUserId: userId,
              awayScheduleResponse: 'pending',
              awayScheduleRespondedAt: null,
              awayScheduleRespondedByUserId: null,
            }
          : {
              ...common,
              awayScheduleResponse: response,
              awayScheduleRespondedAt: now,
              awayScheduleRespondedByUserId: userId,
              homeScheduleResponse: 'pending',
              homeScheduleRespondedAt: null,
              homeScheduleRespondedByUserId: null,
            },
      )
      .where(
        and(
          eq(competitionFixtures.id, fixtureId),
          eq(competitionFixtures.competitionId, competitionId),
          eq(competitionFixtures.status, 'scheduled'),
          eq(competitionFixtures.scheduleRevision, dto.expectedRevision),
        ),
      )
      .returning();

    if (!updated) {
      throw new ConflictException(
        'This fixture changed before your proposal was saved. Refresh and try again.',
      );
    }
    return updated;
  }

  async generateFixtures(
    userId: string,
    competitionId: string,
    regenerate = false,
    timezone?: string,
  ) {
    const competition = await this.requireAdmin(userId, competitionId);
    const participants = await this.listParticipants(competitionId);
    const scheduleTimezone = timezone ?? competition.scheduleTimezone;
    const plan = planFixtures(
      competition,
      participants.map((row) => row.id),
      new Date(),
      scheduleTimezone,
    );
    // The function locks the competition, rechecks the inputs and writes the
    // whole plan atomically. This works with Neon's HTTP driver.
    const expected = Object.fromEntries(
      ['type', ...settingKeys].map((key) => [
        key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`),
        competition[key as keyof typeof competition],
      ]),
    );
    expected.schedule_timezone = competition.scheduleTimezone;
    try {
      await this.databaseService.database
        .execute(sql`select generate_competition_fixtures(
        ${competitionId}::uuid, ${userId}::text, ${JSON.stringify(expected)}::jsonb,
        ${JSON.stringify(participants.map((row) => row.id))}::jsonb,
        ${JSON.stringify(plan)}::jsonb, ${regenerate}::boolean,
        ${scheduleTimezone}::text)`);
    } catch (error) {
      this.rethrowFixtureGuard(error);
      if (isUniqueViolation(error))
        throw new ConflictException('Fixtures already exist.');
      throw error;
    }
    const fixtures = await this.listFixtures(userId, competitionId);
    if (twoSidedLiveLoggingEnabled()) {
      for (const fixture of fixtures) {
        await ensureCompetitionFixtureSession(this.databaseService, fixture.id);
      }
      return this.listFixtures(userId, competitionId);
    }
    return fixtures;
  }

  private async requireFixtureScheduleContext(
    competitionId: string,
    fixtureId: string,
  ) {
    const [competition] = await this.databaseService.database
      .select({ archivedAt: competitions.archivedAt })
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);
    if (competition?.archivedAt)
      throw new ConflictException('This competition is archived.');
    const [fixture] = await this.databaseService.database
      .select()
      .from(competitionFixtures)
      .where(
        and(
          eq(competitionFixtures.id, fixtureId),
          eq(competitionFixtures.competitionId, competitionId),
        ),
      )
      .limit(1);

    if (!fixture) {
      throw new NotFoundException('Competition fixture not found.');
    }
    if (fixture.status !== 'scheduled') {
      throw new ConflictException(
        'Only scheduled fixtures can change their match date.',
      );
    }
    if (!fixture.homeCompetitionTeamId || !fixture.awayCompetitionTeamId) {
      throw new ConflictException(
        'Both teams must be known before the fixture date can be confirmed.',
      );
    }

    const [startedMatch] = await this.databaseService.database
      .select({ id: matches.id })
      .from(events)
      .innerJoin(matches, eq(matches.eventId, events.id))
      .where(eq(events.competitionFixtureId, fixtureId))
      .limit(1);
    if (startedMatch) {
      throw new ConflictException(
        'The fixture date cannot change after either team has started match setup.',
      );
    }

    const participants = await this.databaseService.database
      .select({
        id: competitionTeams.id,
        teamId: competitionTeams.teamId,
        displayName: competitionTeams.displayName,
      })
      .from(competitionTeams)
      .where(
        and(
          eq(competitionTeams.competitionId, competitionId),
          inArray(competitionTeams.id, [
            fixture.homeCompetitionTeamId,
            fixture.awayCompetitionTeamId,
          ]),
        ),
      );
    const byId = new Map(
      participants.map((participant) => [participant.id, participant]),
    );
    const home = byId.get(fixture.homeCompetitionTeamId);
    const away = byId.get(fixture.awayCompetitionTeamId);
    if (!home || !away) {
      throw new ConflictException(
        'Fixture participants are no longer available.',
      );
    }

    return { fixture, home, away };
  }

  private async resolveFixtureScheduleActor(
    userId: string,
    competitionId: string,
    context: FixtureScheduleContext,
    requestedCompetitionTeamId?: string,
  ) {
    const sides = [
      { side: 'home' as const, participant: context.home },
      { side: 'away' as const, participant: context.away },
    ];

    if (requestedCompetitionTeamId) {
      const target = sides.find(
        ({ participant }) => participant.id === requestedCompetitionTeamId,
      );
      if (!target) {
        throw new BadRequestException(
          'That team is not participating in this fixture.',
        );
      }
      if (target.participant.teamId === null) {
        await this.requireAdmin(userId, competitionId);
        return target;
      }
      const team = await this.requireCoachTeam(userId);
      if (team.id !== target.participant.teamId) {
        throw new ForbiddenException(
          'Only that linked team’s coach can respond for this fixture.',
        );
      }
      return target;
    }

    const team = await this.requireCoachTeam(userId);
    const target = sides.find(
      ({ participant }) => participant.teamId === team.id,
    );
    if (!target) {
      throw new ForbiddenException(
        'Your team is not participating in this fixture.',
      );
    }
    return target;
  }

  private async requireAdmin(
    userId: string,
    competitionId: string,
    allowArchived = false,
  ) {
    const [competition] = await this.databaseService.database
      .select()
      .from(competitions)
      .where(eq(competitions.id, competitionId))
      .limit(1);

    if (!competition || competition.adminUserId !== userId) {
      throw new NotFoundException('Competition not found.');
    }

    if (competition.archivedAt && !allowArchived) {
      throw new ConflictException(
        'This competition is archived. Restore it before making changes.',
      );
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
      this.rethrowFixtureGuard(error);
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
        displayName: sql<string>`coalesce(${teams.name}, ${competitionTeams.displayName})`,
        originalDisplayName: competitionTeams.originalDisplayName,
        teamId: competitionTeams.teamId,
        createdAt: competitionTeams.createdAt,
      })
      .from(competitionTeams)
      .leftJoin(teams, eq(competitionTeams.teamId, teams.id))
      .where(eq(competitionTeams.competitionId, competitionId))
      .orderBy(asc(competitionTeams.createdAt), asc(competitionTeams.id));

    return rows;
  }
}
