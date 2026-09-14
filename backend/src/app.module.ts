import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { EventsModule } from './events/events.module';
import { GamePlansModule } from './game-plans/game-plans.module';
import { MatchesModule } from './matches/matches.module';
import { SeasonsModule } from './seasons/seasons.module';
import { StatisticsModule } from './statistics/statistics.module';
import { TeamsModule } from './teams/teams.module';
import { AthletesModule } from './athletes/athletes.module';
import { ProfileModule } from './profile/profile.module';
import { ClaimsModule } from './claims/claims.module';
import { TeamInvitesModule } from './team-invites/team-invites.module';
import { PlayerModule } from './player/player.module';
import { WeatherModule } from './weather/weather.module';
import { PublicApiModule } from './public-api/public-api.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    TeamsModule,
    AthletesModule,
    ClaimsModule,
    TeamInvitesModule,
    PlayerModule,
    EventsModule,
    GamePlansModule,
    MatchesModule,
    DashboardModule,
    SeasonsModule,
    StatisticsModule,
    ProfileModule,
    WeatherModule,
    PublicApiModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
