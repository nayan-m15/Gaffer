import { Test, TestingModule } from '@nestjs/testing';
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
  };

  const mockDatabaseService = {
    database: mockDatabase,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

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
