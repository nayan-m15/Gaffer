import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SessionUser } from '../auth/auth.guard';
import { TeamsController } from './teams.controller';
import { TeamsService } from './teams.service';

jest.mock('../auth/auth.guard', () => ({ AuthGuard: class MockAuthGuard {} }));

const user: SessionUser = {
  id: 'coach-1',
  name: 'Coach',
  email: 'coach@example.com',
  emailVerified: true,
};
const team = {
  id: 'team-1',
  name: 'Gaffer FC',
  primaryColor: '#123456',
  role: 'coach',
};

describe('TeamsController', () => {
  let controller: TeamsController;
  const service = {
    searchTeams: jest.fn(),
    createTeamForUser: jest.fn(),
    updateTeamForUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [TeamsController],
      providers: [{ provide: TeamsService, useValue: service }],
    }).compile();
    controller = module.get(TeamsController);
  });

  it('trims the search term and returns matching teams', async () => {
    service.searchTeams.mockResolvedValueOnce([team]);
    await expect(controller.searchTeams(user, '  Gaffer  ')).resolves.toEqual([
      team,
    ]);
    expect(service.searchTeams).toHaveBeenCalledWith(user.id, 'Gaffer');
  });

  it.each([undefined, '', '   ', 'a'.repeat(101)])(
    'rejects an invalid search term: %p',
    async (term) => {
      await expect(controller.searchTeams(user, term)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.searchTeams).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, '#123456'])(
    'creates a team with optional colour %p and trims its name',
    async (primaryColor) => {
      service.createTeamForUser.mockResolvedValueOnce(team);
      await expect(
        controller.createTeam({ name: '  Gaffer FC  ', primaryColor }, user),
      ).resolves.toEqual({ team });
      expect(service.createTeamForUser).toHaveBeenCalledWith(
        user.id,
        'Gaffer FC',
        primaryColor,
      );
    },
  );

  it.each([
    {},
    { name: ' ' },
    { name: 'a'.repeat(101) },
    { name: 'Gaffer', primaryColor: 'red' },
  ])('rejects an invalid team creation: %p', async (body) => {
    await expect(controller.createTeam(body, user)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(service.createTeamForUser).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'Renamed' },
    { primaryColor: null },
    { primaryColor: '#ABCDEF' },
  ])('passes a valid team update to the service: %p', async (body) => {
    service.updateTeamForUser.mockResolvedValueOnce(team);
    await expect(controller.updateTeam(body, user)).resolves.toEqual({ team });
    expect(service.updateTeamForUser).toHaveBeenCalledWith(user.id, body);
  });

  it.each([{}, { name: ' ' }, { primaryColor: '#123' }])(
    'rejects an invalid team update: %p',
    async (body) => {
      await expect(controller.updateTeam(body, user)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(service.updateTeamForUser).not.toHaveBeenCalled();
    },
  );

  it('preserves the conflict when an account already has a team', async () => {
    const error = new ConflictException('This account already has a team.');
    service.createTeamForUser.mockRejectedValueOnce(error);
    await expect(
      controller.createTeam({ name: 'Gaffer FC' }, user),
    ).rejects.toBe(error);
  });

  it('preserves the coach-only update rejection', async () => {
    const error = new ForbiddenException(
      'Only coaches can perform this action.',
    );
    service.updateTeamForUser.mockRejectedValueOnce(error);
    await expect(
      controller.updateTeam({ name: 'Gaffer FC' }, user),
    ).rejects.toBe(error);
  });
});
