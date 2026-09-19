import { z } from 'zod';
import {
  createMatchLogEventSchema,
  updateMatchLogEventSchema,
} from '../matches/matches.schemas';

const observationItemSchema = z.object({
  kind: z.literal('observation'),
  matchId: z.uuid(),
  payload: createMatchLogEventSchema,
});

const correctionOperationSchema = z.object({
  kind: z.literal('operation'),
  id: z.uuid(),
  matchId: z.uuid(),
  operationType: z.literal('correct'),
  canonicalEventId: z.uuid(),
  replacement: updateMatchLogEventSchema,
  causalParentIds: z.array(z.uuid()).max(50).default([]),
});

const voidOperationSchema = z.object({
  kind: z.literal('operation'),
  id: z.uuid(),
  matchId: z.uuid(),
  operationType: z.literal('void'),
  canonicalEventId: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
  causalParentIds: z.array(z.uuid()).max(50).default([]),
});

const reviewResolutionOperationSchema = z.object({
  kind: z.literal('operation'),
  id: z.uuid(),
  matchId: z.uuid(),
  operationType: z.literal('resolve_review'),
  reviewId: z.uuid(),
  resolution: z.enum(['same_event', 'separate_events']),
  causalParentIds: z.array(z.uuid()).max(50).default([]),
});

export const syncUploadSchema = z.object({
  items: z
    .array(
      z.union([
        observationItemSchema,
        correctionOperationSchema,
        voidOperationSchema,
        reviewResolutionOperationSchema,
      ]),
    )
    .min(1)
    .max(50),
});

export type SyncUploadItem = z.infer<typeof syncUploadSchema>['items'][number];
