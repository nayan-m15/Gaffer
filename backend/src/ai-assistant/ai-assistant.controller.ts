import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { AiAssistantService } from './ai-assistant.service';
import {
  assistantConversationRefSchema,
  assistantMessageSchema,
} from './ai-assistant.schemas';

/**
 * Gaffer AI's guided-conversation assistant (roster / injuries / competitions).
 * Distinct from `/statistics/assistant`, the existing stateless stats Q&A —
 * this one holds server-side conversation state and can propose (then, once
 * explicitly confirmed, execute) a create action through the app's normal
 * services. Every route requires a session; tenancy and role are always
 * resolved from it server-side, never trusted from the request body.
 */
@Controller('ai-assistant')
@UseGuards(AuthGuard)
export class AiAssistantController {
  constructor(private readonly aiAssistantService: AiAssistantService) {}

  @Post('message')
  async message(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const dto = zodValidate(assistantMessageSchema, body);
    return this.aiAssistantService.handleMessage(user.id, dto);
  }

  @Post('confirm')
  async confirm(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const dto = zodValidate(assistantConversationRefSchema, body);
    return this.aiAssistantService.confirm(user.id, dto);
  }

  @Post('cancel')
  cancel(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const dto = zodValidate(assistantConversationRefSchema, body);
    return this.aiAssistantService.cancel(user.id, dto);
  }
}
