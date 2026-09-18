import { z } from 'zod';

// Claim tokens are `crypto.randomBytes(32).toString('base64url')` — 43
// characters from the URL-safe base64 alphabet. The shape is only checked to
// fail fast; a well-formed but unknown token is still rejected by the hash
// lookup. The message matches the uniform copy used for every invalid
// invite, so a shape failure is indistinguishable from any other failure.
export const claimTokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{32,86}$/, 'This invite link is no longer valid.');

export type ClaimTokenDto = z.infer<typeof claimTokenSchema>;

// Claim invites are bound to a specific email address, matching the assistant
// invite flow. The signed-in account must use this same canonical email when
// accepting the invite.
export const createClaimInviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
});

export type CreateClaimInviteDto = z.infer<typeof createClaimInviteSchema>;
