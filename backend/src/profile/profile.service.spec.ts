import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  let service: ProfileService;

  const mockUser = {
    id: 'user-1',
    name: 'Coach Smith',
    email: 'coach@example.com',
    emailVerified: true,
    image: null,
    phoneNumber: null,
    sex: null,
    dateOfBirth: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockQueryChain = {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue([mockUser]),
  };

  const mockUpdateChain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([mockUser]),
  };

  const mockDatabase = {
    select: jest.fn().mockReturnValue(mockQueryChain),
    update: jest.fn().mockReturnValue(mockUpdateChain),
    execute: jest.fn<Promise<{ rows: { id: string }[] }>, [SQL]>(),
  };

  const mockDatabaseService = {
    database: mockDatabase,
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockDatabase.execute.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deleteProfile', () => {
    it('anonymizes the user and removes access in one statement scoped to that user', async () => {
      mockDatabase.execute.mockResolvedValueOnce({
        rows: [{ id: mockUser.id }],
      });

      await expect(service.deleteProfile(mockUser.id)).resolves.toEqual({
        status: true,
      });

      expect(mockDatabase.execute).toHaveBeenCalledTimes(1);
      const query = new PgDialect().sqlToQuery(
        mockDatabase.execute.mock.calls[0][0],
      );
      expect(query.params).toEqual([
        mockUser.id,
        mockUser.id,
        mockUser.id,
        mockUser.id,
        `deleted+${mockUser.id}@deleted.invalid`,
        mockUser.id,
      ]);
      expect(query.sql).toMatch(/update athletes\s+set user_id = null/);
      for (const table of ['team_members', 'session', 'account']) {
        expect(query.sql).toContain(`delete from ${table}`);
      }
      expect(query.sql).toContain("name = 'Deleted User'");
      expect(query.sql).toContain('email_verified = false');
      for (const column of ['image', 'phone_number', 'sex', 'date_of_birth']) {
        expect(query.sql).toContain(`${column} = null`);
      }
      expect(mockDatabase.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown user before deleting anything', async () => {
      mockQueryChain.limit.mockResolvedValueOnce([]);
      await expect(service.deleteProfile('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mockDatabase.execute).not.toHaveBeenCalled();
    });

    it('rejects if the user disappears between lookup and anonymization', async () => {
      mockDatabase.execute.mockResolvedValueOnce({ rows: [] });
      await expect(service.deleteProfile(mockUser.id)).rejects.toThrow(
        'User not found.',
      );
    });

    it('propagates a failed deletion instead of reporting success', async () => {
      const error = new Error('database unavailable');
      mockDatabase.execute.mockRejectedValueOnce(error);
      await expect(service.deleteProfile(mockUser.id)).rejects.toBe(error);
    });
  });

  describe('getProfile', () => {
    it('should query the user by the provided user ID', async () => {
      await service.getProfile('user-1');

      expect(mockDatabase.select).toHaveBeenCalled();
      expect(mockQueryChain.where).toHaveBeenCalled();
      expect(mockQueryChain.limit).toHaveBeenCalledWith(1);
    });

    it('should return the user record when found', async () => {
      const result = await service.getProfile('user-1');
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when the user is not found', async () => {
      mockQueryChain.limit.mockResolvedValueOnce([]);

      await expect(service.getProfile('missing')).rejects.toThrow(
        'User not found.',
      );
    });
  });

  describe('updateProfile', () => {
    it('should update the user with the provided user ID', async () => {
      await service.updateProfile('user-1', {
        name: 'New Name',
        phoneNumber: null,
        sex: null,
        dateOfBirth: null,
      });

      expect(mockDatabase.update).toHaveBeenCalled();
      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Name' }),
      );
      expect(mockUpdateChain.where).toHaveBeenCalled();
    });

    it('should update phone number, sex, and date of birth', async () => {
      await service.updateProfile('user-1', {
        name: 'Coach Smith',
        phoneNumber: '07123 456789',
        sex: 'male',
        dateOfBirth: '1990-05-15',
      });

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Coach Smith',
          phoneNumber: '07123 456789',
          sex: 'male',
          dateOfBirth: '1990-05-15',
        }),
      );
    });

    it('should allow clearing optional fields with null', async () => {
      await service.updateProfile('user-1', {
        name: 'Coach Smith',
        phoneNumber: null,
        sex: null,
        dateOfBirth: null,
      });

      expect(mockUpdateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({
          phoneNumber: null,
          sex: null,
          dateOfBirth: null,
        }),
      );
    });

    it('should return the updated user record', async () => {
      const result = await service.updateProfile('user-1', {
        name: 'Updated Coach',
        phoneNumber: null,
        sex: null,
        dateOfBirth: null,
      });
      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException when the user is not found', async () => {
      mockUpdateChain.returning.mockResolvedValueOnce([]);

      await expect(
        service.updateProfile('missing', {
          name: 'New Name',
          phoneNumber: null,
          sex: null,
          dateOfBirth: null,
        }),
      ).rejects.toThrow('User not found.');
    });
  });
});
