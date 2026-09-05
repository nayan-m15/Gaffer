import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { TeamsModule } from '../teams/teams.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [TeamsModule, AthletesModule],
  controllers: [AuthController],
  providers: [AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}
