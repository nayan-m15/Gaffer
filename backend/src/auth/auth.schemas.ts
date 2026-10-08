import { z } from 'zod';
import { teamInviteTokenSchema } from '../team-invites/team-invites.schemas';

// When a user signs up (or requests a new verification email) from
// /join-team/:token, the token rides along so the controller can send the
// user back to the invite after verifying — the verification link itself
// then carries the invite context across browsers, with localStorage as a
// safety net. The shape rule mirrors team-invites' own token validation, and
// the message matches the uniform copy used for every invalid invite.
const inviteTokenField = teamInviteTokenSchema.optional();

const newPasswordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be 128 characters or fewer.')
  .regex(/[A-Z]/, 'Password must include at least one uppercase letter.')
  .regex(/[a-z]/, 'Password must include at least one lowercase letter.')
  .regex(/[0-9]/, 'Password must include at least one number.')
  .regex(
    /[^A-Za-z0-9\s]/,
    'Password must include at least one special character.',
  );

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
  password: newPasswordSchema,
  inviteToken: inviteTokenField,
  inviteKind: z.enum(['team', 'competition']).optional(),
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
  rememberMe: z.boolean().optional().default(false),
});
export type SignInDto = z.infer<typeof signInSchema>;

export const changeEmailSchema = z.object({
  newEmail: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
});
export type ChangeEmailDto = z.infer<typeof changeEmailSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, 'Current password is required.')
      .max(128, 'Current password must be 128 characters or fewer.'),
    newPassword: newPasswordSchema,
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'New password must be different from your current password.',
    path: ['newPassword'],
  });
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;

export const setPasswordSchema = z.object({
  newPassword: newPasswordSchema,
});
export type SetPasswordDto = z.infer<typeof setPasswordSchema>;


export const requestPasswordResetSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
});
export type RequestPasswordResetDto = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1, 'Reset token is required.'),
  newPassword: newPasswordSchema,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;

export const resendVerificationEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Enter a valid email address.')
    .max(255, 'Email must be 255 characters or fewer.'),
  inviteToken: inviteTokenField,
  inviteKind: z.enum(['team', 'competition']).optional(),
});
export type ResendVerificationEmailDto = z.infer<
  typeof resendVerificationEmailSchema
>;
