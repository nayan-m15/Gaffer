import { ServiceUnavailableException } from '@nestjs/common';

jest.mock('../auth/auth.guard', () => ({ AuthGuard: class AuthGuard {} }));

import { SyncController } from './sync.controller';

describe('SyncController', () => {
  const originalEnv = { ...process.env };
  const matchA = '11111111-1111-4111-8111-111111111111';
  const matchB = '22222222-2222-4222-8222-222222222222';
  const observation = (matchId: string, clientRequestId: string) => ({
    kind: 'observation' as const,
    matchId,
    payload: {
      clientRequestId,
      team: 'own' as const,
      eventType: 'goal' as const,
      minute: 1,
    },
  });

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
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'true';
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
    const claims = JSON.parse(
      Buffer.from(result.token.split('.')[1], 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    expect(claims).toMatchObject({
      user_id: 'user-1',
      team_id: 'team-1',
      two_sided_live_logging: 'true',
    });
    process.env.TWO_SIDED_LIVE_LOGGING_ENABLED = 'false';
    const disabledResult = await controller.token({ id: 'user-1' } as never);
    const disabledClaims = JSON.parse(
      Buffer.from(disabledResult.token.split('.')[1], 'base64url').toString(
        'utf8',
      ),
    ) as Record<string, unknown>;
    expect(disabledClaims.two_sided_live_logging).toBe('false');
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

  it('runs different matches concurrently while preserving same-match order and receipt order', async () => {
    const controller = new SyncController(
      {} as never,
      {} as never,
      {} as never,
    );
    const items = [
      observation(matchA, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
      observation(matchB, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
      observation(matchA, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'),
    ];
    const started: string[] = [];
    const release = new Map<string, () => void>();
    Object.defineProperty(controller, 'processUploadItem', {
      value: jest.fn(async (_userId: string, item: (typeof items)[number]) => {
        const id = item.payload.clientRequestId;
        started.push(id);
        await new Promise<void>((resolve) => release.set(id, resolve));
        return { id, outcome: 'accepted' };
      }),
    });

    const upload = controller.upload({ id: 'user-1' } as never, { items });
    await new Promise(setImmediate);
    expect(started).toEqual([
      items[0].payload.clientRequestId,
      items[1].payload.clientRequestId,
    ]);
    release.get(items[1].payload.clientRequestId)!();
    await new Promise(setImmediate);
    expect(started).toHaveLength(2);
    release.get(items[0].payload.clientRequestId)!();
    await new Promise(setImmediate);
    expect(started[2]).toBe(items[2].payload.clientRequestId);
    release.get(items[2].payload.clientRequestId)!();
    const result = await upload;
    expect(result.receipts).toEqual(
      items.map((item) => ({
        id: item.payload.clientRequestId,
        outcome: 'accepted',
      })),
    );
  });

  it('waits for a causal parent before processing a later operation', async () => {
    const controller = new SyncController(
      {} as never,
      {} as never,
      {} as never,
    );
    const parent = observation(matchA, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    const child = {
      kind: 'operation' as const,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      matchId: matchB,
      operationType: 'correct' as const,
      canonicalEventId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      replacement: { minute: 2 },
      causalParentIds: [parent.payload.clientRequestId],
    };
    const started: string[] = [];
    let releaseParent: () => void = () => undefined;
    Object.defineProperty(controller, 'processUploadItem', {
      value: jest.fn(
        async (_userId: string, item: typeof parent | typeof child) => {
          started.push(item.kind);
          if (item.kind === 'observation') {
            await new Promise<void>((resolve) => {
              releaseParent = resolve;
            });
          }
          return { outcome: 'accepted' };
        },
      ),
    });

    const upload = controller.upload({ id: 'user-1' } as never, {
      items: [parent, child],
    });
    await new Promise(setImmediate);
    expect(started).toEqual(['observation']);
    releaseParent();
    await upload;
    expect(started).toEqual(['observation', 'operation']);
  });
});
