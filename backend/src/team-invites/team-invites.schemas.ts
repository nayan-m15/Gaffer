import { z } from 'zod';

// Invite tokens are `crypto.randomBytes(32).toString('base64url')` — 43
// characters from the URL-safe base64 alphabet. The shape is only checked to
// fail fast; a well-formed but unknown token is still rejected by the hash
// lookup. The message matches the uniform copy used for every invalid
// invite, so a shape failure is indistinguishable from any other failure.
export const teamInviteTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,86}$/, 'This invite link is no longer valid.');

// Emails are stored and compared in a single canonical form (trimmed and
// lowercased) so `Coach@Example.com` and `coach@example.com` match the same
// invite — Better Auth itself normalises emails the same way.
export const createTeamInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
});

export type CreateTeamInviteDto = z.infer<typeof createTeamInviteSchema>;
