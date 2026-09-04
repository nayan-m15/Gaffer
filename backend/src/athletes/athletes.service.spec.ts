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

  describe('create', () => {
    it('persists the provided status', async () => {
      const athlete = { id: 'athlete-id', status: 'injured' };
      const returning = jest.fn().mockResolvedValue([athlete]);
      const values = jest.fn().mockReturnValue({ returning });
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      const result = await service.create('team-id', {
        firstName: 'Alex',
        lastName: 'Morgan',
        status: 'injured',
      });

      expect(values).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-id', status: 'injured' }),
      );
      expect(result).toBe(athlete);
    });

    it('omits status when not provided so the database default applies', async () => {
      const athlete = { id: 'athlete-id', status: 'available' };
      const returning = jest.fn().mockResolvedValue([athlete]);
      const values = jest.fn().mockReturnValue({ returning });
      const insert = jest.fn().mockReturnValue({ values });
      mockDatabaseService.database = { insert };

      const result = await service.create('team-id', {
        firstName: 'Alex',
        lastName: 'Morgan',
      });

      // The status key must be absent entirely so the column default
      // ('available') applies on insert.
      expect(values).toHaveBeenCalledWith({
        teamId: 'team-id',
        firstName: 'Alex',
        lastName: 'Morgan',
      });
      expect(result).toBe(athlete);
    });
  });

  describe('update', () => {
    it('updates the athlete status', async () => {
      const athlete = { id: 'athlete-id', status: 'suspended' };
      const returning = jest.fn().mockResolvedValue([athlete]);
      const where = jest.fn().mockReturnValue({ returning });
      const set = jest.fn().mockReturnValue({ where });
      const update = jest.fn().mockReturnValue({ set });
      mockDatabaseService.database = { update };

      const result = await service.update('team-id', 'athlete-id', {
        status: 'suspended',
      });

      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'suspended' }),
      );
      expect(result).toBe(athlete);
    });
  });
});
