import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { AuthModule } from '../auth/auth.module';
import { TeamsModule } from '../teams/teams.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [AuthModule, TeamsModule, AthletesModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
