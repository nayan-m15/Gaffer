import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from '../teams/teams.service';
import {
  createGamePlanSchema,
  updateGamePlanSchema,
} from './game-plans.schemas';
import { GamePlansService } from './game-plans.service';

@Controller('game-plans')
@UseGuards(AuthGuard)
export class GamePlansController {
  constructor(
    private readonly gamePlansService: GamePlansService,
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

    return this.gamePlansService.findAll(teamId);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const teamId = await this.getTeamId(user.id);

    return this.gamePlansService.findOne(teamId, id);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(createGamePlanSchema, body);
    const teamId = await this.getTeamId(user.id);

    return this.gamePlansService.create(teamId, input);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const input = zodValidate(updateGamePlanSchema, body);
    const teamId = await this.getTeamId(user.id);

    return this.gamePlansService.update(teamId, id, input);
  }

  @Delete(':id')
  async remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    const teamId = await this.getTeamId(user.id);

    return this.gamePlansService.remove(teamId, id);
  }
}
