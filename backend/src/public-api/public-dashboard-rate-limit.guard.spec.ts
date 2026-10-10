import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { PublicDashboardRateLimitGuard } from './public-dashboard-rate-limit.guard';
import {
  PublicDashboardRateLimitService,
  RATE_LIMITED_MESSAGE,
} from './public-dashboard-rate-limit.service';

const contextFor = (request: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as ExecutionContext;

describe('PublicDashboardRateLimitGuard', () => {
  let rateLimit: { enforce: jest.Mock };
  let guard: PublicDashboardRateLimitGuard;

  beforeEach(() => {
    rateLimit = { enforce: jest.fn() };
    guard = new PublicDashboardRateLimitGuard(
      rateLimit as unknown as PublicDashboardRateLimitService,
    );
  });

  it('charges the request to the identity derived from its proxy headers', () => {
    const allowed = guard.canActivate(
      contextFor({
        headers: {
          'x-vercel-forwarded-for': '198.51.100.9',
          'cf-connecting-ip': '203.0.113.5',
        },
        socket: { remoteAddress: '10.0.0.1' },
      }),
    );

    expect(allowed).toBe(true);
    expect(rateLimit.enforce).toHaveBeenCalledWith({
      primaryIp: '198.51.100.9',
      edgeIp: '203.0.113.5',
    });
  });

  it('falls back to the socket address when no proxy headers are present', () => {
    guard.canActivate(
      contextFor({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }),
    );

    expect(rateLimit.enforce).toHaveBeenCalledWith({ primaryIp: '10.0.0.1' });
  });

  it('still limits a request with neither headers nor a socket address', () => {
    guard.canActivate(contextFor({ headers: {} }));

    expect(rateLimit.enforce).toHaveBeenCalledWith({ primaryIp: 'unknown' });
  });

  it('propagates the limiter rejection so the handler never runs', () => {
    rateLimit.enforce.mockImplementation(() => {
      throw new HttpException(
        RATE_LIMITED_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    });

    expect(() =>
      guard.canActivate(
        contextFor({ headers: {}, socket: { remoteAddress: '10.0.0.1' } }),
      ),
    ).toThrow(RATE_LIMITED_MESSAGE);
  });
});
