import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { AuthModule } from '../auth/auth.module';
import { EventsModule } from '../events/events.module';
import { StatisticsModule } from '../statistics/statistics.module';
import { PlayerController } from './player.controller';
import { PlayerService } from './player.service';

@Module({
  imports: [AuthModule, AthletesModule, EventsModule, StatisticsModule],
  controllers: [PlayerController],
  providers: [PlayerService],
})
export class PlayerModule {}
