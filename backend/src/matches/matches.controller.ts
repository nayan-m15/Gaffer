import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import {
  createMatchLogEventSchema,
  updateMatchLogEventSchema,
} from './matches.schemas';
import { MatchesService } from './matches.service';

@Controller('matches')
@UseGuards(AuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get(':matchId/squad')
  async getSquad(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.getSquad(user.id, matchId);
  }

  @Get(':matchId/opponent-squad')
  async getOpponentSquad(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.getOpponentSquad(user.id, matchId);
  }

  @Get(':matchId/events')
  async listEvents(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.listEvents(user.id, matchId);
  }

  @Post(':matchId/events')
  async logEvent(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createMatchLogEventSchema, body);
    return this.matchesService.logEvent(user.id, matchId, dto);
  }

  @Patch(':matchId/events/:eventId')
  async updateEvent(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateMatchLogEventSchema, body);
    return this.matchesService.updateEvent(user.id, matchId, eventId, dto);
  }

  @Delete(':matchId/events/:eventId')
  async deleteEvent(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.matchesService.deleteEvent(user.id, matchId, eventId);
  }

  @Post(':matchId/finish')
  async finish(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.finish(user.id, matchId);
  }

  @Get(':matchId')
  async findOne(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.findOne(user.id, matchId);
  }
}
