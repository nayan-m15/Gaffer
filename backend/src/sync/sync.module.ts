import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { SyncController } from './sync.controller';

@Module({
  imports: [AuthModule, TeamsModule],
  controllers: [SyncController],
})
export class SyncModule {}
