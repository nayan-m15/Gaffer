import { z } from 'zod';
import { teamInviteTokenSchema } from '../team-invites/team-invites.schemas';

// When a user signs up (or requests a new verification email) from
// /join-team/:token, the token rides along so the controller can send the
// user back to the invite after verifying — the verification link itself
// then carries the invite context across browsers, with localStorage as a
// safety net. The shape rule mirrors team-invites' own token validation, and
// the message matches the uniform copy used for every invalid invite.
const inviteTokenField = teamInviteTokenSchema.optional();

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
  inviteToken: inviteTokenField,
});
export type SignUpDto = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
  password: z
    .string()
    .min(1, 'Password is required.')
    .max(128, 'Password must be 128 characters or fewer.'),
});
export type SignInDto = z.infer<typeof signInSchema>;

export const resendVerificationEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
  inviteToken: inviteTokenField,
});
export type ResendVerificationEmailDto = z.infer<
  typeof resendVerificationEmailSchema
>;
