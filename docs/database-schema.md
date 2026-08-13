# Initial database schema

The initial PostgreSQL schema uses Drizzle ORM and is defined in
`backend/src/database/schema/index.ts`. It supports the Sprint 1 coach,
roster, and event-management flows while leaving live logging and statistics
for later migrations.

```text
user ──< session
  │
  ├──< account
  └──< team_members >── teams ──< athletes
                                  └──< events

verification (stand-alone Better Auth token records)
```

## Tables

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth's default PostgreSQL records. Authentication routes will be connected in the authentication slice. |
| `teams` | A football team managed in the application. |
| `team_members` | Associates users to teams with a `coach` or `assistant` role. |
| `athletes` | Players on a team, including optional position, squad number, and archive timestamp. |
| `events` | Matches, training sessions, and team meetings, including their scheduled time, location, and status. |

## Applying the schema

1. Copy `.env.example` to `.env` at the repository root.
2. Set `DATABASE_URL` to the PostgreSQL/Neon connection string.
3. From `backend`, run `npm run db:generate` and review the migration.
4. Run `npm run db:migrate`.
5. Start the backend and request `GET /health/database`; it returns
   `{ "status": "ok" }` only when the database is reachable.

Never commit `.env` or a real database connection string.
