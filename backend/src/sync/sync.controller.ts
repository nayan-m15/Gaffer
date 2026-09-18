import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { TeamsService } from '../teams/teams.service';

@Controller('sync')
@UseGuards(AuthGuard)
export class SyncController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('token')
  async token(@CurrentUser() user: AuthenticatedRequest['user']) {
    const endpoint = process.env.POWERSYNC_URL;
    const encodedSecret = process.env.POWERSYNC_SHARED_SECRET;
    const kid = process.env.POWERSYNC_KID;
    if (!endpoint || !encodedSecret || !kid) {
      throw new ServiceUnavailableException(
        'PowerSync is not configured on this deployment.',
      );
    }
    const team = await this.teamsService.findTeamForUser(user.id);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + 5 * 60;
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT', kid }),
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
    const signature = createHmac(
      'sha256',
      Buffer.from(encodedSecret, 'base64url'),
    )
      .update(`${header}.${payload}`)
      .digest('base64url');
    const token = `${header}.${payload}.${signature}`;
    return {
      endpoint,
      token,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }
}
