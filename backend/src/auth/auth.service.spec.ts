import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const mockDatabaseService = {
    database: {},
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('userEmailExists', () => {
    it('returns true when a user row matches', async () => {
      const limit = jest.fn().mockResolvedValue([{ id: 'user-id' }]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      mockDatabaseService.database = { select };

      await expect(service.userEmailExists('coach@example.com')).resolves.toBe(
        true,
      );
    });

    it('returns false when no user row matches', async () => {
      const limit = jest.fn().mockResolvedValue([]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      mockDatabaseService.database = { select };

      await expect(service.userEmailExists('coach@example.com')).resolves.toBe(
        false,
      );
    });

    it('looks the address up lower-cased, like Better Auth does', async () => {
      const limit = jest.fn().mockResolvedValue([{ id: 'user-id' }]);
      const where = jest.fn().mockReturnValue({ limit });
      const from = jest.fn().mockReturnValue({ where });
      const select = jest.fn().mockReturnValue({ from });
      mockDatabaseService.database = { select };

      await service.userEmailExists('Coach@Example.com');

      // The drizzle eq() call embeds the compared literal as a Param chunk
      // in the SQL object, so the captured argument's chunk values must
      // carry the lower-cased email and never the mixed-case one.
      const whereCalls = where.mock.calls as unknown[][];
      const sqlArg = whereCalls[0][0] as {
        queryChunks: Array<{ value?: unknown }>;
      };
      const chunkValues = sqlArg.queryChunks.map((chunk) => chunk.value);
      expect(chunkValues).toContain('coach@example.com');
      expect(chunkValues).not.toContain('Coach@Example.com');
    });
  });
});
