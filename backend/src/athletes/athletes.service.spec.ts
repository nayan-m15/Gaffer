import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { AthletesService } from './athletes.service';

describe('AthletesService', () => {
  let service: AthletesService;

  const mockDatabaseService = {
    database: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AthletesService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<AthletesService>(AthletesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
