import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { TeamsService } from './teams.service';
import { createTeamSchema } from './teams.schemas';
import type { AuthenticatedRequest } from '../auth/auth.guard';

@Controller('teams')
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

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
    const team = await this.teamsService.createTeamForUser(user.id, dto.name);

    return { team };
  }
}
