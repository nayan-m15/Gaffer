import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { resolveClientIdentity } from '../common/client-ip';
import { PublicDashboardRateLimitService } from './public-dashboard-rate-limit.service';

/**
 * Charges every public dashboard request to its caller's budget before the
 * handler runs (SEC-008), so a rejected request never reaches the database.
 *
 * Kept as a guard rather than an interceptor so the limit is applied ahead of
 * query validation as well: rejecting a flood should not depend on the shape
 * of what was sent.
 */
@Injectable()
export class PublicDashboardRateLimitGuard implements CanActivate {
  constructor(private readonly rateLimit: PublicDashboardRateLimitService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    this.rateLimit.enforce(
      resolveClientIdentity(request.headers, request.socket?.remoteAddress),
    );
    return true;
  }
}
