import {
  Controller,
  Get,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PlayerService } from './player.service';

/**
 * Read-only endpoints for a claimed player, scoped to the athlete the
 * current user claimed (Section 5). The optional `athleteId` query param
 * disambiguates when a user has claimed athletes on more than one team;
 * it defaults to the first claimed athlete when omitted.
 */
@Controller('player')
@UseGuards(AuthGuard)
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Get('me')
  async me(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('athleteId', new ParseUUIDPipe({ optional: true }))
    athleteId?: string,
  ) {
    return this.playerService.getMe(user.id, athleteId);
  }

  @Get('team')
  async team(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('athleteId', new ParseUUIDPipe({ optional: true }))
    athleteId?: string,
  ) {
    return this.playerService.getTeam(user.id, athleteId);
  }

  @Get('events')
  async events(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('athleteId', new ParseUUIDPipe({ optional: true }))
    athleteId?: string,
  ) {
    return this.playerService.listEvents(user.id, athleteId);
  }

  @Get('standings')
  async standings(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('athleteId', new ParseUUIDPipe({ optional: true }))
    athleteId?: string,
  ) {
    return this.playerService.getStandings(user.id, athleteId);
  }
}
