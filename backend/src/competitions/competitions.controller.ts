import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import {
  competitionSearchSchema,
  createCompetitionSchema,
  createCompetitionTeamSchema,
  updateCompetitionSchema,
} from './competitions.schemas';
import { CompetitionsService } from './competitions.service';

/**
 * Shared league/competition workspace. Every route requires a session; the
 * service resolves the caller's viewer/team context for reads and enforces
 * coach-only creation plus admin-only mutation internally. Search and detail
 * reads are open to any signed-in user but never grant membership and never
 * expose private user emails.
 */
@Controller('competitions')
@UseGuards(AuthGuard)
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Get('search')
  async search(
    @CurrentUser() user: SessionUser,
    @Query('q') q: string | undefined,
  ) {
    const dto = zodValidate(competitionSearchSchema, { q });
    return this.competitionsService.search(user.id, dto.q);
  }

  @Get('mine')
  async listMine(@CurrentUser() user: SessionUser) {
    return this.competitionsService.listMine(user.id);
  }

  @Post()
  async create(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const dto = zodValidate(createCompetitionSchema, body);
    return this.competitionsService.create(user.id, dto);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.competitionsService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateCompetitionSchema, body);
    return this.competitionsService.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(200)
  async remove(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.competitionsService.remove(user.id, id);
    return { success: true };
  }

  @Post(':id/teams')
  async addParticipant(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createCompetitionTeamSchema, body);
    return this.competitionsService.addParticipant(user.id, id, dto);
  }

  @Delete(':id/teams/:competitionTeamId')
  @HttpCode(200)
  async removeParticipant(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('competitionTeamId', ParseUUIDPipe) competitionTeamId: string,
  ) {
    await this.competitionsService.removeParticipant(
      user.id,
      id,
      competitionTeamId,
    );
    return { success: true };
  }
}
