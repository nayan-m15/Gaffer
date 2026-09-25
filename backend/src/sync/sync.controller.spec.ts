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
    delete process.env.POWERSYNC_PRIVATE_KEY;
    delete process.env.POWERSYNC_KID;
    const controller = new SyncController(
      {} as never,
      {} as never,
      {} as never,
    );
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
    const controller = new SyncController(
      {
        findTeamForUser: jest.fn().mockResolvedValue({
          id: 'team-1',
          role: 'assistant',
        }),
      } as never,
      {} as never,
      {} as never,
    );
    const result = await controller.token({ id: 'user-1' } as never);
    expect(result.endpoint).toBe(process.env.POWERSYNC_URL);
    expect(result.token.split('.')).toHaveLength(3);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('leaves an upload retriable when the database fails after ingestion', async () => {
    const timeout = new Error('database connection timed out');
    const query = {
      select: jest.fn(),
      insert: jest.fn(),
    };
    query.select.mockReturnValue({
      from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
    });
    const controller = new SyncController(
      {} as never,
      { logEvent: jest.fn().mockRejectedValue(timeout) } as never,
      { database: query } as never,
    );
    const item = {
      kind: 'observation',
      matchId: '11111111-1111-4111-8111-111111111111',
      payload: {
        clientRequestId: '22222222-2222-4222-8222-222222222222',
        team: 'opponent',
        eventType: 'goal',
        minute: 12,
      },
    };
    await expect(
      controller.upload({ id: 'user-1' } as never, { items: [item] }),
    ).rejects.toBe(timeout);
    expect(query.insert).not.toHaveBeenCalled();
  });
});
