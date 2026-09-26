import { z } from 'zod';

/**
 * The three pages the assistant currently supports. Kept in sync with the
 * frontend's `AssistantContext` type in
 * `frontend/src/features/ai-assistant/types.ts`.
 */
export const assistantContextSchema = z.enum([
  'roster',
  'injuries',
  'competitions',
]);
export type AssistantContext = z.infer<typeof assistantContextSchema>;

export const assistantMessageSchema = z.object({
  conversationId: z.uuid('Invalid conversation id.'),
  context: assistantContextSchema,
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(1000, 'Keep messages under 1000 characters.'),
  selectedPlayerId: z.uuid('Invalid player id.').optional(),
  /** Present when the assistant is opened on an existing competition's own detail page — switches the competitions assistant into "add a participating team" mode instead of "create a league/competition". */
  competitionId: z.uuid('Invalid competition id.').optional(),
});
export type AssistantMessageDto = z.infer<typeof assistantMessageSchema>;

export const assistantConversationRefSchema = z.object({
  conversationId: z.uuid('Invalid conversation id.'),
  context: assistantContextSchema,
});
export type AssistantConversationRefDto = z.infer<
  typeof assistantConversationRefSchema
>;
