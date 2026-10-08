import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiDashboardQuery,
  filtersSchema,
  listSchema,
  matchSchema,
  playerSchema,
  teamStatisticsSchema,
} from './public-api.openapi';
import { zodValidate } from '../common/zod-validate';
import {
  publicDashboardQuerySchema,
  publicMatchesQuerySchema,
  publicPlayersQuerySchema,
} from './public-api.schemas';
import { PublicDashboardCacheService } from './public-dashboard-cache.service';
import { PublicDashboardRateLimitGuard } from './public-dashboard-rate-limit.guard';
import { PublicDashboardService } from './public-dashboard.service';

/**
 * Unauthenticated dashboard API.
 *
 * Every route is rate limited per caller and served through a short-lived
 * response cache (SEC-008): these are the only anonymous endpoints that run
 * real aggregation, so without both a single client could replay one URL and
 * multiply database load at will. Responses are cached on the *validated*
 * query, so equivalent requests written differently still share one entry.
 */
@ApiTags('Public Dashboard')
@ApiResponse({ status: 429, description: 'Rate limit exceeded.' })
@UseGuards(PublicDashboardRateLimitGuard)
@Controller('v1/public-dashboard')
export class PublicDashboardController {
  constructor(
    private readonly publicDashboardService: PublicDashboardService,
    private readonly cache: PublicDashboardCacheService,
  ) {}

  @Get('filters')
  @ApiOperation({ summary: 'List public teams, competitions and seasons' })
  @ApiOkResponse({ schema: filtersSchema })
  async filters() {
    const data = await this.cache.resolve(
      PublicDashboardCacheService.key('filters', {}),
      () => this.publicDashboardService.getFilters(),
    );
    return { success: true, data };
  }

  @Get('matches')
  @ApiOperation({ summary: 'List public match events' })
  @ApiDashboardQuery('matches')
  @ApiOkResponse({ schema: listSchema(matchSchema, true) })
  async matches(@Query() query: unknown) {
    const dto = zodValidate(publicMatchesQuerySchema, query);
    const data = await this.cache.resolve(
      PublicDashboardCacheService.key('matches', dto),
      () => this.publicDashboardService.getMatches(dto),
    );
    return {
      success: true,
      count: data.length,
      limit: dto.limit,
      offset: dto.offset,
      data,
    };
  }

  @Get('players')
  @ApiOperation({ summary: 'List public players and their statistics' })
  @ApiDashboardQuery('players')
  @ApiOkResponse({ schema: listSchema(playerSchema, true) })
  async players(@Query() query: unknown) {
    const dto = zodValidate(publicPlayersQuerySchema, query);
    const data = await this.cache.resolve(
      PublicDashboardCacheService.key('players', dto),
      () => this.publicDashboardService.getPlayers(dto),
    );
    return {
      success: true,
      count: data.length,
      limit: dto.limit,
      offset: dto.offset,
      data,
    };
  }

  @Get('team-statistics')
  @ApiOperation({ summary: 'List public team standings' })
  @ApiDashboardQuery('standings')
  @ApiOkResponse({ schema: listSchema(teamStatisticsSchema) })
  async teamStatistics(@Query() query: unknown) {
    const dto = zodValidate(publicDashboardQuerySchema, query);
    const data = await this.cache.resolve(
      PublicDashboardCacheService.key('team-statistics', dto),
      () => this.publicDashboardService.getTeamStatistics(dto),
    );
    return { success: true, count: data.length, data };
  }
}
