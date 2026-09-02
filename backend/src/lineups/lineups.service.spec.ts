import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { LineupsService } from './lineups.service';

describe('LineupsService', () => {
  let service: LineupsService;

  const mockDatabaseService = {
    database: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineupsService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<LineupsService>(LineupsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
