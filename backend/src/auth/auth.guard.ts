import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user: SessionUser;
  sessionId: string;
}

/**
 * Validates the Better Auth session cookie on the incoming request and
 * attaches the resolved user to `request.user`. Rejects with 401 when no
 * valid session is present.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const result = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!result) {
      throw new UnauthorizedException('Sign in required.');
    }

    request.user = result.user;
    request.sessionId = result.session.id;

    return true;
  }
}
