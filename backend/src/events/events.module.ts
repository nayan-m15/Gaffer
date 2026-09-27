import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { AuthModule } from '../auth/auth.module';
import { FriendlyFixturesModule } from '../friendly-fixtures/friendly-fixtures.module';
import { TeamsModule } from '../teams/teams.module';
import { WeatherModule } from '../weather/weather.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  imports: [
    AuthModule,
    TeamsModule,
    AthletesModule,
    WeatherModule,
    FriendlyFixturesModule,
  ],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
