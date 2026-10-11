import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { SessionUser } from '../auth/auth.guard';
import { FriendlyFixturesController } from './friendly-fixtures.controller';
import { FriendlyFixturesService } from './friendly-fixtures.service';

jest.mock('../auth/auth.guard', () => ({
  AuthGuard: class MockAuthGuard {},
}));

const user: SessionUser = {
  id: 'coach-1',
  name: 'Coach',
  email: 'coach@example.com',
  emailVerified: true,
};
const fixtureId = '83ff97e6-a665-4605-9e72-c6f810d90202';

describe('FriendlyFixturesController', () => {
  let controller: FriendlyFixturesController;
  const service = {
    listIncoming: jest.fn(),
    accept: jest.fn(),
    decline: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      controllers: [FriendlyFixturesController],
      providers: [{ provide: FriendlyFixturesService, useValue: service }],
    }).compile();
    controller = module.get(FriendlyFixturesController);
  });

  it('returns incoming requests for the authenticated user', async () => {
    const requests = [{ id: fixtureId, status: 'pending' }];
    service.listIncoming.mockResolvedValueOnce(requests);
    await expect(controller.listIncoming(user)).resolves.toEqual(requests);
    expect(service.listIncoming).toHaveBeenCalledWith(user.id);
  });

  it.each(['accept', 'decline'] as const)(
    'returns the %s response for the selected request',
    async (action) => {
      const result = {
        id: fixtureId,
        status: action === 'accept' ? 'accepted' : 'declined',
      };
      service[action].mockResolvedValueOnce(result);
      await expect(controller[action](user, fixtureId)).resolves.toEqual(
        result,
      );
      expect(service[action]).toHaveBeenCalledWith(user.id, fixtureId);
    },
  );

  it.each(['accept', 'decline'] as const)(
    'preserves authorization and missing-request errors during %s',
    async (action) => {
      for (const error of [
        new ForbiddenException('Only coaches can perform this action.'),
        new NotFoundException('Fixture not found.'),
      ]) {
        service[action].mockRejectedValueOnce(error);
        await expect(controller[action](user, fixtureId)).rejects.toBe(error);
      }
    },
  );
});
