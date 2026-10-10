import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  PublicDashboardRateLimitService,
  RATE_LIMITED_MESSAGE,
  backstopRule,
  limitRule,
} from './public-dashboard-rate-limit.service';

const ENV_NAMES = [
  'PUBLIC_DASHBOARD_RATE_LIMIT',
  'PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT',
] as const;

describe('PublicDashboardRateLimitService', () => {
  let service: PublicDashboardRateLimitService;

  beforeEach(() => {
    for (const name of ENV_NAMES) delete process.env[name];
    service = new PublicDashboardRateLimitService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const name of ENV_NAMES) delete process.env[name];
  });

  const spend = (times: number, primaryIp = '203.0.113.5') => {
    for (let index = 0; index < times; index += 1) {
      service.enforce({ primaryIp });
    }
  };

  it('allows a burst inside the budget and rejects the request past it', () => {
    process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '3:60';

    expect(() => spend(3)).not.toThrow();
    expect(() => spend(1)).toThrow(RATE_LIMITED_MESSAGE);
  });

  it('rejects with 429 rather than a generic error', () => {
    process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '1:60';
    spend(1);

    try {
      spend(1);
      throw new Error('expected the limiter to reject');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  });

  it('budgets each client independently', () => {
    process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '2:60';

    expect(() => spend(2, '203.0.113.5')).not.toThrow();
    expect(() => spend(2, '198.51.100.9')).not.toThrow();
    expect(() => spend(1, '203.0.113.5')).toThrow(RATE_LIMITED_MESSAGE);
  });

  it('starts a fresh window once the previous one lapses', () => {
    process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '2:60';
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

    spend(2);
    expect(() => spend(1)).toThrow(RATE_LIMITED_MESSAGE);

    nowSpy.mockReturnValue(1_000 + 60_000);
    expect(() => spend(1)).not.toThrow();
  });

  it('charges the unforgeable backstop before the forgeable client bucket', () => {
    process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '100:60';
    process.env.PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT = '2:60';

    // A caller rotating the spoofable header still shares one backstop bucket.
    service.enforce({ primaryIp: '1.1.1.1', edgeIp: '203.0.113.5' });
    service.enforce({ primaryIp: '2.2.2.2', edgeIp: '203.0.113.5' });

    expect(() =>
      service.enforce({ primaryIp: '3.3.3.3', edgeIp: '203.0.113.5' }),
    ).toThrow(RATE_LIMITED_MESSAGE);
  });

  it('counts a direct request once, not against two buckets', () => {
    process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '2:60';

    // No `edgeIp` means the identity was already unforgeable.
    expect(() => spend(2)).not.toThrow();
    expect(() => spend(1)).toThrow(RATE_LIMITED_MESSAGE);
  });

  describe('pruning', () => {
    it('reclaims windows whose owner never came back', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

      for (let index = 0; index < 5; index += 1) {
        service.enforce({ primaryIp: `203.0.113.${index}` });
      }
      expect(service.trackedWindows).toBe(5);

      // Past the retention horizon, so the next sweep drops all five -- and
      // past the sweep interval, so a sweep actually runs.
      nowSpy.mockReturnValue(1_000 + 11 * 60 * 1000);
      service.enforce({ primaryIp: '198.51.100.1' });

      expect(service.trackedWindows).toBe(1);
    });

    it('keeps windows that are still within the retention horizon', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

      service.enforce({ primaryIp: '203.0.113.5' });
      // A sweep runs, but the existing window is far too recent to drop.
      nowSpy.mockReturnValue(1_000 + 2 * 60 * 1000);
      service.enforce({ primaryIp: '198.51.100.1' });

      expect(service.trackedWindows).toBe(2);
    });

    it('evicts oldest-first when a key flood outruns the sweep', () => {
      // MAX_TRACKED_KEYS is 50,000; one past it forces the overflow branch.
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);

      for (let index = 0; index <= 50_000; index += 1) {
        service.enforce({ primaryIp: `key-${index}` });
      }
      expect(service.trackedWindows).toBe(50_001);

      // All of these are recent, so the retention sweep drops none of them --
      // only the hard ceiling does.
      nowSpy.mockReturnValue(1_000 + 2 * 60 * 1000);
      service.enforce({ primaryIp: 'key-flood-trigger' });

      expect(service.trackedWindows).toBe(50_000);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit key table exceeded 50000'),
      );
    });

    it('clears every window on demand', () => {
      service.enforce({ primaryIp: '203.0.113.5' });
      expect(service.trackedWindows).toBe(1);

      service.clear();
      expect(service.trackedWindows).toBe(0);
    });

    it('sweeps at most once per interval', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000);
      service.enforce({ primaryIp: '203.0.113.5' });

      // Well past retention, but only seconds after the last sweep.
      nowSpy.mockReturnValue(1_000 + 11 * 60 * 1000);
      service.enforce({ primaryIp: '198.51.100.1' });
      nowSpy.mockReturnValue(1_000 + 11 * 60 * 1000 + 5_000);
      service.enforce({ primaryIp: '198.51.100.2' });

      expect(service.trackedWindows).toBe(2);
    });
  });

  describe('rule resolution', () => {
    it('defaults to 120 requests a minute per client', () => {
      expect(limitRule()).toEqual({ max: 120, windowSeconds: 60 });
    });

    it('derives the backstop from whichever primary rule is in effect', () => {
      process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '10:30';
      expect(backstopRule(limitRule())).toEqual({
        max: 200,
        windowSeconds: 30,
      });
    });

    it('honours an explicit backstop override', () => {
      process.env.PUBLIC_DASHBOARD_BACKSTOP_RATE_LIMIT = '7:15';
      expect(backstopRule(limitRule())).toEqual({ max: 7, windowSeconds: 15 });
    });

    it.each(['', 'abc', '10', '0:60', '10:0', '-1:60'])(
      'keeps the default when the override is %p',
      (value) => {
        process.env.PUBLIC_DASHBOARD_RATE_LIMIT = value;
        expect(limitRule()).toEqual({ max: 120, windowSeconds: 60 });
      },
    );
  });
});
