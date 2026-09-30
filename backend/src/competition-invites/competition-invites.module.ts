import { Module } from '@nestjs/common';
import { CompetitionInvitesController } from './competition-invites.controller';
import { CompetitionInvitesService } from './competition-invites.service';

@Module({
  controllers: [CompetitionInvitesController],
  providers: [CompetitionInvitesService],
})
export class CompetitionInvitesModule {}
