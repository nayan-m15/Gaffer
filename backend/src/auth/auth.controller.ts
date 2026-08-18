import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { APIError } from 'better-auth/api';
import { fromNodeHeaders } from 'better-auth/node';
import type { Response } from 'express';
import { auth } from './auth';
import { AuthGuard, type AuthenticatedRequest } from './auth.guard';
import { signInSchema, signUpSchema } from './auth.schemas';
import { CurrentUser } from './current-user.decorator';
import { TeamsService } from '../teams/teams.service';
import { zodValidate } from '../common/zod-validate';

/** Copies any `Set-Cookie` header Better Auth returned onto the Nest response. */
function forwardSetCookie(res: Response, headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies);
  }
}

/** Better Auth raises `APIError` for auth failures; map it to a matching HTTP response. */
function toHttpException(error: unknown): HttpException {
  if (error instanceof APIError) {
    return new HttpException(
      error.body?.message ?? error.message,
      error.statusCode,
    );
  }
  return new HttpException('Authentication request failed.', 500);
}

@Controller('auth')
export class AuthController {
  constructor(private readonly teamsService: TeamsService) {}

  @Post('sign-up')
  async signUp(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const dto = zodValidate(signUpSchema, body);

    // Only the Better Auth call is wrapped: an error here really is an auth
    // failure (bad input, duplicate email) and gets Better Auth's own
    // message via toHttpException. Team creation is a separate concern —
    // letting its errors propagate as-is (instead of relabeling them
    // "Authentication request failed.") keeps the real cause visible, e.g.
    // TeamsService's own ConflictException, or Nest's default 500 (logged
    // server-side with the actual stack trace) for anything unexpected.
    let user: { id: string; name: string; email: string };
    try {
      const { headers, response } = await auth.api.signUpEmail({
        body: { name: dto.name, email: dto.email, password: dto.password },
        returnHeaders: true,
      });
      forwardSetCookie(res, headers);
      user = response.user;
    } catch (error) {
      throw toHttpException(error);
    }

    const team = await this.teamsService.createTeamForUser(
      user.id,
      dto.teamName,
    );

    return { user, team };
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
}
