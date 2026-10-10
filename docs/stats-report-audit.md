# Stats report audit and implementation plan

Date: 9 October 2026

## Audit before implementation

| Issue | Responsible source | Root cause and impact | Resolution |
| --- | --- | --- | --- |
| Permanently visible preview | `frontend/src/pages/StatisticsPage.tsx`, StatisticsPage | `reportData && <section>` mounts the report on every loaded page. There is no visibility or operation state. It adds duplicate content and layout space, including for assistants. | Remove the section and let ReportActions mount the preview only for print/share. |
| Printing the dashboard | `ReportActions.tsx`, `frontend/src/index.css` | Print immediately calls window.print. Broad visibility rules reveal the whole statistics page, including management and interactive sections; hidden ancestors still occupy layout space. | Print a temporary, independent iframe containing only a cloned report. Remove global dashboard print selectors; scope report styles to the iframe body. |
| Missing printed charts | `SeasonTrendsSection.tsx` | All three chart sections carry no-print, which hides them despite SVG print rules. | Reuse the existing chart components inside the self-contained report, with no no-print ancestors. Leave normal dashboard sections unchanged. |
| Incomplete standalone report | `TeamPerformanceReport.tsx` | Commit 06549972 removed summary/player content to address dashboard duplication, leaving a report dependent on other page sections. | Restore summary/player tables in the temporary report; add existing season charts. |
| Concurrent and stale actions | `ReportActions.tsx` | Only PDF has a pending flag. Share/CSV/print have no common lock or unmount protection. | Use a synchronous operation ref, state for rendering, captured report context and AbortController for pending print/PDF work; invalidate callbacks on unmount. |
| Share has no review/lifecycle UI | `ReportActions.tsx` | Native CSV sharing or clipboard copy runs immediately. Cancellation is silently returned, but overlapping native requests are possible. | Review dialog, guarded confirmation, preserve both sharing methods, await actual native share completion; dismiss on success/cancel/error. Disable dismissal only while native share is pending because the browser owns cancellation. |
| Export menu obscured by statistics content | `StatisticsPage.tsx` | Header and following content share z-10 stacking contexts. The later content intercepts menu clicks even though the menu has z-30 inside the header. | Raise the reporting header above content with z-20. |
| Download error leaks resources | `report-export.ts` | Link removal and object URL revocation occur only after link.click succeeds. | Always remove link and revoke URL in finally. |
| PDF omits visual trends and clips table text | `report-export.ts` | PDF uses native jsPDF drawing and does not require HTML, but has no charts; table cells keep only their first wrapped line. | Retain native PDF generation and filenames; draw vector trend charts from existing chart-data builders and wrap table rows. Include saves and average goals in PDF/CSV while retaining existing CSV column order and formula guards. |
| Chart readiness and legend sizing | `report-print.ts`, `report.css` | Recharts also assigns recharts-surface to legend icons. Generic SVG selection waits on an icon instead of chart content and generic sizing stretches legends. | Select only the main SVG directly inside recharts-wrapper for readiness and sizing. |
| Chart ID collision | `season-trends-charts.tsx` | Cumulative chart gradient has a fixed SVG ID; page plus preview duplicate it. | Use React useId for unique gradient references. |

### Feature traces

- Data: URL filters in useStatisticsFilters -> useStatistics query key -> services/statistics getStatistics/toUiOverview -> StatisticsPage reportData. TeamReportData includes overview and team/season/competition/period context. No backend changes needed.
- Screen preview: previously mounted in StatisticsPage regardless of operation; TeamPerformanceReport uses AppCard, reportHighlights and formatting.
- Print: previously immediate window.print; index.css changes the entire dashboard into print layout. No existing print session, iframe or before/afterprint subscriptions.
- PDF: export dropdown -> lazy jsPDF import -> native summary/highlight/table drawing -> pdf.save. No mounted HTML, portal or offscreen target required.
- CSV: export dropdown -> buildTeamReportCsv (including CSV formula protection) -> Blob -> temporary anchor/object URL.
- Share: CSV File passed to navigator.share when navigator.canShare allows file sharing; otherwise summary copied with navigator.clipboard. Generating a file alone never counts as sharing.
- Existing resources: dropdown outside-click listener and notice timer already have effect cleanup; existing Base UI/shadcn Dialog supports focus trap, Escape, labels, initialFocus and finalFocus.
- Related normal page children: StatCardsGrid, RecentFormSection, SeasonTrendsSection, season/match insights, PlayerStatsTable, AthleteStatsPanel, AthleteComparisonSection, SeasonsSection, StandingsSection, AssistantChatPanel. Their normal behavior and queries remain in place.

## Implementation plan and architecture

1. Reuse ReportActions as the reporting owner, TeamPerformanceReport as the document, existing Dialog/Button/AppCard components, reportHighlights, CSV builders, formatting and chart-data builders.
2. Remove only the always-rendered page preview. Keep actions accessible from the existing header.
3. Capture the selected report at operation start with a fresh generated timestamp. Query results are immutable; context is copied. Do not derive preview from subsequent query updates.
4. Use one active operation (print/share/pdf/csv), with pending flag and synchronous ref to block clicks before React commits. Default idle state mounts no document.
5. Show accessible, scrollable responsive review dialog for print/share. Return focus to initiating control. Allow cancel, Escape and backdrop dismissal before operation execution.
6. Make the report self-contained: cover, summary, existing charts, highlights, match results, player table and footer. Keep large tables locally horizontally scrollable on mobile.
7. Print: wait for fonts and rendered chart SVGs, copy report and loaded app styles into isolated A4 iframe, await stylesheet/fonts/images, register afterprint and matchMedia events before print, retain target until an event or explicit close. Do not use a timer to end printing. Remove every session listener/iframe in finally and abort on unmount.
8. Share: confirmation click synchronously calls native sharing to retain user activation. Await actual completion; handle AbortError cancellation; preserve clipboard fallback. Block duplicate calls until native sharing settles.
9. Export: keep direct PDF/CSV download without preview. PDF checks abort after lazy import and before save. CSV cleanup uses finally. Include native vector charts without adding libraries or mounted HTML.
10. CSS: replace broad global Stats print rules with iframe-specific light report palette, repeated table headers, sensible page breaks and scalable SVG viewBoxes. Preview retains semantic light/dark tokens.
11. Verification: existing frontend unit tests, TypeScript, lint, build; add browser regression tests for conditional mounting, focus/cancel, printing data/charts, print events/fallback/error/unmount, sharing methods/success/cancel/error/duplicate lock, export download/failure cleanup and mobile themes.
12. Document actual outcomes and limitations. Browser print/native share mocks do not establish that OS dialogs or physical printers work.

## Lifecycle

- Idle: no report DOM or iframe.
- Print/share review: modal report exists; page actions disabled.
- Printing: iframe retains capture target while browser owns print interaction; afterprint or print-media exit closes preview. Explicit Close preview recovers browsers that send no completion event.
- Sharing: native asynchronous call or clipboard copy owns completion; browser's native cancellation resolves as AbortError.
- Export: direct file generation, no report DOM.
- Success/cancel/error: operation guard released; modal/print frame disposed; notifications only for success/error.
- Unmount: abort current session, invalidate callbacks, remove temporary DOM/listeners.

## Verification results

- TypeScript: `node frontend/node_modules/typescript/bin/tsc -b frontend` passed (exit 0).
- Lint: frontend oxlint with `--deny-warnings` passed: 0 warnings, 0 errors, 343 files.
- Frontend unit tests: `node --test "src/**/*.node-test.mjs"` in frontend passed: 130 tests, 0 failures.
- Production frontend build: TypeScript and Vite build both passed. Vite retains the existing application warning about chunks larger than 500 kB.
- Chromium regression suite: `playwright.statistics.config.ts` passed: 23 tests, 0 failures, about 3 minutes. Final run reused the already-started built preview using REPORT_TEST_REUSE_SERVER=1.
- Actual downloads: browser download events produced correctly named CSV and PDF files; CSV was inspected for selected scope/player data; PDF signature and player/chart text were inspected.
- UI screenshots: visually inspected light/dark 390px mobile previews and dark 1280px desktop preview; automated bounds/readability checks also passed at 768px.
- Print tests: actual mounted SVGs and isolated iframe DOM were inspected; mocked print/afterprint and print-media transitions verified content, repeated operations, error cleanup, recovery and unmount disposal. Dark-mode print target resolves to a light palette.
- Share tests: mocked Web Share and clipboard APIs verified payload scope/data, pending lock, cancellation, success, failure and late settlement after unmount.
- Download failure: simulated anchor.click failure verified matching object URL creation/revocation and no retained download anchors.
- Git diff whitespace check passed.

### Limits

Physical printing and OS-native print/share dialogs were not exercised. Firefox and Safari were not run. Print-event fallback is explicit Close preview; native sharing cancellation remains owned by the native share sheet while its promise is pending. Unrelated Stats workflows were not exhaustively exercised against a real backend, although existing frontend unit tests pass and normal-page code was preserved.

The Windows sandbox denied stopping the earlier test-runner/preview processes; the final regression runner exited successfully. The built test preview on port 4187 may remain running. This is separate from application report resources: iframe/listener/preview disposal passed the regression checks.

## Changed files

| File | Purpose |
| --- | --- |
| frontend/src/pages/StatisticsPage.tsx | Remove permanent preview; raise reporting header above content for dropdown access. |
| frontend/src/features/statistics/ReportActions.tsx | Own one report operation, captured data, modal preview, busy state, cancellation and notices. |
| frontend/src/features/statistics/TeamPerformanceReport.tsx | Restore standalone summary/player data and reuse existing charts. |
| frontend/src/features/statistics/report-print.ts (new) | Readiness, isolated iframe printing, completion signals and guaranteed disposal. |
| frontend/src/features/statistics/report-share.ts (new) | Preserve native CSV sharing and summary clipboard fallback; distinguish cancellation. |
| frontend/src/features/statistics/report-export.ts | Finally-based download cleanup; abortable PDF generation, vector charts and wrapped table values. |
| frontend/src/features/statistics/team-report-model.ts | Append saves column and goal averages while preserving CSV column order and formula protection. |
| frontend/src/features/statistics/season-trends-charts.tsx | Unique cumulative-chart gradient IDs for simultaneous page/preview rendering. |
| frontend/src/features/statistics/report.css (new) | Isolated print palette, scalable chart SVGs, table pagination and footer. |
| frontend/src/index.css | Remove broad dashboard visibility/print styling. |
| frontend/src/features/statistics/team-report-model.node-test.mjs | Verify column alignment, saves and averages. |
| frontend/e2e/statistics-report.spec.ts (new) | 23 reporting lifecycle, download, theme and responsive regressions. |
| playwright.statistics.config.ts (new) | Dedicated reporting suite with optional existing preview reuse. |
| docs/stats-report-audit.md (new) | Audit, architecture, implementation plan and verification record. |

No backend changes, new dependencies or commits. Unrelated user-created returns.java was left untouched.
