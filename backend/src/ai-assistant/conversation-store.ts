import { Injectable } from '@nestjs/common';
import type { AssistantContext } from './ai-assistant.schemas';

export interface ProposedAction {
  type:
    | 'CREATE_PLAYER'
    | 'UPDATE_PLAYER'
    | 'CREATE_INJURY'
    | 'CREATE_LEAGUE'
    | 'CREATE_COMPETITION'
    | 'ADD_COMPETITION_TEAM'
    | 'APPLY_LINEUP_SUGGESTION';
  payload: Record<string, unknown>;
  displaySummary: Array<{ label: string; value: string }>;
}

export interface AssistantConversationState {
  context: AssistantContext;
  intent: string | null;
  /** Field values gathered so far, keyed by the context's field spec keys. */
  collectedFields: Record<string, unknown>;
  /** Whether the once-only optional-field question has already been asked. */
  askedOptionalGroup: boolean;
  status: 'collecting' | 'review' | 'completed';
  proposedAction: ProposedAction | null;
  /** Resolved athlete for the injuries context, once the player is known. */
  resolvedPlayerName: string | null;
  updatedAt: number;
}

const CONVERSATION_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

function initialState(context: AssistantContext): AssistantConversationState {
  return {
    context,
    intent: null,
    collectedFields: {},
    askedOptionalGroup: false,
    status: 'collecting',
    proposedAction: null,
    resolvedPlayerName: null,
    updatedAt: Date.now(),
  };
}

/**
 * Server-side conversation state for the AI assistant, keyed by user +
 * conversation id so one coach can never read or confirm another's draft.
 *
 * In-memory only (per Nest process) — acceptable for a single-instance
 * deployment; a multi-instance deployment or restart would lose in-flight
 * drafts. If that becomes a problem, swap this for a Redis/DB-backed store
 * behind the same interface.
 */
@Injectable()
export class ConversationStore {
  private readonly conversations = new Map<
    string,
    AssistantConversationState
  >();

  private key(userId: string, conversationId: string): string {
    return `${userId}:${conversationId}`;
  }

  getOrCreate(
    userId: string,
    conversationId: string,
    context: AssistantContext,
  ): AssistantConversationState {
    const key = this.key(userId, conversationId);
    const existing = this.conversations.get(key);

    const expired =
      existing && Date.now() - existing.updatedAt > CONVERSATION_TTL_MS;
    if (!existing || expired || existing.context !== context) {
      const fresh = initialState(context);
      this.conversations.set(key, fresh);
      return fresh;
    }
    return existing;
  }

  save(
    userId: string,
    conversationId: string,
    state: AssistantConversationState,
  ): void {
    state.updatedAt = Date.now();
    this.conversations.set(this.key(userId, conversationId), state);
  }

  reset(
    userId: string,
    conversationId: string,
    context: AssistantContext,
  ): AssistantConversationState {
    const fresh = initialState(context);
    this.conversations.set(this.key(userId, conversationId), fresh);
    return fresh;
  }

  clear(userId: string, conversationId: string): void {
    this.conversations.delete(this.key(userId, conversationId));
  }
}
