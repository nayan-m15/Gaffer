import {
  Controller,
  Body,
  Get,
  Logger,
  Post,
  ServiceUnavailableException,
  ForbiddenException,
  HttpException,
  UseGuards,
} from '@nestjs/common';
import { createHash, createHmac, createSign } from 'node:crypto';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { MatchesService } from '../matches/matches.service';
import { twoSidedLiveLoggingEnabled } from '../matches/match-sessions';
import { DatabaseService } from '../database/database.service';
import {
  matchEventOperations,
  syncClientTelemetry,
  syncUploadReceipts,
} from '../database/schema';
import { eq, inArray } from 'drizzle-orm';
import { zodValidate } from '../common/zod-validate';
import {
  syncTelemetrySchema,
  syncUploadSchema,
  type SyncUploadItem,
} from './sync.schemas';

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
        user_id: user.id,
        two_sided_live_logging: twoSidedLiveLoggingEnabled() ? 'true' : 'false',
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
    let batch: SyncUploadItem[] = [];
    const matchIds = new Set<string>();
    const receiptIds = new Set<string>();
    const flush = async () => {
      if (batch.length === 0) return;
      const results = await Promise.allSettled(
        batch.map((item) => this.processUploadItem(user.id, item)),
      );
      batch = [];
      matchIds.clear();
      receiptIds.clear();
      for (const result of results) {
        if (result.status === 'rejected') throw result.reason;
        receipts.push(result.value);
      }
    };

    for (const item of items) {
      const id =
        item.kind === 'observation' ? item.payload.clientRequestId : item.id;
      const hasCausalParents =
        item.kind === 'operation' && item.causalParentIds.length > 0;
      if (
        batch.length === 4 ||
        matchIds.has(item.matchId) ||
        receiptIds.has(id) ||
        hasCausalParents
      ) {
        await flush();
      }
      if (hasCausalParents) {
        receipts.push(await this.processUploadItem(user.id, item));
        continue;
      }
      batch.push(item);
      matchIds.add(item.matchId);
      receiptIds.add(id);
    }
    await flush();
    return { receipts };
  }

  @Post('telemetry')
  async telemetry(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const value = zodValidate(syncTelemetrySchema, body);
    const team = await this.teamsService.findTeamForUser(user.id);
    await this.databaseService.database
      .insert(syncClientTelemetry)
      .values({
        deviceId: value.deviceId,
        userId: user.id,
        teamId: team?.id ?? null,
        pendingCount: value.pendingCount,
        rejectedCount: value.rejectedCount,
        oldestPendingAt: value.oldestPendingAt
          ? new Date(value.oldestPendingAt)
          : null,
        lastSuccessfulSyncAt: value.lastSuccessfulSyncAt
          ? new Date(value.lastSuccessfulSyncAt)
          : null,
        deployment: value.deployment,
      })
      .onConflictDoUpdate({
        target: syncClientTelemetry.deviceId,
        set: {
          userId: user.id,
          teamId: team?.id ?? null,
          pendingCount: value.pendingCount,
          rejectedCount: value.rejectedCount,
          oldestPendingAt: value.oldestPendingAt
            ? new Date(value.oldestPendingAt)
            : null,
          lastSuccessfulSyncAt: value.lastSuccessfulSyncAt
            ? new Date(value.lastSuccessfulSyncAt)
            : null,
          deployment: value.deployment,
          updatedAt: new Date(),
        },
      });
    return { accepted: true };
  }

  private async processUploadItem(userId: string, item: SyncUploadItem) {
    const startedAt = performance.now();
    const id =
      item.kind === 'observation' ? item.payload.clientRequestId : item.id;
    if (!this.offlineSyncEnabled(item.matchId)) {
      return {
        id,
        outcome: 'dependency_pending',
        safeErrorCode: 'OFFLINE_SYNC_NOT_ENABLED_FOR_MATCH',
      };
    }
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
            processingDurationMs: Math.round(performance.now() - startedAt),
          })
          .onConflictDoUpdate({
            target: syncUploadReceipts.id,
            set: {
              outcome: 'dependency_pending',
              safeErrorCode: 'MISSING_CAUSAL_PARENT',
              processingDurationMs: Math.round(performance.now() - startedAt),
              updatedAt: new Date(),
            },
          })
          .returning();
        return receipt;
      }
    }

    try {
      const canonicalEventId = await this.executeUploadItem(userId, item);
      return await this.recordAcceptedUpload(
        userId,
        item,
        id,
        payloadHash,
        canonicalEventId,
        startedAt,
      );
    } catch (error) {
      this.logger.error(
        `Upload item ${id} failed`,
        error instanceof Error ? error.stack : String(error),
      );
      // A timeout or database failure may occur after evidence committed.
      // Leave the item retriable; an immutable observation ID makes retry safe.
      if (!(error instanceof HttpException) || error.getStatus() >= 500) {
        throw error;
      }
      this.logger.warn(
        `Offline upload rejected: item=${id} status=${error.getStatus()}`,
      );
      return this.recordRejectedUpload(
        userId,
        item,
        id,
        payloadHash,
        error,
        startedAt,
      );
    }
  }

  private async executeUploadItem(userId: string, item: SyncUploadItem) {
    if (item.kind === 'observation') {
      await this.matchesService.logEvent(userId, item.matchId, item.payload);
      return this.matchesService.canonicalEventIdForObservation(
        item.matchId,
        item.payload.clientRequestId,
      );
    }
    if (item.operationType === 'correct') {
      const event = await this.matchesService.submitCorrectionOperation(
        userId,
        item.matchId,
        item.canonicalEventId,
        item.replacement,
        item.id,
        item.causalParentIds,
      );
      return event.id;
    }
    if (item.operationType === 'void') {
      const event = await this.matchesService.deleteEvent(
        userId,
        item.matchId,
        item.canonicalEventId,
        item.id,
        item.causalParentIds,
        item.reason,
      );
      return event.id;
    }
    const review = await this.matchesService.resolveEventReview(
      userId,
      item.matchId,
      item.reviewId,
      { resolution: item.resolution },
      item.id,
      item.causalParentIds,
    );
    return review.canonicalEventId;
  }

  private async recordAcceptedUpload(
    userId: string,
    item: SyncUploadItem,
    id: string,
    payloadHash: string,
    initialCanonicalEventId: string | null,
    startedAt: number,
  ) {
    let canonicalEventId = initialCanonicalEventId;
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
            processingDurationMs: Math.round(performance.now() - startedAt),
          })
          .onConflictDoUpdate({
            target: syncUploadReceipts.id,
            set: {
              payloadHash,
              outcome: 'accepted',
              safeErrorCode: null,
              canonicalEventId,
              processingDurationMs: Math.round(performance.now() - startedAt),
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
  }

  private async recordRejectedUpload(
    userId: string,
    item: SyncUploadItem,
    id: string,
    payloadHash: string,
    error: HttpException,
    startedAt: number,
  ) {
    const safeErrorCode =
      error instanceof ForbiddenException
        ? 'MEMBERSHIP_REVOKED_OR_FORBIDDEN'
        : 'INVALID_OR_UNAUTHORISED';
    const fallback = { id, outcome: 'rejected', safeErrorCode };
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
          safeErrorCode,
          processingDurationMs: Math.round(performance.now() - startedAt),
        })
        .onConflictDoUpdate({
          target: syncUploadReceipts.id,
          set: {
            outcome: 'rejected',
            safeErrorCode,
            processingDurationMs: Math.round(performance.now() - startedAt),
            updatedAt: new Date(),
          },
        })
        .returning();
      return receipt ?? fallback;
    } catch {
      // A nonexistent match cannot satisfy the receipt FK; continue the batch.
      return fallback;
    }
  }

  private offlineSyncEnabled(matchId: string) {
    if (process.env.OFFLINE_SYNC_ENABLED === 'false') return false;
    const allowlist = process.env.OFFLINE_SYNC_MATCH_IDS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return !allowlist?.length || allowlist.includes(matchId);
  }
}
