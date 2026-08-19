import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard, type SessionUser } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';

/**
 * Aggregated dashboard summary for the signed-in coach.
 *
 * Returns active athlete count, total event count, and the next five
 * upcoming events, all scoped to the coach's team.
 */
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getSummary(@CurrentUser() user: SessionUser) {
    return this.dashboardService.getSummary(user.id);
  }
}
