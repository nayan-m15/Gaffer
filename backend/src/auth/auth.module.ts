import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { TeamsModule } from '../teams/teams.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [TeamsModule, AthletesModule],
  controllers: [AuthController],
  providers: [AuthGuard, AuthService],
  exports: [AuthGuard],
})
export class AuthModule {}
