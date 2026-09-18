import { PGlite, type Transaction } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/neon-http';
import type { NeonQueryFunction } from '@neondatabase/serverless';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseService } from '../database/database.service';
import * as schema from '../database/schema';
import { TeamsService } from '../teams/teams.service';
import { sendCompetitionInviteEmail } from '../email/email';
import { CompetitionInvitesService } from './competition-invites.service';

jest.mock('../email/email', () => ({ sendCompetitionInviteEmail: jest.fn() }));

// Run the actual Neon Drizzle queries and batch boundaries against embedded
// PostgreSQL, without a network connection or access to the configured database.
function testDatabase(pg: PGlite) {
  const query = (
    text: string,
    params: unknown[],
    options: { arrayMode?: boolean },
  ) => {
    const run = (db: PGlite | Transaction) =>
      db.query(text, params, {
        rowMode: options.arrayMode ? 'array' : 'object',
        parsers: { 1184: (value: string) => value },
      });
    return {
      run,
      then: (
        yes: (value: unknown) => unknown,
        no: (error: unknown) => unknown,
      ) => run(pg).then(yes, no),
    };
  };
  const client = {
    query,
    transaction: (queries: ReturnType<typeof query>[]) =>
      pg.transaction(async (tx) => {
        const results: unknown[] = [];
        for (const statement of queries) results.push(await statement.run(tx));
        return results;
      }),
  };
  return drizzle(client as unknown as NeonQueryFunction<false, false>, {
    schema,
  });
}

describe('CompetitionInvitesService (PostgreSQL)', () => {
  let pg: PGlite;
  let service: CompetitionInvitesService;
  let teamsService: TeamsService;
  let competitionId: string;
  let slotId: string;
  let ownerTeamId: string;
  const mail = jest.mocked(sendCompetitionInviteEmail);
  const email = 'coach@example.com';

  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec(`
      create table "user" (id text primary key, email text not null);
      create type team_role as enum ('coach', 'assistant');
      create type competition_type as enum ('league', 'cup', 'friendly');
      create table teams (id uuid primary key default gen_random_uuid(), name text not null, primary_color text,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create table team_members (id uuid primary key default gen_random_uuid(), team_id uuid not null references teams(id),
        user_id text not null unique references "user"(id), role team_role not null default 'assistant',
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create table competitions (id uuid primary key default gen_random_uuid(), name text not null,
        type competition_type not null default 'league', admin_user_id text references "user"(id));
      create table competition_teams (id uuid primary key default gen_random_uuid(), competition_id uuid not null references competitions(id),
        team_id uuid references teams(id), display_name text not null,
        created_at timestamptz not null default now(), updated_at timestamptz not null default now());
      create unique index competition_teams_competition_team_unique on competition_teams (competition_id, team_id) where team_id is not null;
    `);
    await pg.exec(
      readFileSync(
        resolve(__dirname, '../../drizzle/0023_competition_invites.sql'),
        'utf8',
      ),
    );
    const databaseService = { database: testDatabase(pg) } as DatabaseService;
    teamsService = new TeamsService(databaseService);
    service = new CompetitionInvitesService(databaseService, teamsService);
  }, 30000);

  afterAll(async () => {
    await pg?.close();
  });

  beforeEach(async () => {
    jest.restoreAllMocks();
    mail.mockReset().mockResolvedValue(undefined);
    await pg.exec(
      'truncate competition_invites, competition_teams, competitions, team_members, teams, "user" cascade',
    );
    await pg.query(
      'insert into "user" (id, email) values ($1, $2), ($3, $4), ($5, $6)',
      [
        'admin',
        'admin@example.com',
        'coach',
        email,
        'outsider',
        'other@example.com',
      ],
    );
    competitionId = randomUUID();
    slotId = randomUUID();
    ownerTeamId = randomUUID();
    await pg.query('insert into teams (id, name) values ($1, $2)', [
      ownerTeamId,
      'Admin team',
    ]);
    await pg.query(
      "insert into team_members (team_id, user_id, role) values ($1, 'admin', 'coach')",
      [ownerTeamId],
    );
    await pg.query(
      "insert into competitions (id, name, admin_user_id) values ($1, 'Sunday Cup', 'admin')",
      [competitionId],
    );
    await pg.query(
      "insert into competition_teams (id, competition_id, display_name) values ($1, $2, 'Invited XI')",
      [slotId, competitionId],
    );
  });

  const invite = () => service.createInvite(slotId, email, 'admin');
  const invites = async () =>
    (
      await pg.query<{
        id: string;
        status: string;
        token_hash: string;
        email: string;
        used_by_user_id: string;
        used_at: Date | null;
      }>('select * from competition_invites order by created_at, id')
    ).rows;
  async function addTeam(role = 'coach') {
    const id = randomUUID();
    await pg.query(
      "insert into teams (id, name) values ($1, 'Original club name')",
      [id],
    );
    await pg.query(
      'insert into team_members (team_id, user_id, role) values ($1, $2, $3)',
      [id, 'coach', role],
    );
    return id;
  }

  it('only permits the competition admin to invite, list, and revoke', async () => {
    await expect(
      service.createInvite(slotId, email, 'outsider'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.listInvites(competitionId, 'outsider'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await invite();
    const [row] = await invites();
    await expect(
      service.revokeInvite(row.id, 'outsider'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect((await invites())[0].status).toBe('pending');
    expect(await service.listInvites(competitionId, 'admin')).toHaveLength(1);
    await service.revokeInvite(row.id, 'admin');
    expect((await invites())[0].status).toBe('revoked');
  });

  it('rejects inviting an already linked slot', async () => {
    await pg.query('update competition_teams set team_id = $1 where id = $2', [
      ownerTeamId,
      slotId,
    ]);
    await expect(invite()).rejects.toBeInstanceOf(ConflictException);
    expect(await invites()).toHaveLength(0);
  });

  it('normalizes email, stores only SHA-256, expires in 72 hours and sends the named invitation', async () => {
    const before = Date.now();
    const result = await service.createInvite(
      slotId,
      ' Coach@Example.COM ',
      'admin',
    );
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      72 * 3600000,
    );
    expect(result.expiresAt.getTime() - before).toBeLessThan(
      72 * 3600000 + 5000,
    );
    expect((await invites())[0]).toMatchObject({
      email,
      token_hash: createHash('sha256').update(result.token).digest('hex'),
    });
    expect(mail).toHaveBeenCalledWith({
      to: email,
      competitionName: 'Sunday Cup',
      teamName: 'Invited XI',
      url: result.inviteUrl,
    });
    expect(result.inviteUrl).toContain(`/join-competition/${result.token}`);
    expect(await service.preview(result.token)).toEqual({
      valid: true,
      competitionName: 'Sunday Cup',
      teamName: 'Invited XI',
    });
    const [summary] = await service.listInvites(competitionId, 'admin');
    expect(summary).not.toHaveProperty('tokenHash');
  });

  it('replacement revokes the previous pending invitation even for another email', async () => {
    const first = await invite();
    const second = await service.createInvite(
      slotId,
      'replacement@example.com',
      'admin',
    );
    expect((await invites()).map((i) => i.status).sort()).toEqual([
      'pending',
      'revoked',
    ]);
    expect(await service.preview(first.token)).toEqual({ valid: false });
    expect(await service.preview(second.token)).toMatchObject({ valid: true });
  });

  it('rejects a wrong signed-in email without creating a team or using the invite', async () => {
    const { token } = await invite();
    await expect(
      service.accept(token, 'outsider', 'other@example.com'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect((await invites())[0].status).toBe('pending');
    expect((await pg.query('select * from teams')).rows).toHaveLength(1);
  });

  it('links an existing coach team without renaming it and marks the invite used', async () => {
    const teamId = await addTeam();
    const { token } = await invite();
    expect(await service.accept(token, 'coach', ' COACH@Example.COM ')).toEqual(
      { joined: true, teamId, competitionId },
    );
    expect(
      (await pg.query('select name from teams where id = $1', [teamId]))
        .rows[0],
    ).toEqual({ name: 'Original club name' });
    expect(
      (
        await pg.query('select team_id from competition_teams where id = $1', [
          slotId,
        ])
      ).rows[0],
    ).toEqual({ team_id: teamId });
    expect((await invites())[0]).toMatchObject({
      status: 'used',
      used_by_user_id: 'coach',
    });
    expect((await invites())[0].used_at).toBeInstanceOf(Date);
    await expect(service.accept(token, 'coach', email)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates a team named after the slot and a coach membership for a teamless user', async () => {
    const { token } = await invite();
    const { teamId } = await service.accept(token, 'coach', email);
    expect(
      (await pg.query('select name from teams where id = $1', [teamId]))
        .rows[0],
    ).toEqual({ name: 'Invited XI' });
    expect(
      (
        await pg.query(
          "select team_id, role from team_members where user_id = 'coach'",
        )
      ).rows[0],
    ).toEqual({ team_id: teamId, role: 'coach' });
    expect((await invites())[0].status).toBe('used');
  });

  it('rejects an assistant without changing their membership or consuming the invite', async () => {
    await addTeam('assistant');
    const { token } = await invite();
    await expect(service.accept(token, 'coach', email)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect((await invites())[0].status).toBe('pending');
  });

  it('rejects duplicate real-team participation without consuming the invite', async () => {
    const teamId = await addTeam();
    await pg.query(
      "insert into competition_teams (competition_id, team_id, display_name) values ($1, $2, 'Already here')",
      [competitionId, teamId],
    );
    const { token } = await invite();
    await expect(service.accept(token, 'coach', email)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect((await invites())[0].status).toBe('pending');
    expect(
      (
        await pg.query('select team_id from competition_teams where id = $1', [
          slotId,
        ])
      ).rows[0],
    ).toEqual({ team_id: null });
  });

  it.each(['expired', 'revoked', 'used'])(
    'rejects %s invites in preview and acceptance',
    async (state) => {
      const { token } = await invite();
      if (state === 'expired')
        await pg.exec(
          "update competition_invites set expires_at = now() - interval '1 second'",
        );
      else
        await pg.query('update competition_invites set status = $1', [state]);
      expect(await service.preview(token)).toEqual({ valid: false });
      await expect(
        service.accept(token, 'coach', email),
      ).rejects.toBeInstanceOf(NotFoundException);
    },
  );

  it('rejects malformed and unknown tokens uniformly', async () => {
    for (const token of ['bad', 'a'.repeat(43)]) {
      expect(await service.preview(token)).toEqual({ valid: false });
      await expect(
        service.accept(token, 'coach', email),
      ).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('revokes a failed email delivery', async () => {
    mail.mockRejectedValueOnce(new Error('Mail unavailable'));
    await expect(invite()).rejects.toThrow('Mail unavailable');
    expect((await invites())[0].status).toBe('revoked');
  });

  it('concurrent replacements leave only one pending invitation', async () => {
    await Promise.all([invite(), invite()]);
    expect((await invites()).map((i) => i.status).sort()).toEqual([
      'pending',
      'revoked',
    ]);
  });

  it('concurrent accepts have only one winner and create only one team', async () => {
    const { token } = await invite();
    const results = await Promise.allSettled([
      service.accept(token, 'coach', email),
      service.accept(token, 'coach', email),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await pg.query('select * from teams')).rows).toHaveLength(2);
    expect((await invites())[0].status).toBe('used');
  });

  it.each(['revoke', 'replace'])(
    'rechecks an invitation changed by %s after the initial read',
    async (action) => {
      const { token } = await invite();
      const [row] = await invites();
      jest
        .spyOn(teamsService, 'findTeamForUser')
        .mockImplementationOnce(async () => {
          if (action === 'revoke') await service.revokeInvite(row.id, 'admin');
          else await invite();
          return null;
        });
      await expect(
        service.accept(token, 'coach', email),
      ).rejects.toBeInstanceOf(ConflictException);
      expect((await pg.query('select * from teams')).rows).toHaveLength(1);
      expect((await invites()).find((i) => i.id === row.id)?.status).toBe(
        'revoked',
      );
    },
  );

  it('rejects acceptance when the participant was linked after invitation creation', async () => {
    const { token } = await invite();
    await pg.query('update competition_teams set team_id = $1 where id = $2', [
      ownerTeamId,
      slotId,
    ]);
    await expect(service.accept(token, 'coach', email)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await service.preview(token)).toEqual({ valid: false });
    expect((await invites())[0].status).toBe('pending');
  });

  it('concurrent claims of different slots cannot duplicate a team in a competition', async () => {
    const otherSlot = randomUUID();
    await pg.query(
      "insert into competition_teams (id, competition_id, display_name) values ($1, $2, 'Second slot')",
      [otherSlot, competitionId],
    );
    const first = await invite();
    const second = await service.createInvite(otherSlot, email, 'admin');
    const results = await Promise.allSettled([
      service.accept(first.token, 'coach', email),
      service.accept(second.token, 'coach', email),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await pg.query('select * from teams')).rows).toHaveLength(2);
    expect((await invites()).map((i) => i.status).sort()).toEqual([
      'pending',
      'used',
    ]);
  });

  it('rolls back team creation and linking if marking the invite used fails', async () => {
    const { token } = await invite();
    await pg.exec(
      "alter table competition_invites add constraint test_reject_use check (status <> 'used')",
    );
    try {
      await expect(service.accept(token, 'coach', email)).rejects.toThrow();
      expect((await pg.query('select * from teams')).rows).toHaveLength(1);
      expect(
        (
          await pg.query(
            'select team_id from competition_teams where id = $1',
            [slotId],
          )
        ).rows[0],
      ).toEqual({ team_id: null });
      expect((await invites())[0].status).toBe('pending');
    } finally {
      await pg.exec(
        'alter table competition_invites drop constraint test_reject_use',
      );
    }
  });
});
