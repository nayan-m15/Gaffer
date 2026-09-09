import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, gte, lte, ne, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { events, seasons } from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { seasonWindow, type SeasonWindow } from './season-window';
import type { CreateSeasonDto, UpdateSeasonDto } from './seasons.schemas';

export type SeasonRow = typeof seasons.$inferSelect;

/** Postgres unique-constraint violation — backstop for the single-current-season index. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

/**
 * Qualified reference to a column of the OUTER `seasons` row.
 *
 * Drizzle only writes table-qualified names inside an `sql` template when the
 * surrounding query has more than one table. `listSeasons` selects from
 * `seasons` alone, so an interpolated `seasons.teamId` would render as a bare
 * `"team_id"` and bind to the subquery's own `events` row instead — silently
 * turning the correlation into `"team_id" = "team_id"` and counting every
 * team's matches. Naming the table explicitly keeps the correlation intact.
 */
function outerSeason(column: 'team_id' | 'start_date' | 'end_date') {
  return sql`${sql.identifier('seasons')}.${sql.identifier(column)}`;
}

/**
 * Counts completed matches whose event falls inside the season's date range.
 * Correlated to the outer `seasons` row so the list endpoint can show a coach
 * which seasons actually cover any matches.
 *
 * Bounds are interpreted in UTC to match `seasonWindow`, rather than relying on
 * the session timezone for the implicit date -> timestamptz cast. Unqualified
 * column names below bind to the subquery's `events` table.
 */
export const matchCount = sql<number>`coalesce((
  select count(*)::int
  from ${events}
  where ${events.teamId} = ${outerSeason('team_id')}
    and ${events.type} = 'match'
    and ${events.status} = 'completed'
    and ${events.scheduledAt} >= (${outerSeason('start_date')}::timestamp at time zone 'UTC')
    and ${events.scheduledAt} < ((${outerSeason('end_date')}::date + 1)::timestamp at time zone 'UTC')
), 0)`;

/**
 * Coach-defined seasons: the date ranges that group matches for season-level
 * statistics.
 *
 * Two invariants are enforced here rather than in Zod, because both depend on
 * rows already in the database: season ranges may not overlap within a team,
 * and at most one season per team is flagged current.
 */
@Injectable()
export class SeasonsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  /* ── Reads ──────────────────────────────────────────────────────────────── */

  async listSeasons(userId: string) {
    const team = await this.requireTeam(userId);

    return this.databaseService.database
      .select({
        id: seasons.id,
        teamId: seasons.teamId,
        name: seasons.name,
        startDate: seasons.startDate,
        endDate: seasons.endDate,
        isCurrent: seasons.isCurrent,
        matchCount,
        createdAt: seasons.createdAt,
        updatedAt: seasons.updatedAt,
      })
      .from(seasons)
      .where(eq(seasons.teamId, team.id))
      .orderBy(desc(seasons.startDate));
  }

  /**
   * Resolves a season to the instant range statistics queries filter on.
   * Throws 404 for a season on another team, so cross-team requests fail
   * loudly instead of silently returning an empty overview.
   */
  async resolveSeasonWindow(
    teamId: string,
    seasonId: string,
  ): Promise<{ season: SeasonRow; window: SeasonWindow }> {
    const season = await this.requireSeason(teamId, seasonId);
    return { season, window: seasonWindow(season.startDate, season.endDate) };
  }

  /* ── Mutations ──────────────────────────────────────────────────────────── */

  async createSeason(userId: string, dto: CreateSeasonDto) {
    const team = await this.requireTeam(userId);
    await this.assertNoOverlap(team.id, dto.startDate, dto.endDate);

    // Demote the existing current season first: the partial unique index would
    // otherwise reject this insert.
    if (dto.isCurrent) {
      await this.clearCurrentFlag(team.id);
    }

    try {
      const [season] = await this.databaseService.database
        .insert(seasons)
        .values({ teamId: team.id, ...dto })
        .returning();

      return season;
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async updateSeason(userId: string, seasonId: string, dto: UpdateSeasonDto) {
    const team = await this.requireTeam(userId);
    const existing = await this.requireSeason(team.id, seasonId);

    // Zod only sees the fields in the request, so re-check the range against
    // the merged result — a request moving just one end can still invert it.
    const startDate = dto.startDate ?? existing.startDate;
    const endDate = dto.endDate ?? existing.endDate;

    if (startDate >= endDate) {
      throw new ConflictException(
        'Season end date must be after the start date.',
      );
    }

    if (dto.startDate !== undefined || dto.endDate !== undefined) {
      await this.assertNoOverlap(team.id, startDate, endDate, seasonId);
    }

    if (dto.isCurrent) {
      await this.clearCurrentFlag(team.id, seasonId);
    }

    try {
      const [season] = await this.databaseService.database
        .update(seasons)
        .set({ ...dto, updatedAt: new Date() })
        .where(and(eq(seasons.id, seasonId), eq(seasons.teamId, team.id)))
        .returning();

      return season;
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  /** Competitions linked to the season are unlinked, not deleted (FK is `set null`). */
  async deleteSeason(userId: string, seasonId: string) {
    const team = await this.requireTeam(userId);
    await this.requireSeason(team.id, seasonId);

    await this.databaseService.database
      .delete(seasons)
      .where(and(eq(seasons.id, seasonId), eq(seasons.teamId, team.id)));

    return { success: true };
  }

  /* ── Private helpers ────────────────────────────────────────────────────── */

  private async requireTeam(userId: string) {
    const team = await this.teamsService.findTeamForUser(userId);
    if (!team) {
      throw new ForbiddenException('No team associated with this account.');
    }
    return team;
  }

  private async requireSeason(
    teamId: string,
    seasonId: string,
  ): Promise<SeasonRow> {
    const [season] = await this.databaseService.database
      .select()
      .from(seasons)
      .where(and(eq(seasons.id, seasonId), eq(seasons.teamId, teamId)))
      .limit(1);

    if (!season) {
      throw new NotFoundException('Season not found.');
    }

    return season;
  }

  /**
   * Two ranges overlap when each starts on or before the other ends. Checked
   * before the write rather than by a constraint, so there is a small
   * check-then-write race — acceptable given a season is created rarely and by
   * a single coach.
   */
  private async assertNoOverlap(
    teamId: string,
    startDate: string,
    endDate: string,
    excludeSeasonId?: string,
  ): Promise<void> {
    const conditions = [
      eq(seasons.teamId, teamId),
      lte(seasons.startDate, endDate),
      gte(seasons.endDate, startDate),
    ];
    if (excludeSeasonId) {
      conditions.push(ne(seasons.id, excludeSeasonId));
    }

    const [clash] = await this.databaseService.database
      .select({ id: seasons.id, name: seasons.name })
      .from(seasons)
      .where(and(...conditions))
      .limit(1);

    if (clash) {
      throw new ConflictException(
        `Seasons cannot overlap. These dates clash with "${clash.name}".`,
      );
    }
  }

  /**
   * Demotes the team's current season. Runs as a separate statement from the
   * insert/update that promotes the new one because neon-http has no
   * interactive transactions; the partial unique index is the real guarantee
   * that only one season is ever current.
   */
  private async clearCurrentFlag(
    teamId: string,
    excludeSeasonId?: string,
  ): Promise<void> {
    const conditions = [
      eq(seasons.teamId, teamId),
      eq(seasons.isCurrent, true),
    ];
    if (excludeSeasonId) {
      conditions.push(ne(seasons.id, excludeSeasonId));
    }

    await this.databaseService.database
      .update(seasons)
      .set({ isCurrent: false, updatedAt: new Date() })
      .where(and(...conditions));
  }

  private rethrowWriteError(error: unknown): never {
    if (isUniqueViolation(error)) {
      throw new ConflictException(
        'A season with these details already exists for this team.',
      );
    }
    throw error;
  }
}
