import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TeamsService } from '../teams/teams.service';
import { MatchesService } from './matches.service';

function emptyQuery() {
  const query: Record<string, unknown> = {};
  query.from = jest.fn(() => query);
  query.innerJoin = jest.fn(() => query);
  query.leftJoin = jest.fn(() => query);
  query.where = jest.fn(() => query);
  query.limit = jest.fn(() => Promise.resolve([]));
  return query;
}

describe('MatchesService report access', () => {
  it("does not expose another team's match by id", async () => {
    const databaseService = {
      database: { select: jest.fn(() => emptyQuery()) },
    } as unknown as DatabaseService;
    const teamsService = {
      findTeamForUser: jest.fn().mockResolvedValue({
        id: 'requesting-team',
        name: 'Requesting FC',
        role: 'coach',
        primaryColor: null,
      }),
    } as unknown as TeamsService;
    const service = new MatchesService(databaseService, teamsService);

    await expect(
      service.findOne('coach-1', 'other-team-match'),
    ).rejects.toThrow(NotFoundException);
  });

  it('requires a team membership before loading report data', async () => {
    const select = jest.fn(() => emptyQuery());
    const databaseService = {
      database: { select },
    } as unknown as DatabaseService;
    const teamsService = {
      findTeamForUser: jest.fn().mockResolvedValue(null),
    } as unknown as TeamsService;
    const service = new MatchesService(databaseService, teamsService);

    await expect(
      service.findOne('user-without-team', 'match-1'),
    ).rejects.toThrow(ForbiddenException);
    expect(select).not.toHaveBeenCalled();
  });
});
