import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { LineupsController } from './lineups.controller';
import { LineupsService } from './lineups.service';

@Module({
  imports: [TeamsModule],
  controllers: [LineupsController],
  providers: [LineupsService],
})
export class LineupsModule {}
