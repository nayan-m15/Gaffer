import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { GamePlansService } from './game-plans.service';

describe('GamePlansService', () => {
  let service: GamePlansService;

  const mockDatabaseService = {
    database: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamePlansService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<GamePlansService>(GamePlansService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
