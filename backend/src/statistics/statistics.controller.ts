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
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import {
  createCompetitionSchema,
  createStandingSchema,
  updateCompetitionSchema,
  updateStandingSchema,
} from './statistics.schemas';
import { StatisticsService } from './statistics.service';

/**
 * Read-only match analytics and manual standings CRUD for the signed-in
 * coach's team. Follows the events-module pattern: the controller passes
 * `user.id` straight through and the service resolves the team internally.
 */
@Controller('statistics')
@UseGuards(AuthGuard)
export class StatisticsController {
  constructor(private readonly statisticsService: StatisticsService) {}

  @Get()
  async getOverview(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('competitionId') competitionId?: string,
  ) {
    return this.statisticsService.getOverview(user.id, competitionId);
  }

  @Get('athletes/:id')
  async getAthleteStatistics(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.statisticsService.getAthleteStatistics(user.id, id);
  }

  @Get('competitions')
  async getCompetitions(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.statisticsService.getCompetitions(user.id);
  }

  @Post('competitions')
  async createCompetition(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createCompetitionSchema, body);
    return this.statisticsService.createCompetition(user.id, dto);
  }

  @Patch('competitions/:id')
  async updateCompetition(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateCompetitionSchema, body);
    return this.statisticsService.updateCompetition(user.id, id, dto);
  }

  @Delete('competitions/:id')
  async deleteCompetition(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.statisticsService.deleteCompetition(user.id, id);
  }

  @Post('competitions/:id/standings')
  async createStanding(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createStandingSchema, body);
    return this.statisticsService.createStanding(user.id, id, dto);
  }

  @Patch('standings/:id')
  async updateStanding(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateStandingSchema, body);
    return this.statisticsService.updateStanding(user.id, id, dto);
  }

  @Delete('standings/:id')
  async deleteStanding(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.statisticsService.deleteStanding(user.id, id);
  }
}
