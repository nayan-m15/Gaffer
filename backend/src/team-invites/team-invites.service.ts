import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { teamInvites, teams } from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { teamInviteTokenSchema } from './team-invites.schemas';

// Invites are fixed at 72 hours for v1 — not configurable per invite.
const TEAM_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

export interface TeamInvitePreview {
  valid: boolean;
  teamName?: string;
}

export interface TeamInviteSummary {
  id: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
}

// Only sha256(token) is ever persisted, mirroring a password-reset token —
// the raw token is shown to the coach exactly once and can never be
// retrieved or logged again. Lookup is by hash equality in SQL, so no
// constant-time comparison is needed.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Pending and unexpired. Expired, used, and revoked invites are all equally
// invalid — callers must never distinguish between them.
function isUsableInvite(invite: { status: string; expiresAt: Date }): boolean {
  return invite.status === 'pending' && invite.expiresAt.getTime() > Date.now();
}

/**
 * Assistant-invite lifecycle, mirroring ClaimsService: a coach generates a
 * one-time link bound to an email address; the invited person signs in (or
 * signs up) with a matching email and accepts to join the team with the
 * role hardcoded to `assistant`.
 */
@Injectable()
export class TeamInvitesService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Generates a one-time assistant invite for the given email, revoking any
   * pending invite for the same (team, email) pair first so at most one is
   * active at a time. The raw token appears only in this method's response —
   * it is never stored.
   */
  async createInvite(
    teamId: string,
    email: string,
    createdByUserId: string,
  ): Promise<{
    token: string;
    inviteUrl: string;
    email: string;
    expiresAt: Date;
  }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + TEAM_INVITE_TTL_MS);

    await this.revokePendingInvites(teamId, email);

    await this.databaseService.database.insert(teamInvites).values({
      teamId,
      email,
      tokenHash: hashToken(token),
      createdByUserId,
      expiresAt,
    });

    return {
      token,
      inviteUrl: `${FRONTEND_URL}/join-team/${token}`,
      email,
      expiresAt,
    };
  }

  /** Lists the team's pending invites, newest first, for the coach's management card. */
  async listInvites(teamId: string): Promise<TeamInviteSummary[]> {
    return this.databaseService.database
      .select({
        id: teamInvites.id,
        email: teamInvites.email,
        createdAt: teamInvites.createdAt,
        expiresAt: teamInvites.expiresAt,
      })
      .from(teamInvites)
      .where(
        and(eq(teamInvites.teamId, teamId), eq(teamInvites.status, 'pending')),
      )
      .orderBy(desc(teamInvites.createdAt));
  }

  /**
   * Revokes a pending invite. The invite must belong to `teamId` — the
   * coach's own team — so one coach can never revoke another team's invite;
   * a mismatched or unknown id is an identical 404 with no existence leak.
   */
  async revokeInvite(teamId: string, inviteId: string): Promise<void> {
    const revoked = await this.databaseService.database
      .update(teamInvites)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(
        and(
          eq(teamInvites.id, inviteId),
          eq(teamInvites.teamId, teamId),
          eq(teamInvites.status, 'pending'),
        ),
      )
      .returning({ id: teamInvites.id });

    if (revoked.length === 0) {
      throw new NotFoundException('Invite not found.');
    }
  }

  /**
   * Preview behind `GET /team-invites/:token`. Every invalid case —
   * nonexistent, expired, used, or revoked — returns the same
   * `{ valid: false }` so the response never reveals which teams exist.
   */
  async preview(token: string): Promise<TeamInvitePreview> {
    if (!teamInviteTokenSchema.safeParse(token).success) {
      return { valid: false };
    }

    const [row] = await this.databaseService.database
      .select({
        status: teamInvites.status,
        expiresAt: teamInvites.expiresAt,
        teamName: teams.name,
      })
      .from(teamInvites)
      .innerJoin(teams, eq(teamInvites.teamId, teams.id))
      .where(eq(teamInvites.tokenHash, hashToken(token)))
      .limit(1);

    if (!row || !isUsableInvite(row)) {
      return { valid: false };
    }

    return { valid: true, teamName: row.teamName };
  }

  /**
   * Accepts an assistant invite for the signed-in user. The token is
   * re-validated exactly as `preview` does, the session email must match the
   * address the invite was issued to, and the account must not already
   * belong to a team. The membership itself is written by
   * TeamsService.addAssistantMember with the role hardcoded to `assistant`.
   */
  async accept(
    token: string,
    userId: string,
    email: string,
  ): Promise<{ joined: boolean; teamId: string }> {
    const found = await this.findValidInvite(token);

    if (!found) {
      throw new NotFoundException('This invite link is no longer valid.');
    }

    const { invite } = found;

    if (invite.email !== email.trim().toLowerCase()) {
      throw new ForbiddenException(
        'This invite was issued to a different email address.',
      );
    }

    // One team per account (Sprint 1 invariant). This also blocks an
    // existing coach or assistant from joining another team — nobody can
    // bootstrap themselves onto a second roster through invites.
    const existingTeam = await this.teamsService.findTeamForUser(userId);
    if (existingTeam) {
      throw new ConflictException('This account already belongs to a team.');
    }

    // neon-http does not support interactive transactions, so — like
    // ClaimsService.accept and TeamsService.createTeamForUser — the two
    // writes run sequentially and accept the same small risk window between
    // them. The (teamId, userId) unique index is the backstop.
    await this.teamsService.addAssistantMember(invite.teamId, userId);

    await this.databaseService.database
      .update(teamInvites)
      .set({
        status: 'used',
        usedAt: new Date(),
        usedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(eq(teamInvites.id, invite.id), eq(teamInvites.status, 'pending')),
      );

    return { joined: true, teamId: invite.teamId };
  }

  /**
   * Looks up an invite by token hash when still usable; `null` for every
   * invalid case. Malformed tokens skip the query entirely — they can never
   * match a stored hash.
   */
  private async findValidInvite(token: string) {
    if (!teamInviteTokenSchema.safeParse(token).success) {
      return null;
    }

    const [row] = await this.databaseService.database
      .select({ invite: teamInvites })
      .from(teamInvites)
      .where(eq(teamInvites.tokenHash, hashToken(token)))
      .limit(1);

    if (!row || !isUsableInvite(row.invite)) {
      return null;
    }

    return row;
  }

  private async revokePendingInvites(
    teamId: string,
    email: string,
  ): Promise<void> {
    await this.databaseService.database
      .update(teamInvites)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(
        and(
          eq(teamInvites.teamId, teamId),
          eq(teamInvites.email, email),
          eq(teamInvites.status, 'pending'),
        ),
      );
  }
}
