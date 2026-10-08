# Fixture scheduling review fixes

Branch: `fix/fixture-scheduling-pre-match`.

Fixture generation now saves its timezone with the fixture plan in one guarded
database transaction. Later league-to-knockout generation reuses that timezone
and calculates the next calendar day locally, including kickoffs whose UTC date
differs from their local date. Omitting the timezone during regeneration reuses
the saved value. A failed or unsafe generation cannot change it.

Event creation rejects invalid or elapsed kickoffs in the backend service before
writing an event or friendly request. Existing events can still be edited;
historical-match tests create a valid future event before simulating elapsed time.

Competition start dates use the browser's local calendar date for their initial
value, minimum and validation. The kickoff picker identifies its time as local.
Fixture tests freeze the clock so future-only generation does not invalidate
fixed scheduling expectations as the real date advances.

## Database deployment

Apply `backend/drizzle/0061_competition_schedule_timezone.sql` through the normal
migration process before deploying this backend. It adds
`competitions.schedule_timezone` with a UTC default for existing rows and a
seven-argument fixture generation function. The existing six-argument function
remains available for legacy callers. Existing fixture timestamps are preserved.
The migration was exercised against disposable PGlite databases, not deployed to
an external database during this change.

## Validation

- `npm.cmd --prefix backend test -- --runInBand`: 74 suites, 912 tests passed.
- `npm.cmd --prefix frontend test`: 118 tests passed on the final run.
- `npm.cmd --prefix packages/match-domain test`: 7 tests passed.
- `npm.cmd --prefix backend run build`: passed.
- `npm.cmd --prefix frontend run build`: passed.
- `npm.cmd run lint`: passed with existing frontend Fast Refresh warnings.
- `node --test --test-isolation=none frontend/src/features/events/event-utils.node-test.mjs`
  with `TZ=Africa/Johannesburg` and `TZ=America/Los_Angeles`.
- `git diff --check`

Regression coverage includes timezone persistence, safe regeneration, failed
generation, the structural-settings guard, midnight local league-to-knockout
progression, and rejection of past training and match creation before writes.
An HTTP regression was also added to `backend/test/events.e2e-spec.ts`; HTTP
integration and browser suites were not run during this change.

The frontend suite initially hit its existing timing-sensitive cross-tab refresh
assertion; both an isolated rerun and the complete frontend rerun passed.
The optional whole-test TypeScript check (`tsc --noEmit -p tsconfig.json` in
`backend`) reports existing test typing and frontend alias errors outside this
change; the supported backend and frontend production builds pass.

Assisted-by: Codex
