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

  it('requires coordinates for custom formations', async () => {
    await expect(
      service.create('team-id', {
        name: 'Custom seven',
        formationId: 'custom-7',
        assignments: {},
        customPositions: null,
      } as never),
    ).rejects.toThrow('require exactly 7 position slots');
  });

  it('rejects more starters than the selected format allows', async () => {
    const assignments = Object.fromEntries(
      Array.from({ length: 6 }, (_, index) => [
        `slot-${index}`,
        `athlete-${index}`,
      ]),
    );

    await expect(
      service.create('team-id', {
        name: 'Five-a-side',
        formationId: '5v5-1-2-1',
        assignments,
      } as never),
    ).rejects.toThrow('at most 5 starting athletes');
  });
});
