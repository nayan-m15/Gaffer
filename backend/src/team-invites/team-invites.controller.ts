import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from '../teams/teams.service';
import { createTeamInviteSchema } from './team-invites.schemas';
import { TeamInvitesService } from './team-invites.service';

/**
 * Assistant-invite endpoints. `GET /team-invites/:token` is deliberately
 * public — an invited assistant may not have an account yet — while every
 * management route (create/list/revoke) is coach-only and accepting requires
 * a session whose email matches the invite.
 */
@Controller('team-invites')
export class TeamInvitesController {
  constructor(
    private readonly teamInvitesService: TeamInvitesService,
    private readonly teamsService: TeamsService,
  ) {}

  @Post()
  @UseGuards(AuthGuard)
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(createTeamInviteSchema, body);
    // Resolves the coach's own team and throws 403 for assistants and
    // team-less users — coaches can never issue invites for another team.
    const team = await this.teamsService.requireCoachTeam(user.id);

    return this.teamInvitesService.createInvite(team.id, input.email, user.id);
  }

  @Get()
  @UseGuards(AuthGuard)
  async list(@CurrentUser() user: SessionUser) {
    const team = await this.teamsService.requireCoachTeam(user.id);

    return this.teamInvitesService.listInvites(team.id);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async revoke(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const team = await this.teamsService.requireCoachTeam(user.id);
    await this.teamInvitesService.revokeInvite(team.id, id);

    return { revoked: true };
  }

  @Get(':token')
  async preview(@Param('token') token: string) {
    return this.teamInvitesService.preview(token);
  }

  @Post(':token/accept')
  @UseGuards(AuthGuard)
  async accept(
    @Param('token') token: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.teamInvitesService.accept(token, user.id, user.email);
  }
}
