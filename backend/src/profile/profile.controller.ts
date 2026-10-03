import { Body, Controller, Delete, Get, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { zodValidate } from '../common/zod-validate';
import { updateProfileSchema } from './profile.schemas';
import { ProfileService } from './profile.service';

/**
 * Profile endpoints scoped to the authenticated user.
 *
 * Every route is protected by `AuthGuard`, so the backend always derives the
 * target user from the active session. The frontend never supplies a user ID.
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

  @Delete()
  async deleteProfile(@CurrentUser() user: SessionUser) {
    return this.profileService.deleteProfile(user.id);
  }
}
