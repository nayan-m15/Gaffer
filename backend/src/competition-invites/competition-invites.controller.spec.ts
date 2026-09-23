import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { SessionUser } from '../auth/auth.guard';
import { AuthGuard } from '../auth/auth.guard';
import { CompetitionInvitesController } from './competition-invites.controller';
import { CompetitionInvitesService } from './competition-invites.service';

jest.mock('../auth/auth.guard', () => ({ AuthGuard: class MockAuthGuard {} }));

describe('CompetitionInvitesController', () => {
  const user: SessionUser = {
    id: 'user',
    email: 'coach@example.com',
    name: 'Coach',
    emailVerified: true,
  };
  const service = {
    createInvite: jest.fn(),
    listInvites: jest.fn(),
    revokeInvite: jest.fn(),
    preview: jest.fn(),
    accept: jest.fn(),
  };
  const controller = new CompetitionInvitesController(
    service as unknown as CompetitionInvitesService,
  );
  const id = 'f89e639a-a799-491c-bf74-a5f062f47681';
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('protects all mutations and listing with the existing AuthGuard; preview stays public', () => {
    for (const method of ['create', 'list', 'revoke', 'accept'] as const) {
      // Inspect decorator metadata on the original method without invoking it.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(Reflect.getMetadata(GUARDS_METADATA, controller[method])).toEqual([
        AuthGuard,
      ]);
    }
    expect(
      // eslint-disable-next-line @typescript-eslint/unbound-method
      Reflect.getMetadata(GUARDS_METADATA, controller.preview),
    ).toBeUndefined();
  });

  it('validates and normalizes invitation input and uses the signed-in creator', async () => {
    await controller.create(user, {
      competitionTeamId: id,
      email: ' COACH@Example.COM ',
      createdByUserId: 'attacker',
    });
    expect(service.createInvite).toHaveBeenCalledWith(id, user.email, user.id);
    expect(() =>
      controller.create(user, { competitionTeamId: 'bad', email: user.email }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.create(user, { competitionTeamId: id, email: 'bad' }),
    ).toThrow(BadRequestException);
  });

  it('takes acceptance identity and email only from the session', async () => {
    await controller.accept('token', user);
    expect(service.accept).toHaveBeenCalledWith('token', user.id, user.email);
  });

  it('passes the session identity to list and revoke', async () => {
    await controller.list(user, id);
    expect(service.listInvites).toHaveBeenCalledWith(id, user.id);
    expect(await controller.revoke(user, id)).toEqual({ revoked: true });
    expect(service.revokeInvite).toHaveBeenCalledWith(id, user.id);
  });
});
