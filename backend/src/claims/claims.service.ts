import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { sendPlayerClaimInviteEmail } from '../email/email';
import { athletes, playerClaimInvites, teams } from '../database/schema';
import { claimTokenSchema } from './claims.schemas';

// Invites are fixed at 72 hours for v1 — not configurable per invite.
const CLAIM_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

export interface ClaimInvitePreview {
  valid: boolean;
  athlete?: {
    firstName: string;
    lastName: string;
    teamName: string;
  };
}

// Only sha256(token) is ever persisted, mirroring a password-reset token —
// the raw token is placed in the emailed claim URL and is never stored.
// Lookup is by hash equality in SQL, so no constant-time comparison is needed.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

// Pending and unexpired. Expired, used, and revoked invites are all equally
// invalid — callers must never distinguish between them.
function isUsableInvite(invite: { status: string; expiresAt: Date }): boolean {
  return invite.status === 'pending' && invite.expiresAt.getTime() > Date.now();
}

@Injectable()
export class ClaimsService {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Generates a one-time claim invite for an athlete, bound to the supplied
   * email address. Any existing pending invite for the athlete is revoked,
   * then the new one-time claim link is sent directly to the player.
   */
  async createInvite(
    athleteId: string,
    email: string,
    createdByUserId: string,
  ): Promise<{ email: string; expiresAt: Date }> {
    const [athlete] = await this.databaseService.database
      .select({
        firstName: athletes.firstName,
        lastName: athletes.lastName,
      })
      .from(athletes)
      .where(eq(athletes.id, athleteId))
      .limit(1);

    if (!athlete) {
      throw new NotFoundException('Athlete not found.');
    }

    const token = randomBytes(32).toString('base64url');
    const claimUrl = `${FRONTEND_URL}/claim/${token}`;
    const expiresAt = new Date(Date.now() + CLAIM_INVITE_TTL_MS);

    await this.revokePendingInvites(athleteId);

    await this.databaseService.database.insert(playerClaimInvites).values({
      athleteId,
      email,
      tokenHash: hashToken(token),
      createdByUserId,
      expiresAt,
    });

    try {
      await sendPlayerClaimInviteEmail({
        to: email,
        playerName: `${athlete.firstName} ${athlete.lastName}`.trim(),
        url: claimUrl,
      });
    } catch (error) {
      // Do not leave an unusable "Invited" state behind when delivery fails.
      await this.databaseService.database
        .update(playerClaimInvites)
        .set({ status: 'revoked', updatedAt: new Date() })
        .where(eq(playerClaimInvites.tokenHash, hashToken(token)));
      throw error;
    }

    return { email, expiresAt };
  }

  /** Revokes the athlete's active pending invite, if any. */
  async revokeInvite(athleteId: string): Promise<void> {
    await this.revokePendingInvites(athleteId);
  }

  /**
   * Preview behind `GET /claims/:token`. Every invalid case — nonexistent,
   * expired, used, or revoked — returns the same `{ valid: false }` so the
   * response never reveals which athletes exist.
   */
  async preview(token: string): Promise<ClaimInvitePreview> {
    if (!claimTokenSchema.safeParse(token).success) {
      return { valid: false };
    }

    const [row] = await this.databaseService.database
      .select({
        status: playerClaimInvites.status,
        expiresAt: playerClaimInvites.expiresAt,
        firstName: athletes.firstName,
        lastName: athletes.lastName,
        teamName: teams.name,
      })
      .from(playerClaimInvites)
      .innerJoin(athletes, eq(playerClaimInvites.athleteId, athletes.id))
      .innerJoin(teams, eq(athletes.teamId, teams.id))
      .where(eq(playerClaimInvites.tokenHash, hashToken(token)))
      .limit(1);

    if (!row || !isUsableInvite(row)) {
      return { valid: false };
    }

    return {
      athlete: {
        firstName: row.firstName,
        lastName: row.lastName,
        teamName: row.teamName,
      },
      valid: true,
    };
  }

  /**
   * Accepts a claim invite for the signed-in user: the account email must
   * match the address the coach invited, then the user's id is attached to
   * the athlete and the invite is marked used.
   */
  async accept(token: string, userId: string, email: string) {
    const found = await this.findValidInvite(token);

    if (!found) {
      throw new NotFoundException('This invite link is no longer valid.');
    }

    const { invite, athlete } = found;

    if (invite.email !== email.trim().toLowerCase()) {
      throw new ForbiddenException(
        'This invite was issued to a different email address.',
      );
    }

    if (athlete.userId) {
      throw new ConflictException(
        'This player profile has already been claimed.',
      );
    }

    // One claimed roster slot per account per team — claiming on a different
    // team is fine. The athlete being claimed has a null userId at this
    // point, so this can only match some other athlete row.
    const [existingClaim] = await this.databaseService.database
      .select({ id: athletes.id })
      .from(athletes)
      .where(
        and(eq(athletes.userId, userId), eq(athletes.teamId, athlete.teamId)),
      )
      .limit(1);

    if (existingClaim) {
      throw new ConflictException(
        'This account has already claimed a player profile on this team.',
      );
    }

    // The conditional update makes athlete ownership a single-winner write;
    // the database's partial unique index also prevents one account claiming
    // two athlete rows on this team under concurrent requests.
    let claimed: typeof athletes.$inferSelect | undefined;
    try {
      [claimed] = await this.databaseService.database
        .update(athletes)
        .set({ userId, updatedAt: new Date() })
        .where(and(eq(athletes.id, athlete.id), isNull(athletes.userId)))
        .returning();
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'This account has already claimed a player profile on this team.',
        );
      }
      throw error;
    }

    if (!claimed) {
      throw new ConflictException(
        'This player profile has already been claimed.',
      );
    }

    await this.databaseService.database
      .update(playerClaimInvites)
      .set({
        status: 'used',
        usedAt: new Date(),
        usedByUserId: userId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(playerClaimInvites.id, invite.id),
          eq(playerClaimInvites.status, 'pending'),
        ),
      );

    return claimed;
  }

  /**
   * Looks up an invite by token hash and returns it together with its
   * athlete when still usable; `null` for every invalid case. Malformed
   * tokens skip the query entirely — they can never match a stored hash.
   */
  private async findValidInvite(token: string) {
    if (!claimTokenSchema.safeParse(token).success) {
      return null;
    }

    const [row] = await this.databaseService.database
      .select({ invite: playerClaimInvites, athlete: athletes })
      .from(playerClaimInvites)
      .innerJoin(athletes, eq(playerClaimInvites.athleteId, athletes.id))
      .where(eq(playerClaimInvites.tokenHash, hashToken(token)))
      .limit(1);

    if (!row || !isUsableInvite(row.invite)) {
      return null;
    }

    return row;
  }

  private async revokePendingInvites(athleteId: string): Promise<void> {
    await this.databaseService.database
      .update(playerClaimInvites)
      .set({ status: 'revoked', updatedAt: new Date() })
      .where(
        and(
          eq(playerClaimInvites.athleteId, athleteId),
          eq(playerClaimInvites.status, 'pending'),
        ),
      );
  }
}
