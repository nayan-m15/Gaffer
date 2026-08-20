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
      const mockUser = { id: 'user-1', name: 'Coach', email: 'c@test.com' };
      mockProfileService.getProfile.mockResolvedValue(mockUser);

      await controller.getProfile(mockUser);

      expect(mockProfileService.getProfile).toHaveBeenCalledWith('user-1');
    });
  });

  describe('updateProfile', () => {
    it('should call the service with the authenticated user ID and validated input', async () => {
      const mockUser = { id: 'user-1', name: 'Coach', email: 'c@test.com' };
      const updated = { ...mockUser, name: 'New Name' };
      mockProfileService.updateProfile.mockResolvedValue(updated);

      await controller.updateProfile(mockUser, { name: 'New Name' });

      expect(mockProfileService.updateProfile).toHaveBeenCalledWith('user-1', {
        name: 'New Name',
      });
    });
  });
});
