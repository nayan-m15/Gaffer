import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import type { Request, Response } from 'express';
import { auth } from './auth';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import {
  AuthRateLimitService,
  resolveRateLimitIdentity,
} from './auth-rate-limit.service';
import { AuthService } from './auth.service';
import {
  changeEmailSchema,
  changePasswordSchema,
  setPasswordSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  resendVerificationEmailSchema,
  signInSchema,
  signUpSchema,
} from './auth.schemas';
import { CurrentUser } from './current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { AthletesService } from '../athletes/athletes.service';
import { zodValidate } from '../common/zod-validate';
import { isDatabaseConnectionError } from '../database/drizzle';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
/** Where Better Auth redirects the browser after a verification link is clicked. */
const VERIFIED_REDIRECT_URL = `${FRONTEND_URL}/login?verified=1`;

/**
 * Where the verification email should send the user afterwards: back to the
 * pending team invite when the sign-up/resend originated from
 * /join-team/:token, otherwise the standard verified-login page. Better Auth
 * embeds this URL in the verification link and 302s to it (session cookie
 * included) once the address is confirmed — which is what lets the invite
 * survive the verification round trip, even across browsers, without any
 * persisted state.
 */
function verifiedRedirectUrl(
  inviteToken?: string,
  inviteKind: 'team' | 'competition' = 'team',
): string {
  return inviteToken
    ? `${FRONTEND_URL}/join-${inviteKind}/${inviteToken}`
    : VERIFIED_REDIRECT_URL;
}

/** Copies any `Set-Cookie` header Better Auth returned onto the Nest response. */
function forwardSetCookie(res: Response, headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }
}

/**
 * Rebuilds the incoming Express request as the web-standard `Request` Better
 * Auth's request-aware middlewares expect. Only the method, URL and headers
 * matter here — the body travels separately in the `auth.api` call — but the
 * URL mirrors what Better Auth's own Node adapter derives for `toNodeHandler`
 * (`x-forwarded-proto`, then the host header, then the original path) so the
 * request looks the same as one that arrived through the native handler.
 */
function toWebRequest(req: Request, headers: Headers) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const protocol =
    (Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto) ??
    req.protocol;
  const host = req.headers.host ?? 'localhost';
  return new Request(`${protocol}://${host}${req.originalUrl}`, {
    method: req.method,
    headers,
  });
}

/**
 * Expires Better Auth's `dont_remember` cookie.
 *
 * Better Auth only ever *writes* this flag when a sign-in declines persistence
 * — a later "Remember me" sign-in does not clear the one an earlier
 * unremembered session left behind. While a stale flag lingers (until the
 * browser closes) it silently downgrades any session Better Auth creates
 * without an explicit choice (the Google callback, the post-verification auto
 * sign-in) to a browser-session cookie, and it disables rolling session
 * refresh (`dontRememberMe` short-circuits the refresh branch of
 * `getSession`). Expiring it during an explicitly-remembered sign-in makes the
 * user's choice win unconditionally.
 *
 * Name and attributes mirror Better Auth's own `createCookieGetter`
 * (`better-auth/dist/cookies`): the default `better-auth` cookie prefix, plus
 * `__Secure-` when the auth baseURL is https.
 */
function expireDontRememberCookie(res: Response): void {
  // Keep in sync with auth.ts advanced.defaultCookieAttributes.secure.
  const secure = process.env.NODE_ENV === 'production';
  const name = `${secure ? '__Secure-' : ''}better-auth.dont_remember`;
  const expired = `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;

  const existing = res.getHeader('Set-Cookie');
  const cookies =
    existing === undefined
      ? []
      : Array.isArray(existing)
        ? existing.map(String)
        : [String(existing)];
  res.setHeader('Set-Cookie', [...cookies, expired]);
}

const logger = new Logger('AuthController');

/** Maps Better Auth and database errors to appropriate client-facing HTTP exceptions. */
function toHttpException(error: unknown): HttpException {
  if (isDatabaseConnectionError(error)) {
    logger.error(
      'Database connection timeout or network error in AuthController',
      error,
    );
    return new HttpException(
      'Database connection timed out or is unreachable. Please check your network connection and try again.',
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }

  if (error instanceof APIError) {
    return new HttpException(
      error.body?.message ?? error.message,
      error.statusCode,
    );
  }

  logger.error('Unrecognized error from Better Auth', error);
  return new HttpException(
    'Authentication request failed.',
    HttpStatus.INTERNAL_SERVER_ERROR,
  );
}

function isNonDisclosingVerificationError(error: unknown): boolean {
  if (error instanceof APIError) {
    const status = error.statusCode;
    const msg = (error.body?.message ?? error.message ?? '').toLowerCase();
    if (status === 404) return true;
    if (
      status === 400 &&
      (msg.includes('not found') ||
        msg.includes('already verified') ||
        msg.includes('user_not_found') ||
        msg.includes('email_already_verified'))
    ) {
      return true;
    }
  }
  return false;
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly authService: AuthService,
    private readonly athletesService: AthletesService,
    private readonly rateLimiter: AuthRateLimitService,
  ) {}

  @Post('sign-up')
  async signUp(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Sign-up spends a verification email (and a user row), not a credential
    // attempt, so it draws from the email policy alongside the resend route.
    // The identity carries both tiers: the per-user IP Vercel reports and the
    // edge-observed IP the backstop is keyed on.
    await this.rateLimiter.enforce(
      'email',
      resolveRateLimitIdentity(req.headers, req.socket.remoteAddress),
    );

    const dto = zodValidate(signUpSchema, body);

    // Only the Better Auth call is wrapped: an error here really is an auth
    // failure (bad input, duplicate email) and gets Better Auth's own
    // message via toHttpException.
    try {
      const { headers, response } = await auth.api.signUpEmail({
        body: {
          name: dto.name,
          email: dto.email,
          password: dto.password,
          callbackURL: verifiedRedirectUrl(dto.inviteToken, dto.inviteKind),
        },
        returnHeaders: true,
      });
      forwardSetCookie(res, headers);
      // `requireEmailVerification` makes Better Auth withhold the session
      // (no Set-Cookie, response.user.emailVerified stays false) until the
      // address is confirmed. The frontend uses this flag to show a "check
      // your email" screen instead of assuming sign-up authenticated them.
      return {
        user: response.user,
        emailVerificationRequired: !response.user.emailVerified,
      };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post('send-verification-email')
  async sendVerificationEmail(@Body() body: unknown, @Req() req: Request) {
    await this.rateLimiter.enforce(
      'email',
      resolveRateLimitIdentity(req.headers, req.socket.remoteAddress),
    );

    const dto = zodValidate(resendVerificationEmailSchema, body);

    try {
      await auth.api.sendVerificationEmail({
        body: {
          email: dto.email,
          callbackURL: verifiedRedirectUrl(dto.inviteToken, dto.inviteKind),
        },
      });
    } catch (error) {
      // Suppress only non-disclosing errors (unknown email, already verified)
      // to avoid account enumeration, while surfacing actionable failures
      // like rate limiting or server errors.
      if (isNonDisclosingVerificationError(error)) {
        return { status: true };
      }
      throw toHttpException(error);
    }

    return { status: true };
  }

  // Better Auth's verification link (`GET /auth/verify-email?token=...`)
  // points here. It marks the address verified, then 302s the browser to the
  // callbackURL we set on sign-up/resend.
  @Get('verify-email')
  async verifyEmail(@Req() req: Request, @Res() res: Response) {
    await toNodeHandler(auth)(req, res);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() body: unknown) {
    const dto = zodValidate(requestPasswordResetSchema, body);

    try {
      await auth.api.requestPasswordReset({
        body: {
          email: dto.email,
          redirectTo: `${FRONTEND_URL}/reset-password`,
        },
      });
    } catch (error) {
      // Better Auth deliberately avoids disclosing whether an email exists.
      // Preserve that behaviour for ordinary account-not-found responses, but
      // still surface service/database failures that stop the flow entirely.
      if (isNonDisclosingVerificationError(error)) {
        return { status: true };
      }
      throw toHttpException(error);
    }

    return { status: true };
  }

  // Better Auth's emailed reset link lands on a tokenized GET route first.
  // Proxy that request so Better Auth can validate the token and redirect the
  // browser to FRONTEND_URL/reset-password?token=... (or ?error=INVALID_TOKEN).
  @Get('reset-password/:token')
  async openResetPasswordLink(@Req() req: Request, @Res() res: Response) {
    await toNodeHandler(auth)(req, res);
  }

  @Post('reset-password')
  async resetPassword(@Body() body: unknown) {
    const dto = zodValidate(resetPasswordSchema, body);

    try {
      await auth.api.resetPassword({
        body: {
          token: dto.token,
          newPassword: dto.newPassword,
        },
      });
      return { status: true };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @Post('sign-in')
  async signIn(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.rateLimiter.enforce(
      'password',
      resolveRateLimitIdentity(req.headers, req.socket.remoteAddress),
    );

    const dto = zodValidate(signInSchema, body);

    try {
      // The originating request rides along so Better Auth's
      // `formCsrfMiddleware` — the request-aware login CSRF protection it
      // applies on its own /auth/sign-in/email endpoint — sees the real
      // Origin/Fetch Metadata headers and rejects cross-site logins before
      // a session is created. The internal API call alone carries no request
      // context, which is exactly how this custom wrapper bypassed that
      // protection (SEC-003). `asResponse: false` keeps the current
      // `{ headers, response }` return shape, which a passed `request`
      // would otherwise flip to a raw `Response`.
      const requestHeaders = fromNodeHeaders(req.headers);
      const { headers, response } = await auth.api.signInEmail({
        body: {
          email: dto.email,
          password: dto.password,
          rememberMe: dto.rememberMe,
        },
        headers: requestHeaders,
        request: toWebRequest(req, requestHeaders),
        asResponse: false,
        returnHeaders: true,
      });
      forwardSetCookie(res, headers);
      if (dto.rememberMe) {
        // A remembered sign-in must not leave a stale "don't remember" flag
        // behind: it would block session refresh and downgrade the sessions
        // of flows that create one without an explicit choice (Google
        // callback, post-verification auto sign-in).
        expireDontRememberCookie(res);
      }

      return { user: response.user };
    } catch (error) {
      // Better Auth deliberately returns the uniform "Invalid email or
      // password" 401 whether the address is unknown, Google-only, or the
      // password is wrong — preventing account enumeration.
      throw toHttpException(error);
    }
  }

  @UseGuards(AuthGuard)
  @Post('change-email')
  async changeEmail(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const dto = zodValidate(changeEmailSchema, body);

    if (dto.newEmail.toLowerCase() === user.email.toLowerCase()) {
      throw new HttpException(
        'New email address must be different from your current email address.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      await auth.api.changeEmail({
        body: {
          newEmail: dto.newEmail,
          callbackURL: `${FRONTEND_URL}/email-change/approved?email=${encodeURIComponent(dto.newEmail)}`,
        },
        headers: fromNodeHeaders(req.headers),
      });

      return { status: true };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @UseGuards(AuthGuard)
  @Get('password-status')
  async passwordStatus(@Req() req: AuthenticatedRequest) {
    try {
      const accounts = await auth.api.listUserAccounts({
        headers: fromNodeHeaders(req.headers),
      });

      return {
        hasPassword: accounts.some(
          (account) => account.providerId === 'credential',
        ),
      };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @UseGuards(AuthGuard)
  @Post('set-password')
  async setPassword(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const dto = zodValidate(setPasswordSchema, body);
    const headers = fromNodeHeaders(req.headers);

    try {
      // OAuth-only users have no credential account. Only permit this endpoint
      // for that state so an existing password can never be replaced without
      // verifying the current password through /change-password.
      const accounts = await auth.api.listUserAccounts({ headers });
      if (accounts.some((account) => account.providerId === 'credential')) {
        throw new HttpException(
          'A password is already set for this account. Use Change Password instead.',
          HttpStatus.CONFLICT,
        );
      }

      await auth.api.setPassword({
        body: { newPassword: dto.newPassword },
        headers,
      });

      return { status: true };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw toHttpException(error);
    }
  }

  @UseGuards(AuthGuard)
  @Post('change-password')
  async changePassword(
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const dto = zodValidate(changePasswordSchema, body);

    try {
      await auth.api.changePassword({
        body: {
          currentPassword: dto.currentPassword,
          newPassword: dto.newPassword,
          // A password change is a security-sensitive action. Keep this
          // browser signed in, but invalidate sessions on other devices.
          revokeOtherSessions: true,
        },
        headers: fromNodeHeaders(req.headers),
      });

      return { status: true };
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @UseGuards(AuthGuard)
  @Post('sign-out')
  async signOut(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const { headers, response } = await auth.api.signOut({
        headers: fromNodeHeaders(req.headers),
        returnHeaders: true,
      });
      forwardSetCookie(res, headers);

      return response;
    } catch (error) {
      throw toHttpException(error);
    }
  }

  @UseGuards(AuthGuard)
  @Get('session')
  async session(@CurrentUser() user: AuthenticatedRequest['user']) {
    // `claimedAthletes` is additive: consumers that only read `user` and
    // `team` keep working unchanged and can ignore the new field.
    const [team, claimedAthletes] = await Promise.all([
      this.teamsService.findTeamForUser(user.id),
      this.athletesService.findClaimedByUser(user.id),
    ]);
    return { user, team, claimedAthletes };
  }

  // Kicks off the OAuth flow. The frontend calls this via the Better Auth
  // client, which POSTs here and gets back a Google authorization URL.
  @Post('sign-in/social')
  async signInSocial(@Req() req: Request, @Res() res: Response) {
    await toNodeHandler(auth)(req, res);
  }

  // Google redirects the browser here after consent. Better Auth exchanges
  // the code, creates the session, sets the cookie, and redirects the user
  // back into the app.
  @Get('callback/google')
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    await toNodeHandler(auth)(req, res);
  }
}
