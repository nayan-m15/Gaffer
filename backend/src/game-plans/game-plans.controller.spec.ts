import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { TeamsService } from '../teams/teams.service';
import { GamePlansController } from './game-plans.controller';
import { GamePlansService } from './game-plans.service';

describe('GamePlansController', () => {
  let controller: GamePlansController;

  const mockGamePlansService = {
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
      controllers: [GamePlansController],
      providers: [
        {
          provide: GamePlansService,
          useValue: mockGamePlansService,
        },
        {
          provide: TeamsService,
          useValue: mockTeamsService,
        },
      ],
    }).compile();

    controller = module.get<GamePlansController>(GamePlansController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
