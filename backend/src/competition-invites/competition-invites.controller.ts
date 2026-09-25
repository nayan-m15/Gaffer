import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { createCompetitionInviteSchema } from './competition-invites.schemas';
import { CompetitionInvitesService } from './competition-invites.service';

@Controller('competition-invites')
export class CompetitionInvitesController {
  constructor(private readonly invites: CompetitionInvitesService) {}

  @Post()
  @UseGuards(AuthGuard)
  create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(createCompetitionInviteSchema, body);
    return this.invites.createInvite(
      input.competitionTeamId,
      input.email,
      user.id,
    );
  }

  @Get()
  @UseGuards(AuthGuard)
  list(
    @CurrentUser() user: SessionUser,
    @Query('competitionId', ParseUUIDPipe) competitionId: string,
  ) {
    return this.invites.listInvites(competitionId, user.id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async revoke(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.invites.revokeInvite(id, user.id);
    return { revoked: true };
  }

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Post(':token/accept')
  @UseGuards(AuthGuard)
  accept(@Param('token') token: string, @CurrentUser() user: SessionUser) {
    return this.invites.accept(token, user.id, user.email);
  }
}
