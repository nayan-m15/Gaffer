import { Module } from '@nestjs/common';
import { ClaimsModule } from '../claims/claims.module';
import { TeamsModule } from '../teams/teams.module';
import { AthletesController } from './athletes.controller';
import { AthletesService } from './athletes.service';

@Module({
  imports: [TeamsModule, ClaimsModule],
  controllers: [AthletesController],
  providers: [AthletesService],
  exports: [AthletesService],
})
export class AthletesModule {}
