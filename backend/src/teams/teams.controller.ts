import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from './teams.service';
import {
  createTeamSchema,
  teamSearchSchema,
  updateTeamSchema,
} from './teams.schemas';
import type { AuthenticatedRequest } from '../auth/auth.guard';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  /**
   * Searches other Gaffer teams by name for the friendly-fixture opponent
   * picker. The caller's own team is excluded server-side.
   */
  @UseGuards(AuthGuard)
  @Get('search')
  async searchTeams(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Query('q') q: string | undefined,
  ) {
    const dto = zodValidate(teamSearchSchema, { q });
    return this.teamsService.searchTeams(user.id, dto.q);
  }

  @UseGuards(AuthGuard)
  @Post()
  async createTeam(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const dto = zodValidate(createTeamSchema, body);

    // createTeamForUser throws ConflictException itself if the user already
    // has a team (Sprint 1 is one team per user) — that's a real Nest
    // HttpException already, so no error-mapping needed here, unlike the
    // Better Auth calls in AuthController.
    const team = await this.teamsService.createTeamForUser(
      user.id,
      dto.name,
      dto.primaryColor,
    );

    return { team };
  }

  @UseGuards(AuthGuard)
  @Patch()
  async updateTeam(
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const dto = zodValidate(updateTeamSchema, body);
    const team = await this.teamsService.updateTeamForUser(user.id, dto);
    return { team };
  }
}
