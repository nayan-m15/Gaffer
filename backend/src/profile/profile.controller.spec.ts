/// <reference types="jest" />

import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

describe('ProfileController', () => {
  let controller: ProfileController;

  const mockProfileService = {
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: mockProfileService,
        },
      ],
    }).compile();

    controller = module.get<ProfileController>(ProfileController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getProfile', () => {
    it('should call the service with the authenticated user ID', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };
      mockProfileService.getProfile.mockResolvedValue(mockUser);

      await controller.getProfile(mockUser);

      expect(mockProfileService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateProfile', () => {
    const validInput = {
      name: 'New Name',
      phoneNumber: '07123 456789',
      sex: 'male',
      dateOfBirth: '1990-05-15',
    };

    it('should call the service with the authenticated user ID and validated input', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };
      const updated = { ...mockUser, ...validInput };
      mockProfileService.updateProfile.mockResolvedValue(updated);

      await controller.updateProfile(mockUser, validInput);

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith('user-1', {
        name: 'New Name',
        phoneNumber: '07123 456789',
        sex: 'male',
        dateOfBirth: '1990-05-15',
      });
    });

    it('should allow updating phone number, sex, and date of birth', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };
      mockProfileService.updateProfile.mockResolvedValue(mockUser);

      await controller.updateProfile(mockUser, validInput);

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          phoneNumber: '07123 456789',
          sex: 'male',
          dateOfBirth: '1990-05-15',
        }),
      );
    });

    it('should allow clearing optional fields with null', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };
      mockProfileService.updateProfile.mockResolvedValue(mockUser);

      await controller.updateProfile(mockUser, {
        name: 'Coach',
        phoneNumber: null,
        sex: null,
        dateOfBirth: null,
      });

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith('user-1', {
        name: 'Coach',
        phoneNumber: null,
        sex: null,
        dateOfBirth: null,
      });
    });

    it('should reject an invalid sex value', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };

      await expect(
        controller.updateProfile(mockUser, {
          ...validInput,
          sex: 'other',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockProfileService.updateProfile).not.toHaveBeenCalled();
    });

    it('should reject a future date of birth', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const futureStr = futureDate.toISOString().slice(0, 10);

      await expect(
        controller.updateProfile(mockUser, {
          ...validInput,
          dateOfBirth: futureStr,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockProfileService.updateProfile).not.toHaveBeenCalled();
    });

    it('should strip restricted fields (email, role, teamId) from the body', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };
      mockProfileService.updateProfile.mockResolvedValue(mockUser);

      await controller.updateProfile(mockUser, {
        ...validInput,
        email: 'hacker@evil.com',
        emailVerified: true,
        role: 'coach',
        teamId: 'team-999',
        id: 'different-user',
        createdAt: '2020-01-01',
        updatedAt: '2020-01-02',
      });

      // The service should only receive the allowed fields — restricted
      // fields are silently stripped by Zod's default object parsing.
      expect(mockProfileService.updateProfile).toHaveBeenCalledWith('user-1', {
        name: 'New Name',
        phoneNumber: '07123 456789',
        sex: 'male',
        dateOfBirth: '1990-05-15',
      });
    });

    it('should reject when name is empty', async () => {
      const mockUser = {
        id: 'user-1',
        name: 'Coach',
        email: 'c@test.com',
        emailVerified: true,
      };

      await expect(
        controller.updateProfile(mockUser, {
          ...validInput,
          name: '   ',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(mockProfileService.updateProfile).not.toHaveBeenCalled();
    });
  });
});
