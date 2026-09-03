import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from '../teams/teams.service';
import { createLineupSchema, updateLineupSchema } from './lineups.schemas';
import { LineupsService } from './lineups.service';

@Controller('lineups')
@UseGuards(AuthGuard)
export class LineupsController {
  constructor(
    private readonly lineupsService: LineupsService,
    private readonly teamsService: TeamsService,
  ) {}

  private async getTeamId(userId: string): Promise<string> {
    const team = await this.teamsService.findTeamForUser(userId);

    if (!team) {
      throw new NotFoundException('Team not found.');
    }

    return team.id;
  }

  @Get()
  async findAll(@CurrentUser() user: SessionUser) {
    const teamId = await this.getTeamId(user.id);

    return this.lineupsService.findAll(teamId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getTeamId(user.id);

    return this.lineupsService.findOne(teamId, id);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(createLineupSchema, body);
    const teamId = await this.getTeamId(user.id);

    return this.lineupsService.create(teamId, input);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(updateLineupSchema, body);
    const teamId = await this.getTeamId(user.id);

    return this.lineupsService.update(teamId, id, input);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const teamId = await this.getTeamId(user.id);

    return this.lineupsService.remove(teamId, id);
  }
}
