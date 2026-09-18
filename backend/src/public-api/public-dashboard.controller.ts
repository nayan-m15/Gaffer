import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
  async filters() {
    const data = await this.publicDashboardService.getFilters();
    return { success: true, data };
  }

  @Get('matches')
  @ApiOperation({ summary: 'List public match events' })
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
  async teamStatistics(@Query() query: unknown) {
    const dto = zodValidate(publicDashboardQuerySchema, query);
    const data = await this.publicDashboardService.getTeamStatistics(dto);
    return { success: true, count: data.length, data };
  }
}
