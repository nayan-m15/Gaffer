# Targeted performance and validation audit

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
