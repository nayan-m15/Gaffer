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
  teamMembers,
  teams,
  athletes,
  user,
} from '../database/schema';
import {
  sendCompetitionInviteEmail,
  sendCompetitionTeamReviewEmail,
  sendCompetitionTeamReviewOutcomeEmail,
  sendCompetitionRepresentativeCorrectionEmail,
} from '../email/email';
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
  constructor(private readonly databaseService: DatabaseService) {}

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
        competitionType: competitions.type,
      })
      .from(competitionTeams)
      .innerJoin(
        competitions,
        eq(competitionTeams.competitionId, competitions.id),
      )
      .where(eq(competitionTeams.id, competitionTeamId))
      .limit(1);
    if (
      !slot ||
      slot.adminUserId !== createdByUserId ||
      slot.competitionType === 'friendly'
    )
      throw new NotFoundException('Participant not found.');
    if (slot.teamId)
      throw new ConflictException(
        'This participant is already linked to a team.',
      );

    const [verification] = await db
      .select({ id: competitionInvites.id })
      .from(competitionInvites)
      .where(
        and(
          eq(competitionInvites.competitionTeamId, competitionTeamId),
          eq(competitionInvites.status, 'verification'),
        ),
      )
      .limit(1);
    if (verification)
      throw new ConflictException(
        'Resolve the outstanding team verification before resending an invitation.',
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
          and not exists (select 1 from competition_invites i where i.competition_team_id = ct.id and i.status = 'verification')
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
        status: competitionInvites.status,
        proposedName: competitionInvites.proposedName,
        requestedByUserId: competitionInvites.requestedByUserId,
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
          sql`${competitionInvites.status} in ('pending', 'verification')`,
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
        where i.id = ${id}::uuid and i.status in ('pending','verification')
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
        competitionType: competitions.type,
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
      row.competitionType === 'friendly' ||
      (row.invite.status !== 'pending' &&
        row.invite.status !== 'verification') ||
      (row.invite.status === 'pending' &&
        row.invite.expiresAt.getTime() <= Date.now())
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
      awaitingApproval: row.invite.status === 'verification',
    };
  }

  /** Only the invited address may inspect its possible connections. Team IDs
   * come from server-side memberships; claimed athletes never grant authority. */
  async eligibleTeams(token: string, userId: string, email: string) {
    const found = await this.findValidInvite(token);
    if (!found || found.teamId) throw invalidInvite();
    if (found.invite.email.trim().toLowerCase() !== email.trim().toLowerCase())
      throw new ForbiddenException(
        'This invite was issued to a different email address.',
      );
    const db = this.databaseService.database;
    const memberships = await db
      .select({ id: teams.id, name: teams.name, role: teamMembers.role })
      .from(teamMembers)
      .innerJoin(teams, eq(teams.id, teamMembers.teamId))
      .where(eq(teamMembers.userId, userId));
    const playerTeams = await db
      .select({ teamId: athletes.teamId, teamName: teams.name })
      .from(athletes)
      .innerJoin(teams, eq(teams.id, athletes.teamId))
      .where(eq(athletes.userId, userId));
    if (memberships.length > 1)
      throw new ConflictException(
        'This account has multiple team memberships. Contact support.',
      );
    return {
      teams: memberships,
      playerTeams: playerTeams.filter(
        (p) => !memberships.some((m) => m.id === p.teamId),
      ),
      canCreateTeam: memberships.length === 0 && playerTeams.length === 0,
      awaitingApproval: found.invite.status === 'verification',
    };
  }

  /** Explicit representative confirmation; name disagreements are reviewed by the admin. */
  async accept(
    token: string,
    userId: string,
    email: string,
    confirmed: true,
    teamName?: string,
  ) {
    if (confirmed !== true)
      throw new ForbiddenException('Confirm the team before accepting.');
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
    if (found.invite.status === 'verification') {
      if (found.invite.requestedByUserId === userId)
        return { awaitingApproval: true };
      throw new ConflictException(
        'This participant is awaiting administrator verification.',
      );
    }
    const options = await this.eligibleTeams(token, userId, email);
    // Gaffer supports only one team membership per account. Fail closed if
    // inconsistent data is encountered instead of choosing an arbitrary team.
    if (options.teams.length > 1)
      throw new ConflictException(
        'This account has multiple team memberships. Contact support.',
      );
    const existing = options.teams[0];
    if (!existing && !options.canCreateTeam)
      throw new ForbiddenException(
        'Players cannot connect teams to competitions. Ask the administrator to invite an authorized coach or assistant.',
      );
    const proposedName = existing?.name ?? teamName?.trim();
    if (!proposedName)
      throw new ConflictException('Enter your team name before accepting.');
    const mismatch =
      proposedName.toLocaleLowerCase() !==
      found.teamName.trim().toLocaleLowerCase();
    const db = this.databaseService.database;
    try {
      const [, , result] = await db.batch([
        db.execute(
          sql`select id from competition_teams where id = ${found.invite.competitionTeamId}::uuid for update`,
        ),
        db.execute(sql`select id from "user" where id = ${userId} for update`),
        db.execute(sql`
          with eligible as materialized (
            select i.id, ct.id as slot_id, ct.display_name, ct.competition_id
            from competition_invites i join competition_teams ct on ct.id = i.competition_team_id and ct.competition_id = i.competition_id
            where i.token_hash = ${hashToken(token)} and i.status = 'pending'
              and i.expires_at > clock_timestamp() and lower(trim(i.email)) = ${email} and ct.team_id is null
              and ((${existing?.id ?? null}::uuid is not null and exists (
                select 1 from team_members m where m.user_id = ${userId} and m.team_id = ${existing?.id ?? null}::uuid))
                or (${existing?.id ?? null}::uuid is null and not exists (
                  select 1 from team_members m where m.user_id = ${userId})
                  and not exists (select 1 from athletes a where a.user_id = ${userId})))
              and not exists (select 1 from competition_teams other
                where other.competition_id = ct.competition_id and other.team_id = ${existing?.id ?? null}::uuid)
              and (${existing?.id ?? null}::uuid is not null or not exists (
                select 1 from competition_teams other join team_members m on m.team_id = other.team_id
                where other.competition_id = ct.competition_id and m.user_id = ${userId}))
              and not exists (select 1 from competition_invites v where v.competition_id = ct.competition_id
                and v.status = 'verification' and v.requested_by_user_id = ${userId})
              and not exists (select 1 from competition_invites v where v.competition_id = ct.competition_id
                and v.status = 'verification' and v.proposed_team_id is not null and v.proposed_team_id = ${existing?.id ?? null}::uuid)
              and (not ${mismatch}::boolean or not exists (
                select 1 from competition_teams other where other.competition_id = ct.competition_id
                  and other.id <> ct.id and lower(other.display_name) = lower(${proposedName})))
          ), requested as (
            update competition_invites i set status = 'verification', proposed_name = ${proposedName},
              proposed_team_id = ${existing?.id ?? null}::uuid, requested_by_user_id = ${userId}, updated_at = now()
            from eligible e where i.id = e.id and ${mismatch}::boolean returning i.id
          ), new_team as (
            insert into teams (name) select ${proposedName} from eligible
            where not ${mismatch}::boolean and not exists (select 1 from team_members where user_id = ${userId})
            returning id
          ), new_member as (
            insert into team_members (team_id, user_id, role)
            select id, ${userId}, 'coach' from new_team returning team_id
          ), resolved_team as (
            select team_id from new_member
            union all select team_id from team_members where user_id = ${userId} and team_id = ${existing?.id ?? null}::uuid
          ), linked as (
            update competition_teams ct set team_id = rt.team_id, original_display_name = ct.display_name,
              display_name = ${proposedName}, updated_at = now()
            from eligible e, resolved_team rt where ct.id = e.slot_id and ct.team_id is null
              and not ${mismatch}::boolean
            returning ct.team_id, ct.competition_id
          ), used as (
            update competition_invites i set status = 'used', used_at = now(), used_by_user_id = ${userId}, updated_at = now()
            from eligible e, linked l where i.id = e.id and i.status = 'pending'
            returning l.team_id, l.competition_id
          )
          select (select id from requested limit 1) as "requestId",
            (select team_id from used limit 1) as "teamId",
            (select competition_id from used limit 1) as "competitionId"
        `),
      ]);
      const row = result.rows[0] as
        | {
            requestId: string | null;
            teamId: string | null;
            competitionId: string | null;
          }
        | undefined;
      if (row?.requestId) {
        try {
          const [admin] = await db
            .select({ email: user.email })
            .from(competitions)
            .innerJoin(user, eq(competitions.adminUserId, user.id))
            .where(eq(competitions.id, found.invite.competitionId))
            .limit(1);
          if (admin?.email)
            await sendCompetitionTeamReviewEmail({
              to: admin.email,
              competitionName: found.competitionName,
              invitedName: found.teamName,
              proposedName,
              url: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/competitions/${found.invite.competitionId}`,
            });
        } catch {
          /* The dashboard still shows the persisted review request. */
        }
        return { awaitingApproval: true };
      }
      if (!row?.teamId)
        throw new ConflictException(
          'This invitation or team is no longer available, or the team name conflicts with another participant.',
        );
      return {
        joined: true,
        teamId: row.teamId,
        competitionId: row.competitionId,
      };
    } catch (error: unknown) {
      if (this.isUniqueViolation(error))
        throw new ConflictException(
          'This account or team already participates, or the team name conflicts.',
        );
      throw error;
    }
  }

  /** A player can ask the administrator for a corrected invitation without
   * being allowed to claim the participant. Revoke under the same slot lock as
   * other invitation transitions to make retries idempotently fail. */
  async requestRepresentativeInvite(
    token: string,
    userId: string,
    email: string,
  ) {
    const found = await this.findValidInvite(token);
    if (!found || found.teamId || found.invite.status !== 'pending')
      throw invalidInvite();
    const eligible = await this.eligibleTeams(token, userId, email);
    if (eligible.teams.length || !eligible.playerTeams.length)
      throw new ForbiddenException(
        'Only invited players can request an authorized representative invitation.',
      );
    const db = this.databaseService.database;
    const [, result] = await db.batch([
      db.execute(
        sql`select id from competition_teams where id = ${found.invite.competitionTeamId}::uuid for update`,
      ),
      db.execute(sql`update competition_invites i set status = 'revoked', updated_at = now()
        where i.id = ${found.invite.id}::uuid and i.status = 'pending' and i.expires_at > clock_timestamp()
          and lower(trim(i.email)) = ${email.trim().toLowerCase()}
          and exists (select 1 from athletes a where a.user_id = ${userId})
          and not exists (select 1 from team_members m where m.user_id = ${userId})
        returning i.id`),
    ]);
    if (!result.rows.length)
      throw new ConflictException('This invitation is no longer available.');
    const [admin] = await db
      .select({ email: user.email })
      .from(competitions)
      .innerJoin(user, eq(competitions.adminUserId, user.id))
      .where(eq(competitions.id, found.invite.competitionId))
      .limit(1);
    if (!admin?.email) return { requested: true, emailSent: false };
    try {
      await sendCompetitionRepresentativeCorrectionEmail({
        to: admin.email,
        competitionName: found.competitionName,
        teamName: found.teamName,
        recipientEmail: found.invite.email,
        url: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/competitions/${found.invite.competitionId}`,
      });
      return { requested: true, emailSent: true };
    } catch {
      // The original link has been revoked for safety; provide an honest
      // delivery result instead of claiming that the admin was notified.
      return { requested: true, emailSent: false };
    }
  }

  /** A recipient may decline a pending invite or withdraw their own review request. */
  async decline(token: string, userId: string, email: string) {
    const found = await this.findValidInvite(token);
    if (!found) throw invalidInvite();
    if (found.invite.email.trim().toLowerCase() !== email.trim().toLowerCase())
      throw new ForbiddenException(
        'This invite was issued to a different email address.',
      );
    if (
      found.invite.status === 'verification' &&
      found.invite.requestedByUserId !== userId
    )
      throw new ForbiddenException(
        'Only the requesting representative can withdraw a verification request.',
      );
    const [, result] = await this.databaseService.database.batch([
      this.databaseService.database.execute(
        sql`select id from competition_teams where id = ${found.invite.competitionTeamId}::uuid for update`,
      ),
      this.databaseService.database
        .execute(sql`update competition_invites set status = 'revoked', updated_at = now()
        where id = ${found.invite.id}::uuid and status in ('pending', 'verification')
          and (status = 'pending' or requested_by_user_id = ${userId}) returning id`),
    ]);
    if (!result.rows.length)
      throw new ConflictException('This invitation is no longer available.');
    return { declined: true };
  }

  /** Admin approval is the only path for mismatched names. Revalidate team ownership
   * and competition membership under locks; never trust the earlier proposal alone. */
  async resolveVerification(
    inviteId: string,
    adminId: string,
    approve: boolean,
  ) {
    const db = this.databaseService.database;
    const [request] = await db
      .select({
        slotId: competitionInvites.competitionTeamId,
        requestedBy: competitionInvites.requestedByUserId,
        status: competitionInvites.status,
        adminUserId: competitions.adminUserId,
      })
      .from(competitionInvites)
      .innerJoin(
        competitions,
        eq(competitionInvites.competitionId, competitions.id),
      )
      .where(eq(competitionInvites.id, inviteId))
      .limit(1);
    if (
      !request ||
      request.adminUserId !== adminId ||
      request.status !== 'verification' ||
      !request.requestedBy
    )
      throw new NotFoundException('Verification request not found.');
    if (!approve) {
      const [, result] = await db.batch([
        db.execute(
          sql`select id from competition_teams where id = ${request.slotId}::uuid for update`,
        ),
        db.execute(sql`update competition_invites set status = 'revoked', updated_at = now()
          where id = ${inviteId}::uuid and status = 'verification' returning id`),
      ]);
      if (!result.rows.length)
        throw new ConflictException('Verification was already resolved.');
      await this.emailReviewOutcome(inviteId, false);
      return { rejected: true };
    }
    try {
      const [, , result] = await db.batch([
        db.execute(
          sql`select id from competition_teams where id = ${request.slotId}::uuid for update`,
        ),
        db.execute(
          sql`select id from "user" where id = ${request.requestedBy} for update`,
        ),
        db.execute(sql`
          with eligible as materialized (
            select i.id, i.proposed_name, i.proposed_team_id, i.requested_by_user_id, ct.id as slot_id, ct.competition_id
            from competition_invites i join competition_teams ct on ct.id = i.competition_team_id and ct.competition_id = i.competition_id
            join competitions c on c.id = ct.competition_id
            where i.id = ${inviteId}::uuid and i.status = 'verification' and c.admin_user_id = ${adminId}
              and ct.team_id is null and i.proposed_name is not null and i.requested_by_user_id is not null
              and (i.proposed_team_id is not null or not exists (
                select 1 from athletes a where a.user_id = i.requested_by_user_id))
              and not exists (select 1 from competition_teams other
                where other.competition_id = ct.competition_id and other.team_id = i.proposed_team_id)
              and (i.proposed_team_id is not null or not exists (
                select 1 from competition_teams other join team_members m on m.team_id = other.team_id
                where other.competition_id = ct.competition_id and m.user_id = i.requested_by_user_id))
              and not exists (select 1 from competition_teams other where other.competition_id = ct.competition_id
                and other.id <> ct.id and lower(other.display_name) = lower(i.proposed_name))
              and (i.proposed_team_id is null and not exists (select 1 from team_members m where m.user_id = i.requested_by_user_id)
                or i.proposed_team_id is not null and exists (select 1 from team_members m join teams t on t.id = m.team_id
                  where m.user_id = i.requested_by_user_id and m.team_id = i.proposed_team_id
                    and lower(t.name) = lower(i.proposed_name)))
          ), new_team as (
            insert into teams (name) select proposed_name from eligible where proposed_team_id is null returning id
          ), new_member as (
            insert into team_members (team_id, user_id, role)
            select t.id, e.requested_by_user_id, 'coach' from new_team t cross join eligible e returning team_id
          ), resolved as (
            select team_id from new_member
            union all select proposed_team_id from eligible where proposed_team_id is not null
          ), linked as (
            update competition_teams ct set team_id = r.team_id, original_display_name = ct.display_name,
              display_name = e.proposed_name, updated_at = now()
            from eligible e, resolved r where ct.id = e.slot_id and ct.team_id is null
            returning ct.team_id, ct.competition_id
          )
          update competition_invites i set status = 'used', used_at = now(),
            used_by_user_id = e.requested_by_user_id, updated_at = now()
          from eligible e, linked l where i.id = e.id and i.status = 'verification'
          returning l.team_id as "teamId", l.competition_id as "competitionId"
        `),
      ]);
      if (!result.rows.length)
        throw new ConflictException(
          'Verification cannot be completed. Check team membership and name conflicts.',
        );
      await this.emailReviewOutcome(inviteId, true);
      return { approved: true };
    } catch (error: unknown) {
      if (this.isUniqueViolation(error))
        throw new ConflictException(
          'This team already participates or its name conflicts.',
        );
      throw error;
    }
  }

  private async emailReviewOutcome(inviteId: string, approved: boolean) {
    try {
      const [row] = await this.databaseService.database
        .select({
          to: competitionInvites.email,
          name: competitionInvites.proposedName,
          competitionName: competitions.name,
          competitionId: competitions.id,
        })
        .from(competitionInvites)
        .innerJoin(
          competitions,
          eq(competitionInvites.competitionId, competitions.id),
        )
        .where(eq(competitionInvites.id, inviteId))
        .limit(1);
      if (row?.name)
        await sendCompetitionTeamReviewOutcomeEmail({
          to: row.to,
          competitionName: row.competitionName,
          teamName: row.name,
          approved,
          url: `${process.env.FRONTEND_URL ?? 'http://localhost:5173'}/competitions/${row.competitionId}`,
        });
    } catch {
      /* Review completion remains committed even if mail delivery fails. */
    }
  }

  private isUniqueViolation(error: unknown) {
    return [error, (error as { cause?: unknown })?.cause].some(
      (e) =>
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        e.code === '23505',
    );
  }
}
