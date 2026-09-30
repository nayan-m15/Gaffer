import {
  Body,
  ForbiddenException,
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
import { z } from 'zod';
import {
  acceptCompetitionInviteSchema,
  createCompetitionInviteSchema,
} from './competition-invites.schemas';
import { CompetitionInvitesService } from './competition-invites.service';

const acceptVerificationSchema = z.object({ approve: z.boolean() });

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

  @Post('verification/:id/resolve')
  @UseGuards(AuthGuard)
  resolve(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(acceptVerificationSchema, body);
    return this.invites.resolveVerification(id, user.id, input.approve);
  }

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.invites.preview(token);
  }

  @Get(':token/eligible-teams')
  @UseGuards(AuthGuard)
  eligibleTeams(
    @Param('token') token: string,
    @CurrentUser() user: SessionUser,
  ) {
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Verify your email before responding to an invitation.',
      );
    return this.invites.eligibleTeams(token, user.id, user.email);
  }

  @Post(':token/request-representative')
  @UseGuards(AuthGuard)
  requestRepresentative(
    @Param('token') token: string,
    @CurrentUser() user: SessionUser,
  ) {
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Verify your email before responding to an invitation.',
      );
    return this.invites.requestRepresentativeInvite(token, user.id, user.email);
  }

  @Post(':token/decline')
  @UseGuards(AuthGuard)
  decline(@Param('token') token: string, @CurrentUser() user: SessionUser) {
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Verify your email before responding to an invitation.',
      );
    return this.invites.decline(token, user.id, user.email);
  }

  @Post(':token/accept')
  @UseGuards(AuthGuard)
  accept(
    @Param('token') token: string,
    @CurrentUser() user: SessionUser,
    @Body() body: unknown,
  ) {
    if (!user.emailVerified)
      throw new ForbiddenException(
        'Verify your email before responding to an invitation.',
      );
    const input = zodValidate(acceptCompetitionInviteSchema, body);
    return this.invites.accept(
      token,
      user.id,
      user.email,
      input.confirmed,
      input.teamName,
    );
  }
}
