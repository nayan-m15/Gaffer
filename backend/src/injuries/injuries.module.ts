import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { InjuriesController } from './injuries.controller';
import { InjuriesService } from './injuries.service';

@Module({
  imports: [TeamsModule],
  controllers: [InjuriesController],
  providers: [InjuriesService],
  exports: [InjuriesService],
})
export class InjuriesModule {}
