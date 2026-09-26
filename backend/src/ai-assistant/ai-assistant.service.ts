import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { requireCoachTeamId, requireTeamId } from '../common/team-access';
import { TeamsService } from '../teams/teams.service';
import type {
  AssistantConversationRefDto,
  AssistantMessageDto,
} from './ai-assistant.schemas';
import { CompetitionsAssistant } from './competitions-assistant';
import {
  ConversationStore,
  type AssistantConversationState,
} from './conversation-store';
import { InjuriesAssistant } from './injuries-assistant';
import { RosterAssistant } from './roster-assistant';
import type { AssistantPlayerOption, AssistantTurnResult } from './types';

export interface AssistantResponse {
  conversationId: string;
  message: string;
  status: AssistantConversationState['status'];
  requiresConfirmation: boolean;
  proposedAction?: AssistantConversationState['proposedAction'];
  playerOptions?: AssistantPlayerOption[];
  createdEntity?: { type: string; id: string; label: string };
}

function extractHttpMessage(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return response;
    if (response && typeof response === 'object' && 'message' in response) {
      const { message } = response;
      if (Array.isArray(message)) return String(message[0] ?? error.message);
      if (typeof message === 'string') return message;
    }
    return error.message;
  }
  return "I couldn't save that because the server returned an error. Your entered details have been kept so you can try again.";
}

/**
 * Orchestrates the assistant's per-context state machine. This layer never
 * touches the database directly — it resolves the caller's tenancy/role via
 * the same `common/team-access.ts` helpers every other controller uses, then
 * delegates to the per-context assistants, which in turn only ever call the
 * app's existing services (`AthletesService`, `InjuriesService`,
 * `CompetitionsService`). Nothing is written until `confirm()` is called,
 * which is an explicit, separate request from the chat message itself — a
 * chat message can never be mistaken for confirmation.
 */
@Injectable()
export class AiAssistantService {
  private readonly logger = new Logger(AiAssistantService.name);

  constructor(
    private readonly conversationStore: ConversationStore,
    private readonly teamsService: TeamsService,
    private readonly rosterAssistant: RosterAssistant,
    private readonly injuriesAssistant: InjuriesAssistant,
    private readonly competitionsAssistant: CompetitionsAssistant,
  ) {}

  async handleMessage(
    userId: string,
    dto: AssistantMessageDto,
  ): Promise<AssistantResponse> {
    const teamId = await requireTeamId(this.teamsService, userId);

    let state = this.conversationStore.getOrCreate(
      userId,
      dto.conversationId,
      dto.context,
    );
    if (state.status === 'completed') {
      state = this.conversationStore.reset(
        userId,
        dto.conversationId,
        dto.context,
      );
    }

    let result: AssistantTurnResult;
    switch (dto.context) {
      case 'roster':
        result = await this.rosterAssistant.handleMessage(
          state,
          dto.message,
          teamId,
        );
        break;
      case 'injuries':
        result = await this.injuriesAssistant.handleMessage(
          state,
          dto.message,
          teamId,
        );
        break;
      case 'competitions':
        result = await this.competitionsAssistant.handleMessage(
          state,
          dto.message,
          dto.competitionId,
        );
        break;
    }

    state.status = result.requiresConfirmation ? 'review' : 'collecting';
    state.proposedAction = result.proposedAction ?? null;
    this.conversationStore.save(userId, dto.conversationId, state);

    return {
      conversationId: dto.conversationId,
      message: result.reply,
      status: state.status,
      requiresConfirmation: result.requiresConfirmation,
      proposedAction: state.proposedAction ?? undefined,
      playerOptions: result.playerOptions,
    };
  }

  async confirm(
    userId: string,
    dto: AssistantConversationRefDto,
  ): Promise<AssistantResponse> {
    const state = this.conversationStore.getOrCreate(
      userId,
      dto.conversationId,
      dto.context,
    );
    if (state.status !== 'review' || !state.proposedAction) {
      throw new BadRequestException(
        'There is nothing to confirm yet — finish answering the questions first.',
      );
    }

    const action = state.proposedAction;

    try {
      const execResult = await (async () => {
        switch (action.type) {
          case 'CREATE_PLAYER': {
            const teamId = await requireCoachTeamId(this.teamsService, userId);
            return this.rosterAssistant.execute(teamId, action.payload);
          }
          case 'UPDATE_PLAYER': {
            const teamId = await requireCoachTeamId(this.teamsService, userId);
            return this.rosterAssistant.executeUpdate(teamId, action.payload);
          }
          case 'CREATE_INJURY': {
            const teamId = await requireTeamId(this.teamsService, userId);
            return this.injuriesAssistant.execute(
              teamId,
              userId,
              action.payload,
            );
          }
          case 'CREATE_LEAGUE':
          case 'CREATE_COMPETITION':
            return this.competitionsAssistant.execute(userId, action.payload);
          case 'ADD_COMPETITION_TEAM':
            return this.competitionsAssistant.executeAddTeam(
              userId,
              action.payload,
            );
          default:
            throw new BadRequestException('Unsupported action type.');
        }
      })();

      const verb =
        action.type === 'UPDATE_PLAYER'
          ? 'updated'
          : action.type === 'ADD_COMPETITION_TEAM'
            ? 'added'
            : 'created';
      this.logger.log(
        `AI_ASSISTANT ${verb} ${execResult.entityType} ${execResult.entityId} ` +
          `(user_id=${userId}, conversation_id=${dto.conversationId})`,
      );

      state.status = 'completed';
      state.proposedAction = null;
      this.conversationStore.save(userId, dto.conversationId, state);

      return {
        conversationId: dto.conversationId,
        message: execResult.reply,
        status: state.status,
        requiresConfirmation: false,
        createdEntity: {
          type: execResult.entityType,
          id: execResult.entityId,
          label: execResult.entityLabel,
        },
      };
    } catch (error) {
      // A failed write must never destroy the coach's draft: stay in
      // `collecting` with the same fields so they can retry or correct.
      state.status = 'collecting';
      state.proposedAction = null;
      this.conversationStore.save(userId, dto.conversationId, state);

      return {
        conversationId: dto.conversationId,
        message: extractHttpMessage(error),
        status: state.status,
        requiresConfirmation: false,
      };
    }
  }

  cancel(userId: string, dto: AssistantConversationRefDto): AssistantResponse {
    this.conversationStore.reset(userId, dto.conversationId, dto.context);
    return {
      conversationId: dto.conversationId,
      message:
        'No problem — cancelled that. What would you like to do instead?',
      status: 'collecting',
      requiresConfirmation: false,
    };
  }
}
