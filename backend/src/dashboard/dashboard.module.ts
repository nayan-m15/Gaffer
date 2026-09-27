import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InsightsModule } from '../insights/insights.module';
import { StatisticsModule } from '../statistics/statistics.module';
import { TeamsModule } from '../teams/teams.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule, TeamsModule, StatisticsModule, InsightsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
