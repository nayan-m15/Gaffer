import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { FriendlyFixturesService } from './friendly-fixtures.service';

/**
 * Inbound friendly-fixture requests for the caller's own team. Requests are
 * created implicitly when a coach schedules a manual match against another
 * Gaffer team (POST /events), so this controller only exposes the opponent
 * side: list what is awaiting a response, then accept or decline it.
 * Accept/decline are coach-gated inside the service.
 */
@Controller('friendly-fixtures')
@UseGuards(AuthGuard)
export class FriendlyFixturesController {
  constructor(
    private readonly friendlyFixturesService: FriendlyFixturesService,
  ) {}

  @Get('incoming')
  async listIncoming(@CurrentUser() user: SessionUser) {
    return this.friendlyFixturesService.listIncoming(user.id);
  }

  @Post(':id/accept')
  async accept(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendlyFixturesService.accept(user.id, id);
  }

  @Post(':id/decline')
  async decline(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.friendlyFixturesService.decline(user.id, id);
  }
}
