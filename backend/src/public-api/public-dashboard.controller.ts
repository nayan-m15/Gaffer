import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
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
import { PublicDashboardService } from './public-dashboard.service';

@ApiTags('Public Dashboard')
@Controller('v1/public-dashboard')
export class PublicDashboardController {
  constructor(
    private readonly publicDashboardService: PublicDashboardService,
  ) {}

  @Get('filters')
  @ApiOperation({ summary: 'List public teams, competitions and seasons' })
  @ApiOkResponse({ schema: filtersSchema })
  async filters() {
    const data = await this.publicDashboardService.getFilters();
    return { success: true, data };
  }

  @Get('matches')
  @ApiOperation({ summary: 'List public match events' })
  @ApiDashboardQuery('matches')
  @ApiOkResponse({ schema: listSchema(matchSchema, true) })
  async matches(@Query() query: unknown) {
    const dto = zodValidate(publicMatchesQuerySchema, query);
    const data = await this.publicDashboardService.getMatches(dto);
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
    const data = await this.publicDashboardService.getPlayers(dto);
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
    const data = await this.publicDashboardService.getTeamStatistics(dto);
    return { success: true, count: data.length, data };
  }
}
