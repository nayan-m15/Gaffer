import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { updateProfileSchema } from './profile.schemas';
import { ProfileService } from './profile.service';

/**
 * Profile endpoints scoped to the authenticated user.
 *
 * Both routes are protected by `AuthGuard` so `CurrentUser` is always
 * available. The backend derives the target user from the session — the
 * frontend never sends a user ID.
 */
@Controller('profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  async getProfile(@CurrentUser() user: SessionUser) {
    return this.profileService.getProfile(user.id);
  }

  @Patch()
  async updateProfile(@CurrentUser() user: SessionUser, @Body() body: unknown) {
    const input = zodValidate(updateProfileSchema, body);
    return this.profileService.updateProfile(user.id, input);
  }
}
