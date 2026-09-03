import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import { LineupsController } from './lineups.controller';
import { LineupsService } from './lineups.service';

describe('LineupsController', () => {
  let controller: LineupsController;

  const mockLineupsService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LineupsController],
      providers: [
        {
          provide: LineupsService,
          useValue: mockLineupsService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<LineupsController>(LineupsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
