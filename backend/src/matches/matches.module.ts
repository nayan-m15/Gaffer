import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendlyFixturesModule } from '../friendly-fixtures/friendly-fixtures.module';
import { InsightsModule } from '../insights/insights.module';
import { TeamsModule } from '../teams/teams.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [AuthModule, TeamsModule, InsightsModule, FriendlyFixturesModule],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}
