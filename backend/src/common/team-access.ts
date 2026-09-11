import { NotFoundException } from '@nestjs/common';
import type { TeamsService } from '../teams/teams.service';

/**
 * Canonical team authorization policy used by feature controllers.
 * Members may read team data; only coaches may mutate managed resources.
 */
export async function requireTeamId(
  teamsService: TeamsService,
  userId: string,
): Promise<string> {
  const team = await teamsService.findTeamForUser(userId);
  if (!team) {
    throw new NotFoundException('Team not found.');
  }
  return team.id;
}

export async function requireCoachTeamId(
  teamsService: TeamsService,
  userId: string,
): Promise<string> {
  const team = await teamsService.requireCoachTeam(userId);
  return team.id;
}
