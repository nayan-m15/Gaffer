# Live logger regression assessment, 6 October 2026

Compared `cc005c43` with `3a2cc540` and the subsequent shared-clock change in
`dd6aa56d`. The first comparison changes result-revision handling and PowerSync
rules; it does not change the fixture side assignment in match setup.

## Findings

Read-only inspection of the configured development database found two fixture
pairs created today with one session-linked sheet and one unlinked sheet. The
unlinked sheets had independent clocks and no retained confirmed lineup. A
third friendly pair had neither sheet linked. The stored sides on the two mixed
pairs were complementary, so the database evidence does not show both sheets
being away. Setup nevertheless allowed both coaches to choose either side:
its local Home/Away state did not display the backend's fixture assignment.

These records are consistent with requests reaching different backend versions
or feature-flag settings. They do not establish which URLs the coaches used or
the currently running hosted configuration. The configured database has migration
0054 recorded and its clock function contains the shared-sheet update, so a
missing shared-clock migration is not the current development-database issue.

The legacy start path removed the confirmed lineup. Without that snapshot the
shared public lineup has no formation slots, which prevents opponent pitch
placement. The later ten-second sheet polling also delayed new opponent lineups.
An older shared-report response could overwrite the clock returned by a newer,
acknowledged local clock write.

The current rules from `3a2cc540` also exceed PowerSync's default bucket budget
for abcd: the read-only compiled lookup check produced 1,175 buckets and 898
parameter rows. Chelsea produced 316 buckets and 366 parameter rows. The
canonical-event and peer-sheet lookups multiply each other as history grows;
yesterday's passing count does not establish today's budget. See PowerSync's
[bucket reduction guidance](https://docs.powersync.com/sync/advanced/reducing-bucket-count).

## Changes

- Return the fixture's assigned side with event details and lock Home/Away in
  setup for linked friendly and generated competition fixtures.
- Reject starts and event/clock writes through the disabled shared-logging path
  when the fixture already has a shared session. Legacy fixtures without a
  session retain their existing logging contract.
- Retain confirmed lineups for linked fixtures across kickoff and retries.
- Refresh the public opponent lineup independently every two seconds in shared
  match views; keep the shared score/clock polling at one second.
- Skip the redundant legacy lineup lookup when a confirmed snapshot exists and
  combine shared-report session authorization with its session read.
- Preserve a newer acknowledged sheet clock while an older shared poll catches
  up, and cancel a private sheet read before installing the acknowledged clock
  response. Keep the duplicate result panel removed from the logger.
- Add migration `0055_shared_review_visibility`: derive review/decision public
  visibility from its canonical event on insert, canonical/session changes,
  and canonical privacy edits. Canonical row locks prevent a concurrent injury
  edit racing a dependent insert. Backfill preserves existing confirmations.
- Filter shared review/decision rows with that derived gate while retaining
  opposite-sheet, participant, live-membership and feature-flag checks. Named
  streams and their default grouped copies use the same rules.

Read-only simulation of `0055` reduces abcd to 363 buckets/616 parameter rows
and Chelsea to 145/283. All 96 SQL equivalence checks pass across 12 participant
coaches, enabled/disabled claims and outsider claims. These are compiled local
rules and database SQL checks, not a new Cloud deployment or measured end-to-end
sync latency. Other history-dependent private streams can still grow; monitor
both bucket and parameter budgets as data grows.

Regression coverage includes all four client side-choice combinations for both
fixture types, disabled-server starts, lineup retention, identical scores,
alternating halftime/second-half/pause/resume transitions, and clock persistence.

## Deployment and existing fixtures

Deploy the reviewed frontend and backend together. Both coaches must reach the
same current backend with `TWO_SIDED_LIVE_LOGGING_ENABLED=true`, then refresh their
app sessions/sync credentials. Local and hosted clients sharing a database are
not equivalent if their APIs use different versions or flags. See
[the rollout guide](two-sided-live-logging-rollout.md).

Apply `0055` to the verified target through the normal reviewed migration
process before deploying the backend or updated PowerSync rules. Its columns
are required by both. `0054` remains a prerequisite for one shared clock anchor.
The new migration passed against PGlite and the separate dedicated test database.
Following the user's migration retry, it is also installed on the configured
development database; see the migration-runner follow-up below. The release
diagnostic now checks the new columns and enabled privacy triggers/function
bodies. Do not replay old migrations to clear historical journal drift.

Retest with a fresh accepted friendly and a generated competition fixture.
Today's unlinked sheets already contain history; the integrity guard deliberately
does not reinterpret that evidence. Review them with the
[historical repair procedure](two-sided-test-data-repair.md) before relinking.
The initial assessment changed no development records, deployed PowerSync rules,
or hosted settings. The local rule file changed. The dedicated test database
was reset using the guarded test-only migration command, then `0055` was applied
to it without another reset; no reset ran concurrently with browser tests.

Read-only diagnostic: `node backend/scripts/diagnose-live-fixtures.mjs`.

## Verification

- `npm.cmd --prefix backend test -- --runInBand --silent`: 70 suites/853 tests pass.
- From `frontend`, `node --test --test-isolation=none "src/**/*.node-test.mjs"`:
  86 tests pass.
- Both application builds pass; frontend retains the existing chunk-size warning.
- Frontend lint passes with five existing warnings. ESLint passes for the changed
  backend TypeScript files. Full backend lint remains nonzero for two unchanged
  files: Prettier formatting of the union type in
  `src/game-plans/player-instructions.ts:21` and an unused `request` import in
  `test/game-plans.e2e-spec.ts:3`.
- `node backend/scripts/verify-two-sided-bucket-budget.mjs --simulate-review-visibility`
  passes both enabled/disabled budgets and rejects outsider access.
- Export the baseline to an ignored local file using
  `git show 3a2cc540:powersync/sync-config.yaml`, then run
  `node backend/scripts/verify-shared-review-visibility.mjs <baseline-file>`:
  96 read-only SQL checks pass.

The initial seven-test browser run passed six scenarios. The competition
home-first scenario reached result/access checks, then exceeded its four-minute
overall budget during final checks/cleanup; it did not report a score, clock or
lineup assertion failure. The scenario budget now allows six minutes for the
real remote database and exact-ID cleanup. The final rerun passes all seven:
three logger regressions, both friendly confirmation orders, and both generated
competition confirmation orders. Each paired scenario verifies locked sides,
22 pitch players, identical scores, alternating clock transitions and result
reload persistence against the real API. Command (PowerShell):

```powershell
$env:TWO_SIDED_LIVE_LOGGING_ENABLED='true'
$env:UI_TEST_PRODUCTION='true'
node scripts/run-ui-tests.mjs regression-ui two-sided-release --project=chromium --grep 'live match clock resumes|shared logger follows|assistant controls|two coaches'
```

Paired setup/results run against the dedicated database; no deployed accounts
or existing development fixtures are used. `TWO_SIDED_UI_CLOCK_CONTROLS=true`
selects actual resume/pause/halftime/second-half clicks in the paired suite;
`TWO_SIDED_UI_INTERACTIONS=true` additionally runs the wider lineup and duplicate
review interaction suite. The wider interaction suite is not a passing check
in this assessment.

The final frontend also passes all four checks in the clock-control run: the
same three logger regressions and one fresh paired friendly using the actual
buttons. Away pauses, home resumes and ends the half, then away starts the
second half; both clients show the running second-half clock before completing
confirmation and report reload checks. Reproduction:

```powershell
$env:TWO_SIDED_LIVE_LOGGING_ENABLED='true'
$env:UI_TEST_PRODUCTION='true'
$env:TWO_SIDED_UI_CLOCK_CONTROLS='true'
node scripts/run-ui-tests.mjs regression-ui two-sided-release --project=chromium --grep 'live match clock resumes|shared logger follows|assistant controls|same friendly session with home-first'
```

The separate test database has all expected migrations and required integrity
function bodies. Its release audit remains nonzero because it is not a PowerSync
replication target; it has no source publication/grants. Browser verification
therefore covers real API delivery and rendering, while the compiled rules and
SQL checks separately cover sync visibility/budgets. Deployed Cloud transport and
offline disconnect/reconnect remain release checks on the intended target.

## Migration-runner follow-up, 6 October

The user's `db:migrate` retry failed adding `long_free_kick_taker_id`. A read-only
review proved that `0045_game_plan_set_piece_roles`, `0046_match_tactical_change_enum`,
`0047_match_tactical_change_ingest`, and `0048_game_plan_player_instructions`
already have matching SQL hashes recorded at their older timestamps. The merged
file journal moved those entries past installed migration `0054`, so the runner's
timestamp-only pending check attempted to replay them.

The runner now recognises recorded content, including LF/CRLF equivalents, for
entries beyond its existing timestamp boundary. It preserves historical rows
and does not infer completed migrations from column presence. Older unmatched
history remains unchanged. `--dry-run` previews pending work without database
writes, and unexpected options fail before writes. Seven migration-runner tests
pass, including real PGlite execution proving an existing column is skipped and
the next migration applies once.

`npm.cmd --prefix backend run db:migrate -- --dry-run` identified only `0055` as
pending. The normal migration command then applied that one migration to the
configured development database. A second run reports no pending migrations.
Post-migration checks verify exactly one added migration record, unchanged
historical journal rows, confirmations, sheet links, sides and clocks, correct
visibility backfill, and installed privacy triggers with matching function bodies.
PowerSync rule and application deployments were not performed by this retry.

## Event search, map and pitch follow-up, 6 October

Reviewed the latest two commits (`56aea983`, dependency security, and
`588891e1`, migration journal handling) alongside all four two-sided documents.
Neither commit changes the picker, map tiles or shared player/formation rendering.
The recording's five issues are addressed on
`fix/live-logger-shared-pitch-regressions`.

- Friendly search already used distinct team IDs, but its left joins also
  returned coachless teams. Search now requires a coach membership and groups
  by team identity. The client also removes repeated IDs. Coach names distinguish
  genuinely separate teams with the same name; those teams are not merged.
  No existing teams are deleted, and no production duplicate records were
  inspected or repaired for this change.
- Event maps explicitly send the app origin as the tile referrer and display
  a visible OpenStreetMap copyright link. Separate map and copyright anchors
  avoid nested links. This meets the referrer/attribution requirements in the
  [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/).
  Browser checks intercept tiles and verify request headers, including a host
  default of `Referrer-Policy: no-referrer`; they do not prove a previously
  blocked account/network has been unblocked by the tile provider.
- Shared event labels retain shirt numbers. Public opponent labels now match
  the public lineup markers, and owning markers recover identity only from a
  unique match in the viewer's private match squad. Ambiguous matches stay
  unassigned. Private IDs are never added to the shared response.
- The shared report allowlists formation and custom coordinate deltas from
  tactical events. Opponent placement folds those deltas in chronological
  order, ignoring voided events, and keeps the goalkeeper when formations
  change. The owning sheet retains the full private tactical delta. Captain,
  set-piece athlete IDs, defensive/offensive settings and raw payloads stay
  private. Cached public geometry remains available in offline reports.
- The scoreboard/clock move into the top bar. The full pitch uses a 105:68
  aspect ratio and scrolls on short screens instead of being compressed by a
  maximum height. The activity panel starts alongside the pitch; responsive
  marker insets keep edge badges inside the pitch.

Backend and frontend must be deployed together for live formation geometry;
no new migration or PowerSync rule change is required. No hosted application,
Cloud configuration or development records were changed. Related work: this
recording; no issue/card was supplied. Assisted by Codex (GPT-6).

Validation for this follow-up:

- `npm.cmd --prefix backend test -- --runInBand --silent`: 72 suites,
  857 tests pass. After tightening the geometry-only gate, reran
  `npm.cmd --prefix backend test -- --runInBand --silent public-formation-change shared-session-privacy teams-search`:
  3 suites/19 tests pass, including real PGlite SQL/service paths.
- From `frontend`, `node --test --test-isolation=none "src/**/*.node-test.mjs"`:
  all 91 tests pass, including cached offline geometry and both views' badges.
- `npm.cmd --prefix frontend run build` and
  `npm.cmd --prefix backend run build` pass. The existing frontend chunk-size
  warning remains. Final frontend type checking and lint pass with the five
  existing warnings; ESLint passes for all changed backend files. Full backend
  lint retains the same two unrelated errors listed earlier in this document.
- `git diff --check` passes.

The focused production-build Chromium run passes all eight checks: existing
clock regressions, friendly-search identity deduplication, creating/receiving
coach map referrers, and both home/away pitch views. These browser scenarios
mock API/tile responses; the separate backend tests exercise actual service SQL
in PGlite. They do not establish hosted delivery or tile-provider unblocking.
Reproduce from the repository root:

```powershell
$env:UI_TEST_PRODUCTION='true'
node scripts/run-ui-tests.mjs regression-ui --project=chromium --grep 'friendly search|friendly event map|shared pitch|shared logger|live match clock resumes|assistant controls'
```

Initial browser attempts exposed incorrect test selectors, which were fixed.
A subsequent shortened 30-second run expired on the receiving-map case during
concurrent build/test work; the final run with the normal 90-second budget
passes all eight. Pitch screenshots are retained under ignored `test-results/`.
No test-schema reset was needed.

After the final intermediate-laptop header breakpoint and pause-overlay
alignment changes, rebuilt the frontend and reran the three clock checks and
both pitch checks: all five pass. The pitch checks cover 1440×900, 1280×560,
1100×700, 900×700 and 390×844, with 22 players, both sides' badges, formation
movement, a score at the top and no horizontal overflow. Screenshots were
visually reviewed for desktop and mobile layout.
