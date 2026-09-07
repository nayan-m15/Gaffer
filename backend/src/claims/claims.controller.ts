import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ClaimsService } from './claims.service';

/**
 * Claim-invite endpoints. `GET /claims/:token` is deliberately public — a
 * player opening a claim link may not have an account yet — while accepting
 * a claim requires a session.
 */
@Controller('claims')
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Get(':token')
  async preview(@Param('token') token: string) {
    return this.claimsService.preview(token);
  }

  @Post(':token/accept')
  @UseGuards(AuthGuard)
  async accept(
    @Param('token') token: string,
    @CurrentUser() user: SessionUser,
  ) {
    return this.claimsService.accept(token, user.id);
  }
}
