import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import {
  competitions,
  competitionTeams,
  competitionInvites,
} from '../database/schema';
import { sendCompetitionInviteEmail } from '../email/email';
import { TeamsService } from '../teams/teams.service';
import {
  competitionInviteTokenSchema,
  createCompetitionInviteSchema,
} from './competition-invites.schemas';

const TTL_MS = 72 * 60 * 60 * 1000;
const hashToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const invalidInvite = () =>
  new NotFoundException('This invite link is no longer valid.');

@Injectable()
export class CompetitionInvitesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  async createInvite(
    competitionTeamId: string,
    email: string,
    createdByUserId: string,
  ) {
    email = createCompetitionInviteSchema.shape.email.parse(email);
    const db = this.databaseService.database;
    const [slot] = await db
      .select({
        teamId: competitionTeams.teamId,
        adminUserId: competitions.adminUserId,
      })
      .from(competitionTeams)
      .innerJoin(
        competitions,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(eq(competitionTeams.id, competitionTeamId))
      .limit(1);
    if (!slot || slot.adminUserId !== createdByUserId)
      throw new NotFoundException('Participant not found.');
    if (slot.teamId)
      throw new ConflictException(
        'This participant is already linked to a team.',
      );

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + TTL_MS);
    // Neon HTTP supports atomic batch transactions, but not interactive ones.
    // Lock first, then read fresh state in subsequent statements. Every invite
    // mutation takes this same slot lock, including email-failure cleanup.
    const [, , result] = await db.batch([
      db.execute(
        sql`select id from competition_teams where id = ${competitionTeamId}::uuid for update`,
      ),
      db.execute(sql`update competition_invites i set status = 'revoked', updated_at = now()
        where i.competition_team_id = ${competitionTeamId}::uuid and i.status = 'pending'
        and exists (select 1 from competition_teams ct join competitions c on c.id = ct.competition_id
          where ct.id = i.competition_team_id and ct.team_id is null and c.admin_user_id = ${createdByUserId})`),
      db.execute(sql`insert into competition_invites (competition_id, competition_team_id, email, token_hash, created_by_user_id, expires_at)
        select c.id, ct.id, ${email}, ${tokenHash}, ${createdByUserId}, ${expiresAt.toISOString()}::timestamptz
        from competition_teams ct join competitions c on c.id = ct.competition_id
        where ct.id = ${competitionTeamId}::uuid and ct.team_id is null and c.admin_user_id = ${createdByUserId}
        returning id,
          (select name from competitions where id = competition_id) as "competitionName",
          (select display_name from competition_teams where id = competition_team_id) as "teamName"`),
    ]);
    const invite = result.rows[0] as
      { id: string; competitionName: string; teamName: string } | undefined;
    if (!invite)
      throw new ConflictException('This participant is no longer available.');
    const inviteUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/join-competition/${token}`;
    try {
      await sendCompetitionInviteEmail({
        to: email,
        url: inviteUrl,
        competitionName: invite.competitionName,
        teamName: invite.teamName,
      });
    } catch (error) {
      try {
        await this.revokeInvite(invite.id, createdByUserId);
      } catch (cleanupError) {
        if (!(cleanupError instanceof NotFoundException)) throw cleanupError;
      }
      throw error;
    }
    return { token, inviteUrl, email, expiresAt };
  }

  async listInvites(competitionId: string, userId: string) {
    const db = this.databaseService.database;
    const [competition] = await db
      .select({ id: competitions.id })
      .from(competitions)
      .where(
        and(
          eq(competitions.id, competitionId),
          eq(competitions.adminUserId, userId),
        ),
      )
      .limit(1);
    if (!competition) throw new NotFoundException('Competition not found.');
    return db
      .select({
        id: competitionInvites.id,
        competitionTeamId: competitionInvites.competitionTeamId,
        email: competitionInvites.email,
        createdAt: competitionInvites.createdAt,
        expiresAt: competitionInvites.expiresAt,
      })
      .from(competitionInvites)
      .innerJoin(
        competitions,
        eq(competitions.id, competitionInvites.competitionId),
      )
      .where(
        and(
          eq(competitionInvites.competitionId, competitionId),
          eq(competitions.adminUserId, userId),
          eq(competitionInvites.status, 'pending'),
        ),
      )
      .orderBy(desc(competitionInvites.createdAt));
  }

  async revokeInvite(id: string, userId: string): Promise<void> {
    const db = this.databaseService.database;
    const [, result] = await db.batch([
      db.execute(sql`select ct.id from competition_teams ct join competition_invites i on i.competition_team_id = ct.id
        where i.id = ${id}::uuid for update of ct`),
      db.execute(sql`update competition_invites i set status = 'revoked', updated_at = now()
        where i.id = ${id}::uuid and i.status = 'pending'
        and exists (select 1 from competitions c where c.id = i.competition_id and c.admin_user_id = ${userId}) returning i.id`),
    ]);
    if (!result.rows.length) throw new NotFoundException('Invite not found.');
  }

  private async findValidInvite(token: string) {
    if (!competitionInviteTokenSchema.safeParse(token).success) return null;
    const [row] = await this.databaseService.database
      .select({
        invite: competitionInvites,
        teamId: competitionTeams.teamId,
        teamName: competitionTeams.displayName,
        competitionName: competitions.name,
      })
      .from(competitionInvites)
      .innerJoin(
        competitionTeams,
        eq(competitionTeams.id, competitionInvites.competitionTeamId),
      )
      .innerJoin(
        competitions,
        eq(competitions.id, competitionInvites.competitionId),
      )
      .where(eq(competitionInvites.tokenHash, hashToken(token)))
      .limit(1);
    if (
      !row ||
      row.invite.status !== 'pending' ||
      row.invite.expiresAt.getTime() <= Date.now()
    )
      return null;
    return row;
  }

  async preview(token: string) {
    const row = await this.findValidInvite(token);
    if (!row || row.teamId) return { valid: false };
    return {
      valid: true,
      competitionName: row.competitionName,
      teamName: row.teamName,
    };
  }

  async accept(token: string, userId: string, email: string) {
    const found = await this.findValidInvite(token);
    if (!found) throw invalidInvite();
    email = email.trim().toLowerCase();
    if (found.invite.email.trim().toLowerCase() !== email)
      throw new ForbiddenException(
        'This invite was issued to a different email address.',
      );
    if (found.teamId)
      throw new ConflictException(
        'This participant is already linked to a team.',
      );
    const existing = await this.teamsService.findTeamForUser(userId);
    if (existing && existing.role !== 'coach')
      throw new ForbiddenException(
        'Only coaches can claim a participant slot.',
      );

    const db = this.databaseService.database;
    try {
      const [, , result] = await db.batch([
        db.execute(
          sql`select id from competition_teams where id = ${found.invite.competitionTeamId}::uuid for update`,
        ),
        // Also serialize different competition invites accepted by one account.
        db.execute(sql`select id from "user" where id = ${userId} for update`),
        db.execute(sql`
          with eligible as materialized (
            select i.id, ct.id as slot_id, ct.display_name, ct.competition_id
            from competition_invites i join competition_teams ct on ct.id = i.competition_team_id and ct.competition_id = i.competition_id
            where i.token_hash = ${hashToken(token)} and i.status = 'pending'
              and i.expires_at > clock_timestamp() and lower(trim(i.email)) = ${email} and ct.team_id is null
              and not exists (select 1 from team_members m where m.user_id = ${userId} and m.role <> 'coach')
              and not exists (select 1 from competition_teams other join team_members m on m.team_id = other.team_id
                where other.competition_id = ct.competition_id and m.user_id = ${userId})
          ), new_team as (
            -- Same team + hardcoded coach membership pattern as TeamsService.createTeamForUser,
            -- inside this transaction so a failed claim never leaves an orphan team.
            insert into teams (name) select display_name from eligible
            where not exists (select 1 from team_members where user_id = ${userId}) returning id
          ), new_member as (
            insert into team_members (team_id, user_id, role)
            select id, ${userId}, 'coach' from new_team returning team_id
          ), resolved_team as (
            select team_id from new_member
            union all select team_id from team_members where user_id = ${userId} and role = 'coach'
          ), linked as (
            update competition_teams ct set team_id = rt.team_id, updated_at = now()
            from eligible e, resolved_team rt where ct.id = e.slot_id and ct.team_id is null
            returning ct.team_id, ct.competition_id
          )
          update competition_invites i set status = 'used', used_at = now(), used_by_user_id = ${userId}, updated_at = now()
          from eligible e, linked l where i.id = e.id and i.status = 'pending'
          returning l.team_id as "teamId", l.competition_id as "competitionId"
        `),
      ]);
      const linked = result.rows[0] as
        { teamId: string; competitionId: string } | undefined;
      if (!linked)
        throw new ConflictException(
          'This invite or participant is no longer available, or your team already participates.',
        );
      return { joined: true, ...linked };
    } catch (error: unknown) {
      const candidates = [error, (error as { cause?: unknown })?.cause];
      if (
        candidates.some(
          (e) =>
            typeof e === 'object' &&
            e !== null &&
            'code' in e &&
            e.code === '23505',
        )
      ) {
        throw new ConflictException(
          'This account already has a team or the team already participates in this competition.',
        );
      }
      throw error;
    }
  }
}
