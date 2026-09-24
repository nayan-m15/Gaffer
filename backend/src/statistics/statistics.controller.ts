import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { InsightsService } from '../insights/insights.service';
import { TeamsService } from '../teams/teams.service';
import {
  askAssistantSchema,
  compareAthletesSchema,
  createCompetitionSchema,
  createStandingSchema,
  generateSeasonInsightSchema,
  updateCompetitionSchema,
  updateStandingSchema,
} from './statistics.schemas';
import { StatisticsService } from './statistics.service';

/**
 * Match analytics and manual standings CRUD for the signed-in coach's team.
 * Follows the events-module pattern: the controller passes `user.id` straight
 * through and the service resolves the team internally.
 *
 * Reads are open to every team member so assistants can view statistics.
 * Mutation routes remain coach-gated at the controller; the service applies
 * the stronger shared-competition admin check for competitions/standings.
 */
@Controller('statistics')
@UseGuards(AuthGuard)
export class StatisticsController {
  constructor(
    private readonly statisticsService: StatisticsService,
    private readonly teamsService: TeamsService,
    private readonly insightsService: InsightsService,
  ) {}

  private async assertCoach(userId: string): Promise<void> {
    await this.teamsService.requireCoachTeam(userId);
  }

  @Get('season-insight')
  async getSeasonInsight(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('seasonId', new ParseUUIDPipe({ optional: true }))
    seasonId?: string,
  ) {
    const team = await this.teamsService.findTeamForUser(user.id);
    if (!team) {
      throw new ForbiddenException('No team associated with this account.');
    }
    const insight = await this.insightsService.getSeasonInsight(
      team.id,
      seasonId ?? null,
    );
    return (
      insight ?? {
        teamId: team.id,
        seasonId: seasonId ?? null,
        status: 'unavailable' as const,
      }
    );
  }

  /**
   * Coach-triggered (no automatic "season ended" event exists to hook this
   * to) — generates synchronously and returns the resulting row, unlike the
   * fire-and-forget per-match insight.
   */
  @Post('season-insight')
  async generateSeasonInsight(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const dto = zodValidate(generateSeasonInsightSchema, body);
    const team = await this.teamsService.requireCoachTeam(user.id);
    return this.insightsService.generateSeasonInsight(
      team.id,
      dto.seasonId ?? null,
      user.id,
    );
  }

  /**
   * Natural-language stats question, open to every team member (matches the
   * rest of this controller's read philosophy) — read-only and stateless,
   * nothing is persisted.
   */
  @Post('assistant')
  async askAssistant(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const dto = zodValidate(askAssistantSchema, body);
    return this.statisticsService.askAssistant(user.id, dto);
  }

  @Get()
  async getOverview(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('competitionId', new ParseUUIDPipe({ optional: true }))
    competitionId?: string,
    @Query('seasonId', new ParseUUIDPipe({ optional: true }))
    seasonId?: string,
  ) {
    return this.statisticsService.getOverview(user.id, {
      seasonId,
      competitionId,
    });
  }

  @Get('athletes/:id')
  async getAthleteStatistics(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.statisticsService.getAthleteStatistics(user.id, id);
  }

  /** Side-by-side comparison of 2–3 athletes: `?athleteIds=uuid,uuid`. */
  @Get('compare')
  async compareAthletes(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('athleteIds') athleteIds?: string,
    @Query('seasonId') seasonId?: string,
  ) {
    const dto = zodValidate(compareAthletesSchema, { athleteIds, seasonId });
    return this.statisticsService.compareAthletes(user.id, dto);
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
    await this.assertCoach(user.id);
    return this.statisticsService.createCompetition(user.id, dto);
  }

  @Patch('competitions/:id')
  async updateCompetition(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateCompetitionSchema, body);
    await this.assertCoach(user.id);
    return this.statisticsService.updateCompetition(user.id, id, dto);
  }

  @Delete('competitions/:id')
  async deleteCompetition(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertCoach(user.id);
    return this.statisticsService.deleteCompetition(user.id, id);
  }

  @Post('competitions/:id/standings')
  async createStanding(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createStandingSchema, body);
    await this.assertCoach(user.id);
    return this.statisticsService.createStanding(user.id, id, dto);
  }

  @Patch('standings/:id')
  async updateStanding(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateStandingSchema, body);
    await this.assertCoach(user.id);
    return this.statisticsService.updateStanding(user.id, id, dto);
  }

  @Delete('standings/:id')
  async deleteStanding(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertCoach(user.id);
    return this.statisticsService.deleteStanding(user.id, id);
  }
}
