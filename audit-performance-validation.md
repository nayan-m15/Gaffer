# Targeted performance and validation audit

## Implementation follow-up: 9 October 2026

Implemented on `fix/performance-dashboard-audit`, renamed from the initial documentation review branch because this work now includes application fixes. The base remains `development` at `c948775b`.

- **Player aggregation:** Athlete IDs are paged first. Event counts are grouped by match and athlete, and completed-match totals are grouped in SQL into one response row per athlete. JavaScript no longer receives and aggregates the match-history fan-out. Substitution appearances, zero-history players, filters and deterministic page order are preserved.
- **Dashboard loading:** The client requests 40 players and 100 matches initially, with explicit "Load more" controls. Name search and position filters run before server pagination, so unloaded players remain searchable. Cancelled filters abort obsolete requests. Failed additional pages preserve loaded data and expose manual retry, including 429 responses. Player and match lists no longer poll all loaded pages every five seconds; standings refresh every 30 seconds.
- **Complete summaries:** The existing matches response now includes a separately cached `summary: { total, cleanSheets }`, covering the full filtered dataset. Clean sheets do not depend on how many match pages have loaded or whether standings exist. Match totals identify when paging ends.
- **Benchmark:** Corrected the standings join through competitions, aligned player SQL with grouped aggregation, bounded `--limit` to 1–200, and removed unsupported worst-case/cold-cache/read-only-transaction claims. Both benchmark SQL statements execute against the isolated test schema.
- **Public contract:** Updated Swagger metadata, API documentation and mocked service fixtures. No new route or database migration is required. Deploy the backend before the frontend because the UI uses the additive match summary field.

Verification:

```powershell
npm.cmd --prefix backend test -- --runInBand --no-cache --runTestsByPath src/public-api/public-dashboard.service.spec.ts src/public-api/public-dashboard.controller.spec.ts src/public-api/public-dashboard.postgres.spec.ts src/swagger-config.spec.ts
npm.cmd --prefix backend run build
npm.cmd --prefix backend run lint
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run lint
npx.cmd playwright test --config playwright.regression.config.ts --grep 'public dashboard|live match clock resumes|remote clock changes'
git diff --check
```

The focused backend run passed **43 tests in four suites**. Backend and frontend builds pass. Browser checks passed for desktop (1280 px) and mobile (390 px) pagination/search, full clean-sheet totals with no standings, 429 recovery, persisted clock resume and remote clock changes: **five scenarios**, run in focused subsets. The isolated PostgreSQL scale scenario uses 200 players with 80 matches each (16,000 history rows), verifies exact totals and 200 returned rows, and executes `EXPLAIN (ANALYZE, BUFFERS)`. This is synthetic correctness/query-plan evidence, not a deployment latency claim. Production database timings, browser render profiling and deployed acceptance remain follow-up verification. The existing build warning about large bundles remains outside this audit's targeted fixes.

The review below records the state before these fixes; its outstanding work list is historical.

## Review update: 9 October 2026

Reviewed against `development` at `c948775b`, on branch `docs/performance-audit-review`. The original findings below are retained as historical context; their line numbers describe the earlier checkout. Current source shows six findings addressed and two partially addressed. No original high-severity defect remains unchanged, but performance at realistic scale is still unverified.

### Status of the original findings

| Original finding | Current status and evidence |
| --- | --- |
| High: player pagination after full aggregation | **Partially addressed.** `backend/src/public-api/public-dashboard.service.ts:171` pages athlete IDs in SQL before fetching their statistics. The second query is restricted to those IDs, but still loads their match-history rows and computes correlated event counts before aggregating in JavaScript. The original whole-dataset-per-page defect is fixed; grouped SQL aggregation remains a possible improvement. |
| Medium: live logger renders five times per second | **Addressed in source.** `frontend/src/pages/LiveMatchPage.tsx:294` isolates the displayed clock in `LiveClockTime`, ticking once per second. The 200 ms parent interval at line 556 updates a ref and only sets elapsed state when the minute changes. Other state changes can still render the page; render cost has not been profiled. |
| Medium: upload items processed serially | **Addressed in source.** `backend/src/sync/sync.controller.ts:86` processes batches of up to four independent items concurrently, flushing for repeated match IDs, receipt IDs and causal parents. Same-match and dependent operations remain ordered intentionally. Receipt lookups remain per item; further batching needs measured justification. |
| Medium: sequential 500-player pages | **Partially addressed.** `frontend/src/services/public-dashboard.ts:133` uses three concurrent pages of 200, matching the API cap. Backend pages no longer recompute every athlete's history. The client still loads every matching player before resolving the query. |
| Medium: malformed location query throws | **Addressed in source.** `backend/src/weather/locations.controller.ts:55` accepts `unknown`, checks for a string before trimming, and returns 400 for invalid type or length. |
| Medium: competition text length validation | **Addressed in source.** `frontend/src/features/competitions/CompetitionDialogs.tsx:148` applies input length bounds and field errors; validation at line 348 blocks invalid submissions, including locked competition edits. Bounds match the backend's trimmed 100-character name and optional 20-character season. |
| Low: matches truncated at 50 | **Addressed in source.** `frontend/src/services/public-dashboard.ts:121` retrieves explicit 100-match pages until a short page, rather than relying on the default 50. |
| Low: mandatory 700 ms loading hold | **Addressed in source.** `frontend/src/components/loading/LoadingScreen.tsx:29` starts fading when `appReady` is true. The 600 ms timer is a fallback for a missing transition event, rather than a minimum hold before fading. |

### Changes and verification still needed

1. **Fix the benchmark before using it as evidence.** `backend/scripts/benchmark-public-dashboard.mjs:129` joins standings using `st.team_id`, but the current standings schema (`backend/src/database/schema/index.ts:1064`) has `competition_id` and no `team_id`. Mirror the service's standings joins through competitions and teams. Its header also claims a read-only transaction, while the implementation issues separate SELECT statements without an explicit transaction. Correct that claim or implement it. The selected player page is the first page in display order, not necessarily the most expensive page, despite the script's worst-case description. The player page is timed once, so the header's claim of cold/warm timings for both player statements also needs correcting.
2. **Measure the remaining player query cost.** The query at `backend/src/public-api/public-dashboard.service.ts:198` still scales with page size multiplied by each athlete's match history, including four correlated event counts and an appearance lookup. Cache and rate limits mitigate repeated requests but do not eliminate a costly uncached query. Capture representative query plans and timings before deciding whether grouped SQL aggregation is necessary; preserve completed-match, appearance and filter semantics in any rewrite.
3. **Bound dashboard loading as data grows.** `frontend/src/services/public-dashboard.ts:140` fetches all pages, and `frontend/src/pages/PublicDashboard.tsx:82` starts match and player queries immediately. Consider server-driven table pagination and a separate summary endpoint so correct totals do not require downloading all rows. If full loading remains intentional, measure large datasets and check behavior when the API's request budget is exceeded. Player batches can also request up to two unnecessary pages at the end.
4. **Verify frontend behavior and real scale.** Confirm multiple match/player pages, competition length errors, clock renders and loader timing in the browser. Existing focused backend tests establish mocked behavior, not database execution plans, browser performance or deployed behavior.

### Verification performed in this review

```powershell
npm.cmd --prefix backend test -- --runInBand --runTestsByPath src/public-api/public-dashboard.service.spec.ts src/public-api/public-dashboard.controller.spec.ts src/sync/sync.controller.spec.ts src/weather/locations.controller.spec.ts
```

Result: **4 suites passed, 73 tests passed**. The logged sync database timeout is the expected error path exercised by a passing test. No database benchmark, integration test, browser verification or runtime profiling was run. This review updates documentation only; application code is unchanged.

## Original audit (historical)

Scope: `frontend/src` and `backend/src`, with the referenced product and API documents used for context. This is a source review; no runtime profiling or database query plans were run. Test files, configuration files, and dependencies were excluded.

## High

- **Performance — `backend/src/public-api/public-dashboard.service.ts:161`:** The public players endpoint joins and computes statistics for every matching athlete and match row, then applies `offset` and `limit` only after loading and grouping all rows in memory, so each page costs roughly the full dataset. **Fix:** Page athlete IDs in SQL first, then aggregate statistics only for those athletes with grouped queries.

## Medium

- **Performance — `frontend/src/pages/LiveMatchPage.tsx:427`:** A 200 ms interval updates `elapsedMs` in the 2,653-line live match page, causing its render tree and render-time timeline calculations to run up to five times per second while the clock runs. **Fix:** Isolate the clock display and time-dependent controls in smaller components, and update the displayed time at the lowest useful frequency.
- **Performance — `backend/src/sync/sync.controller.ts:91`:** A permitted upload batch of up to 50 items awaits each operation serially, including multiple receipt and match database calls per item, so request latency grows with the sum of all item latencies. **Fix:** Batch independent receipt lookups and processing where causal ordering permits, while preserving per-item outcomes.
- **Performance — `frontend/src/services/public-dashboard.ts:137`:** The public dashboard fetches players in sequential 500-record pages, while each backend page recomputes the full player history; loading time and database work grow sharply as the player count increases. **Fix:** Use server-side athlete pagination and aggregation, then request only the pages needed by the view or provide a bounded bulk summary endpoint.
- **Validation — `backend/src/weather/locations.controller.ts:27`:** `q` is typed as a string but is not runtime-validated before `.trim()`, so a repeated or object-shaped query value can throw a server error instead of the documented 400 response. **Fix:** Validate that `q` is exactly one string before trimming and checking its length.
- **Validation — `frontend/src/features/competitions/CompetitionDialogs.tsx:85`:** The form accepts any nonempty competition name and season label, while the API limits them to 100 and 20 characters respectively, allowing values that the UI presents as valid but the backend rejects. **Fix:** Apply the API length bounds in form validation and show field-specific errors before submission.

## Low

- **Performance — `frontend/src/services/public-dashboard.ts:125`:** Match loading makes one request without pagination parameters, so the backend default of 50 records truncates the public dashboard and its derived summaries when more matches exist. **Fix:** Add explicit match paging or a dedicated aggregate endpoint for the summaries.
- **Performance — `frontend/src/components/loading/LoadingScreen.tsx:37`:** The full-screen loading overlay stays visible for at least 700 ms even when route content and fonts are ready, adding a fixed delay to perceived loading on fast visits. **Fix:** Remove or shorten the minimum hold time, or let ready content display while the branded transition finishes.
