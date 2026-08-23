import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { auth } from './auth';
import { isDatabaseConnectionError } from '../database/drizzle';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: SessionUser;
  sessionId: string;
}

/**
 * Validates the Better Auth session cookie on the incoming request and
 * attaches the resolved user to `request.user`. Rejects with 401 when no
 * valid session is present or 503 when the database is unreachable.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    try {
      const result = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!result) {
        throw new UnauthorizedException('Sign in required.');
      }

      request.user = result.user;
      request.sessionId = result.session.id;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      if (isDatabaseConnectionError(error)) {
        throw new ServiceUnavailableException(
          'Authentication service is temporarily unavailable due to a database connection timeout. Please try again.',
        );
      }
      throw error;
    }
  }
}
