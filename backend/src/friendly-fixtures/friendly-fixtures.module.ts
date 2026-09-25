import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { FriendlyFixturesController } from './friendly-fixtures.controller';
import { FriendlyFixturesService } from './friendly-fixtures.service';

@Module({
  imports: [TeamsModule],
  controllers: [FriendlyFixturesController],
  providers: [FriendlyFixturesService],
  exports: [FriendlyFixturesService],
})
export class FriendlyFixturesModule {}
