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
import { ApiBody } from '@nestjs/swagger';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { requireCoachTeamId } from '../common/team-access';
import { TeamsService } from '../teams/teams.service';
import {
  createEventSchema,
  StartMatchBodyDto,
  createRsvpSchema,
  startMatchSchema,
  updateEventSchema,
} from './events.schemas';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly teamsService: TeamsService,
  ) {}

  /**
   * Event mutations are coach-only: assistants can view the team calendar
   * but may not schedule, edit or cancel events. `requireCoachTeam`
   * resolves the caller's own team and throws 403 for any non-coach member
   * (and for users without a team). Reads, RSVPs and starting a match (the
   * live-logging entry) intentionally stay open to all team members.
   */
  private async assertCoach(userId: string): Promise<void> {
    await requireCoachTeamId(this.teamsService, userId);
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createEventSchema, body);
    await this.assertCoach(user.id);
    return this.eventsService.create(user.id, dto);
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.eventsService.list(user.id);
  }

  @Post(':eventId/start-match')
  @ApiBody({ type: StartMatchBodyDto })
  async startMatch(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: StartMatchBodyDto,
  ) {
    const dto = zodValidate(startMatchSchema, body);
    return this.eventsService.startMatch(user.id, eventId, dto);
  }

  /** A claimed player records (or updates) their RSVP for an event. */
  @Post(':eventId/rsvp')
  async rsvp(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createRsvpSchema, body);
    return this.eventsService.rsvp(user.id, eventId, dto);
  }

  /** Coach-only roster breakdown of RSVPs for one of the team's events. */
  @Get(':eventId/rsvps')
  async listRsvps(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('eventId', ParseUUIDPipe) eventId: string,
  ) {
    return this.eventsService.listRsvps(user.id, eventId);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.findOne(user.id, id);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: unknown,
  ) {
    const dto = zodValidate(updateEventSchema, body);
    await this.assertCoach(user.id);
    return this.eventsService.update(user.id, id, dto);
  }

  @Delete(':id')
  async cancel(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assertCoach(user.id);
    return this.eventsService.cancel(user.id, id);
  }
}
