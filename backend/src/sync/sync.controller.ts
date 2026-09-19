import {
  Controller,
  Body,
  Get,
  Logger,
  Post,
  ServiceUnavailableException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { createHash, createHmac, createSign } from 'node:crypto';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { MatchesService } from '../matches/matches.service';
import { DatabaseService } from '../database/database.service';
import { matchEventOperations, syncUploadReceipts } from '../database/schema';
import { eq, inArray } from 'drizzle-orm';
import { zodValidate } from '../common/zod-validate';
import { syncUploadSchema, type SyncUploadItem } from './sync.schemas';

@Controller('sync')
@UseGuards(AuthGuard)
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private readonly teamsService: TeamsService,
    private readonly matchesService: MatchesService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Get('token')
  async token(@CurrentUser() user: AuthenticatedRequest['user']) {
    const endpoint = process.env.POWERSYNC_URL;
    const encodedSecret = process.env.POWERSYNC_SHARED_SECRET;
    const privateKey = process.env.POWERSYNC_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const kid = process.env.POWERSYNC_KID;
    if (!endpoint || (!privateKey && !encodedSecret) || !kid) {
      throw new ServiceUnavailableException(
        'PowerSync is not configured on this deployment.',
      );
    }
    const team = await this.teamsService.findTeamForUser(user.id);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 5 * 60;
    const header = Buffer.from(
      JSON.stringify({ alg: privateKey ? 'RS256' : 'HS256', typ: 'JWT', kid }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.id,
        aud: endpoint,
        iat: now,
        exp: expiresAt,
        team_id: team?.id ?? null,
        team_role: team?.role ?? null,
      }),
    ).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const signature = privateKey
      ? createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url')
      : createHmac('sha256', Buffer.from(encodedSecret!, 'base64url'))
          .update(unsigned)
          .digest('base64url');
    const token = `${header}.${payload}.${signature}`;
    return {
      endpoint,
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  @Post('upload')
  async upload(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const { items } = zodValidate(syncUploadSchema, body);
    const receipts: unknown[] = [];
    // Deliberately process each item independently: one rejected command must
    // never prevent later valid offline observations from being accepted.
    for (const item of items) {
      receipts.push(await this.processUploadItem(user.id, item));
    }
    return { receipts };
  }

  private async processUploadItem(userId: string, item: SyncUploadItem) {
    const id =
      item.kind === 'observation' ? item.payload.clientRequestId : item.id;
    const payloadHash = createHash('sha256')
      .update(JSON.stringify(item))
      .digest('hex');
    const [existing] = await this.databaseService.database
      .select()
      .from(syncUploadReceipts)
      .where(eq(syncUploadReceipts.id, id))
      .limit(1);
    if (existing) {
      if (
        existing.payloadHash !== payloadHash ||
        existing.submittedByUserId !== userId
      ) {
        return { id, outcome: 'rejected', safeErrorCode: 'ID_REUSED' };
      }
      if (existing.outcome !== 'dependency_pending') return existing;
    }

    if (item.kind === 'operation' && item.causalParentIds.length > 0) {
      const parents = await this.databaseService.database
        .select({ id: matchEventOperations.id })
        .from(matchEventOperations)
        .where(inArray(matchEventOperations.id, item.causalParentIds));
      if (parents.length !== new Set(item.causalParentIds).size) {
        const [receipt] = await this.databaseService.database
          .insert(syncUploadReceipts)
          .values({
            id,
            submittedByUserId: userId,
            matchId: item.matchId,
            itemType: item.kind,
            payloadHash,
            outcome: 'dependency_pending',
            safeErrorCode: 'MISSING_CAUSAL_PARENT',
          })
          .onConflictDoUpdate({
            target: syncUploadReceipts.id,
            set: {
              outcome: 'dependency_pending',
              safeErrorCode: 'MISSING_CAUSAL_PARENT',
              updatedAt: new Date(),
            },
          })
          .returning();
        return receipt;
      }
    }

    try {
      let canonicalEventId: string | null = null;
      if (item.kind === 'observation') {
        await this.matchesService.logEvent(userId, item.matchId, item.payload);
        canonicalEventId =
          await this.matchesService.canonicalEventIdForObservation(
            item.matchId,
            item.payload.clientRequestId,
          );
      } else if (item.operationType === 'correct') {
        const event = await this.matchesService.submitCorrectionOperation(
          userId,
          item.matchId,
          item.canonicalEventId,
          item.replacement,
          item.id,
          item.causalParentIds,
        );
        canonicalEventId = event.id;
      } else if (item.operationType === 'void') {
        const event = await this.matchesService.deleteEvent(
          userId,
          item.matchId,
          item.canonicalEventId,
          item.id,
          item.causalParentIds,
          item.reason,
        );
        canonicalEventId = event.id;
      } else {
        const review = await this.matchesService.resolveEventReview(
          userId,
          item.matchId,
          item.reviewId,
          { resolution: item.resolution },
          item.id,
          item.causalParentIds,
        );
        canonicalEventId = review.canonicalEventId;
      }
      let receipt: typeof syncUploadReceipts.$inferSelect | undefined;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (item.kind === 'observation') {
          canonicalEventId =
            await this.matchesService.canonicalEventIdForObservation(
              item.matchId,
              item.payload.clientRequestId,
            );
        }
        try {
          [receipt] = await this.databaseService.database
            .insert(syncUploadReceipts)
            .values({
              id,
              submittedByUserId: userId,
              matchId: item.matchId,
              itemType: item.kind,
              payloadHash,
              outcome: 'accepted',
              canonicalEventId,
            })
            .onConflictDoUpdate({
              target: syncUploadReceipts.id,
              set: {
                payloadHash,
                outcome: 'accepted',
                safeErrorCode: null,
                canonicalEventId,
                updatedAt: new Date(),
              },
            })
            .returning();
          break;
        } catch (error) {
          if (item.kind !== 'observation' || attempt === 1) throw error;
        }
      }
      if (!receipt) throw new Error('Could not commit the upload receipt.');
      return receipt;
    } catch (error) {
      this.logger.error(
        `Upload item ${id} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      const fallback = {
        id,
        outcome: 'rejected',
        safeErrorCode:
          error instanceof ForbiddenException
            ? 'MEMBERSHIP_REVOKED_OR_FORBIDDEN'
            : 'INVALID_OR_UNAUTHORISED',
      };
      try {
        const [committed] = await this.databaseService.database
          .select()
          .from(syncUploadReceipts)
          .where(eq(syncUploadReceipts.id, id))
          .limit(1);
        if (committed) {
          if (
            committed.payloadHash !== payloadHash ||
            committed.submittedByUserId !== userId
          ) {
            return { id, outcome: 'rejected', safeErrorCode: 'ID_REUSED' };
          }
          if (committed.outcome !== 'dependency_pending') return committed;
        }
        const [receipt] = await this.databaseService.database
          .insert(syncUploadReceipts)
          .values({
            id,
            submittedByUserId: userId,
            matchId: item.matchId,
            itemType: item.kind,
            payloadHash,
            outcome: 'rejected',
            safeErrorCode: fallback.safeErrorCode,
          })
          .onConflictDoUpdate({
            target: syncUploadReceipts.id,
            set: {
              outcome: 'rejected',
              safeErrorCode: fallback.safeErrorCode,
              updatedAt: new Date(),
            },
          })
          .returning();
        return receipt ?? fallback;
      } catch {
        // A syntactically valid but nonexistent match cannot satisfy the
        // receipt FK. Keep processing the remaining independent batch items.
        return fallback;
      }
    }
  }
}
