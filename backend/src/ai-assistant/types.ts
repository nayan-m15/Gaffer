import type { ProposedAction } from './conversation-store';

export interface AssistantPlayerOption {
  id: string;
  name: string;
  squadNumber: number | null;
  position: string | null;
}

/** A formation quick-reply choice, shown the same way `playerOptions` are. */
export interface AssistantFormationOption {
  id: string;
  label: string;
}

/** The result of handling one incoming chat message for a given context. */
export interface AssistantTurnResult {
  reply: string;
  requiresConfirmation: boolean;
  proposedAction?: ProposedAction;
  playerOptions?: AssistantPlayerOption[];
  formationOptions?: AssistantFormationOption[];
}

/** The result of executing a confirmed proposed action. */
export interface AssistantExecutionResult {
  reply: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  /** Set only for `APPLY_LINEUP_SUGGESTION` — never written to the database, just handed back for the Team page's editable board to load. */
  appliedLineup?: {
    formationId: string;
    assignments: Record<string, string | null>;
    substituteIds: string[];
  };
}
