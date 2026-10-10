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
  updateMatchClockSchema,
  resumeMatchSchema,
  resolveMatchEventReviewRequestSchema,
  finaliseMatchProjectionSchema,
  reopenMatchProjectionSchema,
  requestMatchAmendmentSchema,
  respondMatchAmendmentSchema,
} from './matches.schemas';
import { MatchesService } from './matches.service';

@Controller('matches')
@UseGuards(AuthGuard)
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('sessions/:sessionId/report')
  async sessionReport(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.matchesService.getSessionReport(user.id, sessionId);
  }

  @Get(':matchId/session-report')
  async sessionReportForSheet(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.getSessionReportForSheet(user.id, matchId);
  }

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

  @Get(':matchId/insight')
  async getInsight(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.getInsight(user.id, matchId);
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

  @Get(':matchId/event-reviews')
  async listEventReviews(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.listEventReviews(user.id, matchId);
  }

  @Get(':matchId/event-operations')
  async listEventOperations(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.listEventOperations(user.id, matchId);
  }

  @Post(':matchId/event-reviews/:reviewId/resolve')
  async resolveEventReview(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body() body: unknown,
  ) {
    const { operationId, causalParentIds, ...decision } = zodValidate(
      resolveMatchEventReviewRequestSchema,
      body,
    );
    return this.matchesService.resolveEventReview(
      user.id,
      matchId,
      reviewId,
      decision,
      operationId,
      causalParentIds,
    );
  }

  @Post(':matchId/event-reviews/:reviewId/dispute')
  async disputeEventReview(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
  ) {
    return this.matchesService.disputeEventReview(user.id, matchId, reviewId);
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

  @Post(':matchId/resume')
  async resume(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(resumeMatchSchema, body);
    return this.matchesService.resume(
      user.id,
      matchId,
      dto.expectedClockRevision,
    );
  }

  @Post(':matchId/finalise')
  async finalise(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(finaliseMatchProjectionSchema, body);
    return this.matchesService.finaliseProjection(
      user.id,
      matchId,
      dto.expectedRevision,
      dto.expectedSessionRevision,
    );
  }

  @Get(':matchId/amendments')
  async amendments(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.listAmendments(user.id, matchId);
  }

  @Post(':matchId/amendments')
  async requestAmendment(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: unknown,
  ) {
    return this.matchesService.requestAmendment(
      user.id,
      matchId,
      zodValidate(requestMatchAmendmentSchema, body),
    );
  }

  @Post(':matchId/amendments/:amendmentId/respond')
  async respondAmendment(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Param('amendmentId', ParseUUIDPipe) amendmentId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(respondMatchAmendmentSchema, body);
    return this.matchesService.respondAmendment(
      user.id,
      matchId,
      amendmentId,
      dto.response,
      dto.reason,
    );
  }

  @Post(':matchId/reopen')
  async reopen(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(reopenMatchProjectionSchema, body);
    return this.matchesService.reopenProjection(user.id, matchId, dto.reason);
  }

  @Patch(':matchId/clock')
  async updateClock(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateMatchClockSchema, body);
    return this.matchesService.updateClock(user.id, matchId, dto);
  }

  @Get(':matchId/clock-operations')
  async listClockOperations(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.listClockOperations(user.id, matchId);
  }

  @Get(':matchId')
  async findOne(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('matchId', ParseUUIDPipe) matchId: string,
  ) {
    return this.matchesService.findOne(user.id, matchId);
  }
}
