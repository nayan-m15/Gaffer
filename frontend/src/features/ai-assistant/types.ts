/**
 * Mirrors the backend's `AssistantResponse`/`ProposedAction` shapes in
 * `backend/src/ai-assistant/ai-assistant.service.ts` and
 * `backend/src/ai-assistant/conversation-store.ts`.
 */

export type AssistantContext = "roster" | "injuries" | "competitions" | "lineup";

export type AssistantConversationStatus = "collecting" | "review" | "completed";

export interface AssistantProposedActionSummaryRow {
  label: string;
  value: string;
}

export interface AssistantProposedAction {
  type:
    | "CREATE_PLAYER"
    | "UPDATE_PLAYER"
    | "CREATE_INJURY"
    | "CREATE_LEAGUE"
    | "CREATE_COMPETITION"
    | "ADD_COMPETITION_TEAM"
    | "APPLY_LINEUP_SUGGESTION";
  payload: Record<string, unknown>;
  displaySummary: AssistantProposedActionSummaryRow[];
}

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

export interface AssistantCreatedEntity {
  type: string;
  id: string;
  label: string;
}

/** A suggested lineup handed back after `APPLY_LINEUP_SUGGESTION` is confirmed — never persisted by the assistant itself, just loaded onto the Team page's editable board. */
export interface AssistantAppliedLineup {
  formationId: string;
  assignments: Record<string, string | null>;
  substituteIds: string[];
}

export interface AssistantResponse {
  conversationId: string;
  message: string;
  status: AssistantConversationStatus;
  requiresConfirmation: boolean;
  proposedAction?: AssistantProposedAction;
  playerOptions?: AssistantPlayerOption[];
  formationOptions?: AssistantFormationOption[];
  createdEntity?: AssistantCreatedEntity;
  appliedLineup?: AssistantAppliedLineup;
}
