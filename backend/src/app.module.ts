import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { AthletesModule } from './athletes/athletes.module';
import { TeamsModule } from './teams/teams.module';

@Module({
  imports: [DatabaseModule, AuthModule, TeamsModule, AthletesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
