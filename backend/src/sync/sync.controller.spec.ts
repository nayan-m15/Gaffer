import { ServiceUnavailableException } from '@nestjs/common';

jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));

import { SyncController } from './sync.controller';

describe('SyncController', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('fails closed when PowerSync signing is not configured', async () => {
    delete process.env.POWERSYNC_URL;
    delete process.env.POWERSYNC_SHARED_SECRET;
    delete process.env.POWERSYNC_KID;
    const controller = new SyncController({} as never);
    await expect(
      controller.token({ id: 'user-1' } as never),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('issues a short-lived token containing the authorised team', async () => {
    process.env.POWERSYNC_URL = 'https://example.powersync.journeyapps.com';
    process.env.POWERSYNC_KID = 'test-key';
    process.env.POWERSYNC_SHARED_SECRET = Buffer.from(
      'a sufficiently long development secret',
    ).toString('base64url');
    const controller = new SyncController({
      findTeamForUser: jest.fn().mockResolvedValue({
        id: 'team-1',
        role: 'assistant',
      }),
    } as never);
    const result = await controller.token({ id: 'user-1' } as never);
    expect(result.endpoint).toBe(process.env.POWERSYNC_URL);
    expect(result.token.split('.')).toHaveLength(3);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});
