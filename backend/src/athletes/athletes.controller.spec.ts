import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import { AthletesController } from './athletes.controller';
import { AthletesService } from './athletes.service';

describe('AthletesController', () => {
  let controller: AthletesController;

  const mockAthletesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    restore: jest.fn(),
    findArchived: jest.fn(),
  };

  const mockTeamsService = {
    findTeamForUser: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AthletesController],
      providers: [
        {
          provide: AthletesService,
          useValue: mockAthletesService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<AthletesController>(AthletesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
