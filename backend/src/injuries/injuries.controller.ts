import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { requireCoachTeamId, requireTeamId } from '../common/team-access';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from '../teams/teams.service';
import {
  closeInjurySchema,
  createInjurySchema,
  createInjuryTimelineEntrySchema,
  injuryProtocolQuerySchema,
  listInjuriesQuerySchema,
  updateInjurySchema,
} from './injuries.schemas';
import { InjuriesService } from './injuries.service';

@Controller('injuries')
@UseGuards(AuthGuard)
export class InjuriesController {
  constructor(
    private readonly injuriesService: InjuriesService,
    private readonly teamsService: TeamsService,
  ) {}

  private async getTeamId(userId: string): Promise<string> {
    return requireTeamId(this.teamsService, userId);
  }

  /**
   * Amending the clinical record is coach-only, matching every other managed
   * resource: an assistant can report what they saw, but changing a
   * diagnosis, a return estimate or closing a record is the coach's call.
   */
  private async getCoachTeamId(userId: string): Promise<string> {
    return requireCoachTeamId(this.teamsService, userId);
  }

  /**
   * Logging an injury is open to any team member, deliberately unlike the
   * roster and event mutations: assistants run the live logger, so the
   * person who watches the injury happen must be able to record it.
   */
  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(createInjurySchema, body);
    const teamId = await this.getTeamId(user.id);

    return this.injuriesService.create(teamId, user.id, input);
  }

  @Get()
  async findAll(@CurrentUser() user: SessionUser, @Query() query: unknown) {
    const filters = zodValidate(listInjuriesQuerySchema, query ?? {});
    const teamId = await this.getTeamId(user.id);

    return this.injuriesService.findAll(teamId, filters);
  }

  /**
   * Return-time guidance for a prospective injury. Declared before the
   * `:id` route so `protocol` is never parsed as an injury identifier.
   */
  @Get('protocol')
  async protocol(@CurrentUser() user: SessionUser, @Query() query: unknown) {
    const filters = zodValidate(injuryProtocolQuerySchema, query ?? {});
    // Guidance is not team data, but it stays behind team membership so the
    // endpoint cannot be used as an unauthenticated lookup service.
    await this.getTeamId(user.id);

    return this.injuriesService.protocolPreview(filters);
  }

  @Get('recovery/:athleteId')
  async recovery(
    @CurrentUser() user: SessionUser,
    @Param('athleteId', ParseUUIDPipe) athleteId: string,
  ) {
    const teamId = await this.getTeamId(user.id);

    return this.injuriesService.recoveryFor(teamId, athleteId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getTeamId(user.id);

    return this.injuriesService.findOne(teamId, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(updateInjurySchema, body);
    const teamId = await this.getCoachTeamId(user.id);

    return this.injuriesService.update(teamId, user.id, id, input);
  }

  @Patch(':id/close')
  async close(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(closeInjurySchema, body);
    const teamId = await this.getCoachTeamId(user.id);

    return this.injuriesService.close(teamId, user.id, id, input);
  }

  @Post(':id/timeline')
  async addTimelineEntry(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(createInjuryTimelineEntrySchema, body);
    const teamId = await this.getCoachTeamId(user.id);

    return this.injuriesService.addTimelineEntry(teamId, user.id, id, input);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getCoachTeamId(user.id);

    return this.injuriesService.remove(teamId, id);
  }
}
