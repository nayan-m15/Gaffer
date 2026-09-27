import { apiFetch } from "@/lib/api";
import type { AssistantContext, AssistantResponse } from "@/features/ai-assistant/types";

const AI_ASSISTANT_PATH = "/ai-assistant";

export interface SendAssistantMessageInput {
  conversationId: string;
  context: AssistantContext;
  message: string;
  selectedPlayerId?: string;
  competitionId?: string;
}

export interface AssistantConversationRef {
  conversationId: string;
  context: AssistantContext;
}

export async function sendAssistantMessage(
  input: SendAssistantMessageInput,
): Promise<AssistantResponse> {
  return apiFetch<AssistantResponse>(`${AI_ASSISTANT_PATH}/message`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function confirmAssistantAction(
  input: AssistantConversationRef,
): Promise<AssistantResponse> {
  return apiFetch<AssistantResponse>(`${AI_ASSISTANT_PATH}/confirm`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function cancelAssistantAction(
  input: AssistantConversationRef,
): Promise<AssistantResponse> {
  return apiFetch<AssistantResponse>(`${AI_ASSISTANT_PATH}/cancel`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
