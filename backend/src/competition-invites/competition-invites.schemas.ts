import { z } from 'zod';
import {
  createTeamInviteSchema,
  teamInviteTokenSchema,
} from '../team-invites/team-invites.schemas';

export const competitionInviteTokenSchema = teamInviteTokenSchema;
export const createCompetitionInviteSchema = createTeamInviteSchema.extend({
  competitionTeamId: z.uuid(),
});
