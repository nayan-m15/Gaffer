import type { ProposedAction } from './conversation-store';

export interface AssistantPlayerOption {
  id: string;
  name: string;
  squadNumber: number | null;
  position: string | null;
}

/** The result of handling one incoming chat message for a given context. */
export interface AssistantTurnResult {
  reply: string;
  requiresConfirmation: boolean;
  proposedAction?: ProposedAction;
  playerOptions?: AssistantPlayerOption[];
}

/** The result of executing a confirmed proposed action. */
export interface AssistantExecutionResult {
  reply: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
}
