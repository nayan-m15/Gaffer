/**
 * Mirrors the backend's `AssistantResponse`/`ProposedAction` shapes in
 * `backend/src/ai-assistant/ai-assistant.service.ts` and
 * `backend/src/ai-assistant/conversation-store.ts`.
 */

export type AssistantContext = "roster" | "injuries" | "competitions";

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
    | "ADD_COMPETITION_TEAM";
  payload: Record<string, unknown>;
  displaySummary: AssistantProposedActionSummaryRow[];
}

export interface AssistantPlayerOption {
  id: string;
  name: string;
  squadNumber: number | null;
  position: string | null;
}

export interface AssistantCreatedEntity {
  type: string;
  id: string;
  label: string;
}

export interface AssistantResponse {
  conversationId: string;
  message: string;
  status: AssistantConversationStatus;
  requiresConfirmation: boolean;
  proposedAction?: AssistantProposedAction;
  playerOptions?: AssistantPlayerOption[];
  createdEntity?: AssistantCreatedEntity;
}
