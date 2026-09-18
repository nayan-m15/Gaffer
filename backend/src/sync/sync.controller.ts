import {
  Controller,
  Body,
  Get,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { createHash, createHmac, createSign } from 'node:crypto';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { MatchesService } from '../matches/matches.service';
import { DatabaseService } from '../database/database.service';
import { syncUploadReceipts } from '../database/schema';
import { eq } from 'drizzle-orm';
import { zodValidate } from '../common/zod-validate';
import { syncUploadSchema, type SyncUploadItem } from './sync.schemas';

@Controller('sync')
@UseGuards(AuthGuard)
export class SyncController {
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
      return existing;
    }

    try {
      let canonicalEventId: string | null = null;
      if (item.kind === 'observation') {
        const event = await this.matchesService.logEvent(
          userId,
          item.matchId,
          item.payload,
        );
        canonicalEventId = event.id;
      } else if (item.operationType === 'correct') {
        const event = await this.matchesService.updateEvent(
          userId,
          item.matchId,
          item.canonicalEventId,
          item.replacement,
          item.id,
          item.causalParentIds,
        );
        canonicalEventId = event.id;
      } else {
        const event = await this.matchesService.deleteEvent(
          userId,
          item.matchId,
          item.canonicalEventId,
          item.id,
          item.causalParentIds,
          item.reason,
        );
        canonicalEventId = event.id;
      }
      const [receipt] = await this.databaseService.database
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
        .returning();
      return receipt;
    } catch {
      const fallback = {
        id,
        outcome: 'rejected',
        safeErrorCode: 'INVALID_OR_UNAUTHORISED',
      };
      try {
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
          .onConflictDoNothing({ target: syncUploadReceipts.id })
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
