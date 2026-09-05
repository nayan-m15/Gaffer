import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { StatisticsController } from './statistics.controller';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}
