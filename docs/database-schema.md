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

## Injury and recovery

Added in migration `0021`. These tables are the clinical counterpart to the
`injury` value of the `match_events.event_type` enum: the match event records
that something happened at a given minute, while an injury record says what it
was, how long the athlete is expected to be out, and how the recovery actually
went. Records also exist for training and non-match injuries, which have no
match event at all.

| Table | Purpose |
| --- | --- |
| `injuries` | One injury to one athlete: body region, type, severity, status, the estimated return window, and the actual return date once closed. |
| `injury_timeline_entries` | The dated narrative of one injury — sustained, assessment, rehab, re-assessment, setback, return. Two are seeded when a record is created. |

Notable columns and constraints:

- `body_region` stores sides explicitly (`hamstring_left`, `hamstring_right`)
  rather than a region plus a nullable side column, because every query the UI
  makes is "which region is hurt".
- `estimated_return_min_days` / `_max_days` and the two projected dates are
  persisted rather than recomputed. They are seeded from the guidance table in
  `backend/src/injuries/injury-protocols.ts` and may be overridden by a coach,
  so revising that table must never rewrite the expectation an athlete is
  already recovering against.
- `rehab_phases` is a JSONB snapshot of the phase plan, frozen at creation for
  the same reason. It is populated from day one but not yet surfaced in the UI.
- `match_id` and `match_event_id` are set only for live-logged injuries and use
  `on delete set null`: undoing a mis-tapped match event must not delete the
  clinical record.
- A partial unique index on `match_event_id` means a double-tap of the live
  logger's Injury button conflicts instead of producing two records.

Creating or closing a record also syncs `athletes.status` between `available`
and `injured`, which is what removes an injured player from squad suggestions
and warns on injured starters in a game plan. A `suspended` athlete is left
alone — a suspension outlives an overlapping injury.

## Applying the schema

1. Copy `.env.example` to `.env` at the repository root.
2. Set `DATABASE_URL` to the PostgreSQL/Neon connection string.
3. From `backend`, run `npm run db:generate` and review the migration.
4. Run `npm run db:migrate`.
5. Start the backend and request `GET /health/database`; it returns
   `{ "status": "ok" }` only when the database is reachable.

Never commit `.env` or a real database connection string.
