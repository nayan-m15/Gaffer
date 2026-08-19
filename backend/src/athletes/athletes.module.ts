import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { AthletesController } from './athletes.controller';
import { AthletesService } from './athletes.service';

@Module({
  imports: [TeamsModule],
  controllers: [AthletesController],
  providers: [AthletesService],
})
export class AthletesModule {}
