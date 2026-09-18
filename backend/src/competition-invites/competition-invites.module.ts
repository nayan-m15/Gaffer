import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { CompetitionInvitesController } from './competition-invites.controller';
import { CompetitionInvitesService } from './competition-invites.service';

@Module({
  imports: [TeamsModule],
  controllers: [CompetitionInvitesController],
  providers: [CompetitionInvitesService],
})
export class CompetitionInvitesModule {}
