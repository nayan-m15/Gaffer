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
