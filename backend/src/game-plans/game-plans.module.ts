import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { GamePlansController } from './game-plans.controller';
import { GamePlansService } from './game-plans.service';

@Module({
  imports: [TeamsModule],
  controllers: [GamePlansController],
  providers: [GamePlansService],
})
export class GamePlansModule {}
