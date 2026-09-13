import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { createClaimInviteSchema } from '../claims/claims.schemas';
import { ClaimsService } from '../claims/claims.service';
import { zodValidate } from '../common/zod-validate';
import { requireCoachTeamId, requireTeamId } from '../common/team-access';
import { TeamsService } from '../teams/teams.service';
import { createAthleteSchema, updateAthleteSchema } from './athletes.schemas';
import { AthletesService } from './athletes.service';

@Controller('athletes')
@UseGuards(AuthGuard)
export class AthletesController {
  constructor(
    private readonly athletesService: AthletesService,
    private readonly teamsService: TeamsService,
    private readonly claimsService: ClaimsService,
  ) {}

  private async getTeamId(userId: string): Promise<string> {
    return requireTeamId(this.teamsService, userId);
  }

  /**
   * Roster mutations are coach-only: assistants belong to the team and can
   * read the roster, but only coaches may add, edit, archive or restore
   * athletes. `requireCoachTeam` resolves the caller's own team and throws
   * 403 for any non-coach member (and for users without a team), so team
   * scoping is preserved — mutations still only ever touch the caller's
   * team, exactly like the reads above.
   */
  private async getCoachTeamId(userId: string): Promise<string> {
    return requireCoachTeamId(this.teamsService, userId);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(createAthleteSchema, body);
    const teamId = await this.getCoachTeamId(user.id);

    return this.athletesService.create(teamId, input);
  }

  @Get()
  async findAll(@CurrentUser() user: SessionUser) {
    const teamId = await this.getTeamId(user.id);

    return this.athletesService.findAll(teamId);
  }
  @Get('archived')
  async findArchived(@CurrentUser() user: SessionUser) {
    const teamId = await this.getTeamId(user.id);

    return this.athletesService.findArchived(teamId);
  }
  @Get(':id')
  async findOne(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getTeamId(user.id);

    return this.athletesService.findOne(teamId, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(updateAthleteSchema, body);
    const teamId = await this.getCoachTeamId(user.id);

    return this.athletesService.update(teamId, id, input);
  }

  @Delete(':id')
  async archive(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getCoachTeamId(user.id);

    return this.athletesService.archive(teamId, id);
  }
  @Patch(':id/restore')
  async restore(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getCoachTeamId(user.id);

    return this.athletesService.restore(teamId, id);
  }

  // Claim-invite endpoints are available to team staff (coach or assistant).
  // getTeamId resolves only team members, while findOne keeps the athlete scoped
  // to that same team. Player accounts are not team members and cannot use these
  // roster-management endpoints.
  @Post(':athleteId/claim-invite')
  async createClaimInvite(
    @CurrentUser() user: SessionUser,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(createClaimInviteSchema, body);
    const teamId = await this.getTeamId(user.id);
    await this.athletesService.findOne(teamId, athleteId);

    return this.claimsService.createInvite(athleteId, input.email, user.id);
  }

  @Delete(':athleteId/claim-invite')
  async revokeClaimInvite(
    @CurrentUser() user: SessionUser,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
  ) {
    const teamId = await this.getTeamId(user.id);
    await this.athletesService.findOne(teamId, athleteId);

    await this.claimsService.revokeInvite(athleteId);

    return { revoked: true };
  }
}
