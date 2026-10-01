import { z } from 'zod';
import {
  createTeamInviteSchema,
  teamInviteTokenSchema,
} from '../team-invites/team-invites.schemas';

export const competitionInviteTokenSchema = teamInviteTokenSchema;
export const createCompetitionInviteSchema = createTeamInviteSchema.extend({
  competitionTeamId: z.uuid(),
});

export const acceptCompetitionInviteSchema = z.object({
  confirmed: z.literal(true),
  teamName: z.string().trim().min(1).max(100).optional(),
});
