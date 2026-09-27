import { useMutation } from "@tanstack/react-query";
import {
  cancelAssistantAction,
  confirmAssistantAction,
  sendAssistantMessage,
} from "@/services/ai-assistant";

/** Each call carries and returns the full server-side conversation state, so no query cache is needed here. */
export function useSendAssistantMessage() {
  return useMutation({ mutationFn: sendAssistantMessage });
}

export function useConfirmAssistantAction() {
  return useMutation({ mutationFn: confirmAssistantAction });
}

export function useCancelAssistantAction() {
  return useMutation({ mutationFn: cancelAssistantAction });
}
