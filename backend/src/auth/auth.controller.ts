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
import { AuthService } from './auth.service';
import {
  resendVerificationEmailSchema,
  signInSchema,
  signUpSchema,
} from './auth.schemas';
import { CurrentUser } from './current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { zodValidate } from '../common/zod-validate';
import { isDatabaseConnectionError } from '../database/drizzle';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';
/** Where Better Auth redirects the browser after a verification link is clicked. */
const VERIFIED_REDIRECT_URL = `${FRONTEND_URL}/login?verified=1`;

/** Copies any `Set-Cookie` header Better Auth returned onto the Nest response. */
function forwardSetCookie(res: Response, headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }
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

@Controller('auth')
export class AuthController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly authService: AuthService,
  ) {}

  @Post('sign-up')
  async signUp(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
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
          callbackURL: VERIFIED_REDIRECT_URL,
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
  async sendVerificationEmail(@Body() body: unknown) {
    const dto = zodValidate(resendVerificationEmailSchema, body);

    try {
      await auth.api.sendVerificationEmail({
        body: { email: dto.email, callbackURL: VERIFIED_REDIRECT_URL },
      });
    } catch (error) {
      // Better Auth's own errors here (rate limiting, etc.) still map through
      // normally, but an already-verified or unknown email should not be
      // distinguishable from a successful send — that would let a caller
      // probe which addresses have accounts.
      if (!(error instanceof APIError)) {
        throw toHttpException(error);
      }
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

  @Post('sign-in')
  async signIn(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = zodValidate(signInSchema, body);

    try {
      const { headers, response } = await auth.api.signInEmail({
        body: { email: dto.email, password: dto.password },
        returnHeaders: true,
      });
      forwardSetCookie(res, headers);

      return { user: response.user };
    } catch (error) {
      // Better Auth deliberately returns the same "Invalid email or
      // password" 401 whether the address is unknown, the account has no
      // password (e.g. Google-only), or the password is wrong — a standard
      // defence against account enumeration. The product backlog asks for
      // the unknown-address case to be explicit, so on a credentials
      // rejection we re-check the address: no user row at all means the
      // account genuinely doesn't exist, while an existing row (wrong
      // password, unverified, Google-only) keeps Better Auth's own message.
      if (
        error instanceof APIError &&
        error.statusCode === 401 &&
        !(await this.authService.userEmailExists(dto.email))
      ) {
        throw new HttpException(
          'No account found with this email address.',
          HttpStatus.UNAUTHORIZED,
        );
      }

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
    const team = await this.teamsService.findTeamForUser(user.id);
    return { user, team };
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
