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
import {
  createEventSchema,
  StartMatchBodyDto,
  startMatchSchema,
  updateEventSchema,
} from './events.schemas';
import { EventsService } from './events.service';

@Controller('events')
@UseGuards(AuthGuard)
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Body() body: unknown,
  ) {
    const dto = zodValidate(createEventSchema, body);
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
    return this.eventsService.update(user.id, id, dto);
  }

  @Delete(':id')
  async cancel(
    @CurrentUser() user: AuthenticatedRequest['user'],
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.eventsService.cancel(user.id, id);
  }
}
