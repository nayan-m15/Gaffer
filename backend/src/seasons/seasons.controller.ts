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
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from '../teams/teams.service';
import { createSeasonSchema, updateSeasonSchema } from './seasons.schemas';
import { SeasonsService } from './seasons.service';

/**
 * Season management for the signed-in coach's team.
 *
 * Reads stay open to every team member so assistants can filter statistics by
 * season; creating, editing and deleting seasons is coach-only, following the
 * same `requireCoachTeam` gate the events and athletes controllers use.
 */
@Controller('seasons')
@UseGuards(AuthGuard)
export class SeasonsController {
  constructor(
    private readonly seasonsService: SeasonsService,
    private readonly teamsService: TeamsService,
  ) {}

  private async assertCoach(userId: string): Promise<void> {
    await this.teamsService.requireCoachTeam(userId);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.seasonsService.listSeasons(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createSeasonSchema, body);
    await this.assertCoach(user.id);
    return this.seasonsService.createSeason(user.id, dto);
  }

  /** `isCurrent: true` also demotes whichever season was current before. */
  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateSeasonSchema, body);
    await this.assertCoach(user.id);
    return this.seasonsService.updateSeason(user.id, id, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertCoach(user.id);
    return this.seasonsService.deleteSeason(user.id, id);
  }
}
