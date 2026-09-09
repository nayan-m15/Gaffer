import { Module } from '@nestjs/common';
import { TeamsModule } from '../teams/teams.module';
import { TeamInvitesController } from './team-invites.controller';
import { TeamInvitesService } from './team-invites.service';

@Module({
  // TeamInvitesService accepts invites through TeamsService.addAssistantMember
  // so every team_members write stays in the module that owns the table.
  imports: [TeamsModule],
  controllers: [TeamInvitesController],
  providers: [TeamInvitesService],
})
export class TeamInvitesModule {}
