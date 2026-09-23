import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { MatchesModule } from '../matches/matches.module';
import { SyncController } from './sync.controller';
import { SyncJwksController } from './sync-jwks.controller';

@Module({
  imports: [AuthModule, TeamsModule, MatchesModule],
  controllers: [SyncController, SyncJwksController],
})
export class SyncModule {}
