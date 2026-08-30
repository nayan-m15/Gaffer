import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [MatchesController],
  providers: [MatchesService],
})
export class MatchesModule {}
