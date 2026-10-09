# Landing performance verification

## Scope and revisions

Work stays on `fix/performance-dashboard-audit` as explicitly requested. The original clean checkout was `005299491fe1393a078736e55d2843fd81b100e0`. Its dashboard changes were committed and present on the local remote-tracking fix branch, but were not contained in local `development`; no live remote integration check was performed. Those changes were preserved.

The landing implementation is committed at `91f04fe5` by the user. This follow-up completes measurement and documentation without creating a commit, pushing, merging or deploying. The accompanying [results file](landing-performance-results.json) records full revisions, frontend file hashes, individual measurements, generated image sizes and bundle sizes.

## Measured implementation

After these measurements, the user requested removal of the stadium image shown before the scene loads. The current landing page uses a plain dark background during initialization and fallback, and the unused generated stadium WebP variants were removed. The original PNG remains in use on HowItWorksPage. The measurements below describe the earlier image-backed version; they have not been rerun for this visual change.

- An optimized responsive static background remains behind the canvas during initialization and failure, preserving the existing opacity transition.
- Reduced motion, data-saving preferences and constrained memory/CPU select the static background before importing Three.js. A small worker probes software-renderer capability; unsupported worker WebGL falls through to the existing main-thread WebGL path. The main renderer retains its own software-renderer check.
- Room construction, equipment, stadium stands and shader material variants run in separate scheduled tasks. Initialization yields to browser input and rendering, pauses in hidden tabs, and supports cancellation. Partial construction releases resources and its renderer on cancellation or failure.
- Camera progression, instancing, static matrices, bounded canvas resolution, reduced-cost rendering, GLTF shirt replacement, pause/resume, theme updates and disposal remain. Changes during initialization are reflected in the first frame. Identical resize notifications no longer redraw the scene.
- All seven screenshots have responsive WebP variants with intrinsic dimensions, lazy loading and asynchronous decoding. Small displays retain larger sources when their pixel ratio requires them. The HTML and React loaders share transparent responsive logo assets.
- Authenticated layouts are lazy-loaded behind the existing route and Suspense boundaries. Auth/session checks, refresh, offline storage and PWA update behavior remain. PowerSync database initialization was already dynamic and is not claimed as an anonymous landing startup cost.
- The three local non-composited-animation findings were hero links animating inherited `scrollbar-color` through `transition-all`. Landing button transitions now specify their intended properties.

## Measurement method

The supplied public-site report used Chromium 153 and custom throttling whose exact settings were unavailable. Its FCP 0.5 s, LCP 1.0 s, TBT 7,180 ms and CLS 0 are context, **not** the before half of the comparison below.

The local comparison uses Lighthouse 13.5.0, Playwright Chromium 151.0.0.0, Windows 10.0.26300, 12 logical processors, 16 GiB RAM and SwiftShader. URL: `http://127.0.0.1:4187/`. Each device has three before and three after runs, using production builds, fresh Lighthouse browser profiles, storage reset, DevTools throttling and a CPU slowdown multiplier of 4. Runs are sequential; normal unrelated host applications were not controlled.

- Desktop: desktop preset, 1350 × 940, DPR 1, no network throttling.
- Mobile: default mobile preset, 412 × 823, DPR 1.75; request latency 562.5 ms, download 1474.56 Kbps, upload 675 Kbps.
- Browser flags: `--headless --enable-webgl --use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist`.
- `--only-categories=performance --save-assets --output=json` captures reports, DevTools logs and Chrome traces.

Initial measurements accidentally used the repository's local `NODE_ENV=development`; those were discarded. Both retained builds explicitly set `NODE_ENV=production`. Earlier intermediate after-runs are also excluded. The final after batch was interrupted and resumed on the identical build; four completed reports were retained and two missing mobile reports collected. `--resume` must only be used when the build and settings remain identical. The summary script rejects mismatched Lighthouse configurations.

Raw reports, traces, profiles and screenshots live in ignored `.performance-local/`. Compact results are retained in the results file. The backend was not running: anonymous Lighthouse session requests could receive a proxy connection failure. The same local condition applied before and after; browser regression tests mock sessions. These are frontend lab measurements, not full production network measurements.

## Results

Values are median (minimum–maximum). Paint and speed metrics are seconds; TBT is milliseconds.

| Device / metric | Before | After |
| --- | --- | --- |
| Desktop FCP | 1.524 (1.343–1.532) | 1.660 (1.482–1.836) |
| Desktop LCP | 4.358 (2.976–4.382) | 4.777 (4.720–4.832) |
| Desktop TBT | 9,533 (3,937–10,230) | 2,116 (846–2,190) |
| Desktop Speed Index | 10.157 (8.763–10.497) | 4.768 (4.714–4.831) |
| Desktop CLS | 0.020016 (0.020016–0.020016) | 0.020016 (0.020016–0.020158) |
| Mobile FCP | 3.691 (3.655–3.768) | 2.824 (2.802–2.830) |
| Mobile LCP | 6.822 (6.774–6.884) | 6.830 (6.702–7.824) |
| Mobile TBT | 4,669 (4,529–5,086) | 1,303 (1,074–1,843) |
| Mobile Speed Index | 7.097 (7.085–7.284) | 5.042 (4.941–5.299) |
| Mobile CLS | 0.000523 (0.000523–0.000523) | 0.000523 (0.000523–0.000523) |

Median TBT decreases approximately 78% on desktop and 72% on mobile. Desktop FCP increases 136 ms and LCP increases 419 ms; mobile median LCP is effectively unchanged, but its worst run is slower. Therefore this comparison does **not** establish preservation or improvement of every paint metric. Median CLS is unchanged, with a small desktop outlier difference. The local LCP insight identifies the animated “Scroll to enter” span, rather than the static background image, as its LCP element; speculative image preloading was not added to explain that delay.

The median longest reported desktop task decreases from 4,116 ms to 1,128 ms. All three before desktop runs report three non-composited animations; all three after desktop runs report zero. The 150 ms desktop TBT target remains unmet.

## Trace evidence and limits

In production baseline desktop run 2, the trace includes a 4,083 ms `FunctionCall` in `landing-scene-DgtPuxOT.js`, inside a 4,116 ms task. A separate unthrottled Chrome CPU profile attributes about 1,732 ms of sampled time to the emitted Three.js WebGL program constructor (`Bi`) and 187 ms to its context-acquisition function (`ce`). This supports shader program creation and context acquisition as optimization candidates; it does not isolate every native shader compilation, texture upload, asset decoding or rendering cost.

The supplied index bundle's 9.48 s total CPU is not treated as JavaScript evaluation. In the retained local desktop baseline run 2, the index bundle's bootup attribution was approximately 1,599 ms total and 1,160 ms scripting. Lighthouse's inclusive long-task URL attribution can differ from per-bundle scripting attribution. Native and unattributed work remains unresolved; “Other” is not assigned a presumed GPU cause.

The final split-construction profile exercised 3D through a test-only hardware-capability shim on SwiftShader: startup tasks were 144, 316, 153 and 51 ms, with no observed long tasks in the subsequent five-second scroll interval. Scene readiness occurred at approximately 4.68 s. This is task-boundary evidence, not hardware GPU benchmarking; it also does not establish absence of GPU stalls or later long tasks. The profile bypasses only capability selection to exercise initialization; ordinary Lighthouse runs receive the intended software-renderer fallback. Expensive scene work is tested independently rather than merely moved beyond an audit window.

An isolated final static-fallback profile (with mocked anonymous session and blocked service workers) recorded one 141 ms startup task and no long tasks in the five-second scroll interval; readiness occurred at approximately 2.48 s. This narrower setup differs from Lighthouse's live failed backend request and enabled PWA path, so its timings are not substituted for Lighthouse TBT.

The Browser skill connection was attempted and failed with an environment metadata error (`sandboxPolicy` missing). Repository Playwright provided the browser fallback. Full-quality 3D screenshot readback timed out on SwiftShader; ordinary static-fallback screenshots were captured and visually checked in light/dark themes and at the tactics section. Logo transparency and screenshot labels remain readable. Real GPU visual/performance verification remains a deployment check.

## Asset and bundle costs

Sizes below are actual bytes on disk, not Lighthouse estimated savings or assumed HTTP transfer sizes.

| Asset | Original bytes | Selected generated variants, bytes |
| --- | ---: | --- |
| Tactics board | 348,520 | 480: 26,606; 800: 58,562; 1280: 118,332; 1531: 175,910 |
| Roster dashboard | 133,667 | 480: 12,842; 800: 24,950; 1280: 47,620; 1417: 56,920 |
| Events calendar | 114,226 | 480: 9,084; 800: 19,358; 1280: 36,530; 1418: 43,142 |
| Transparent logo | 202,805 | 112: 12,410; 224: 33,296; 634: 116,156 |
| Static stadium background | 2,317,468 | 960: 40,546; 1792: 114,564 |

The main entry decreased from 413,838 bytes / 126,497 bytes gzip to 315,156 bytes / 99,425 bytes gzip. The worker probe is 387 bytes / 264 bytes gzip. The results file gives all final names and sizes. Three.js remains 517,764 bytes / 127,599 bytes gzip: framework functionality was preserved. Its module is not evaluated by the ordinary software-renderer fallback. This entry comparison is not a claim about total initial transfer: shared dependencies and PWA precaching must also be considered. The final PWA build precaches 200 entries, approximately 5,319 KiB, including workspace route assets.

The generated Inter declarations already use `font-display: swap`. Loader font-readiness and failure recovery were preserved. The small shared loader stylesheet was retained; blanket CSS deferral or speculative DOM reflow changes were not applied.

## Commands and verification

Run from the repository root in PowerShell. Tool versions used were Sharp 0.35.5 and Lighthouse 13.5.0, installed in npm's temporary tool cache without changing application dependencies.

```powershell
# Install measurement/image tools in npm's tool cache if needed.
npm.cmd exec --yes --package=lighthouse@13.5.0 --package=sharp@0.35.5 -- node -e "console.log('Performance tools available')"
# Set these to the resolved cache locations on your machine.
$env:SHARP_MODULE='C:/Users/hpars/AppData/Local/npm-cache/_npx/84473e7126e5ae68/node_modules/sharp'
$env:LIGHTHOUSE_CLI='C:/Users/hpars/AppData/Local/npm-cache/_npx/84473e7126e5ae68/node_modules/lighthouse/cli/index.js'
$env:CHROME_PATH='C:/Users/hpars/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'
node scripts/prepare-landing-images.mjs
$env:NODE_ENV='production'
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run preview -- --host 127.0.0.1 --port 4187 --strictPort
# In another terminal, against the appropriate revision/build:
node scripts/audit-landing.mjs production-before
node scripts/audit-landing.mjs final-after
# If interrupted and the build/settings have not changed:
node scripts/audit-landing.mjs final-after --resume
node scripts/summarize-landing-audit.mjs
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend test
npx.cmd playwright test --config playwright.landing.config.ts
npx.cmd playwright test --config playwright.landing.config.ts --grep 'landing|geometry|peer report'
npx.cmd playwright test --config playwright.landing.config.ts --grep landing
$env:PROFILE_LANDING_3D='1'
node scripts/profile-landing.mjs http://127.0.0.1:4187/ --no-screenshots
Remove-Item Env:PROFILE_LANDING_3D
node scripts/profile-landing.mjs http://127.0.0.1:4187/ --no-screenshots
```

The original retained baseline was built from the original tracked frontend source at `00529949` before restoring pending landing changes. Its audit commands used exactly the flags generated by `audit-landing.mjs`, with report prefix `production-before`. For reproduction, use a separate checkout of that revision; do not overwrite unrelated working changes.

Verified results before this documentation follow-up:

- Production build passes, including TypeScript and PWA generation. Existing large-chunk warnings remain.
- Frontend lint passes. All 142 unit tests pass, including scheduler and worker cancellation/compatibility checks.
- Full selected Playwright suite: initially 30/32 passed; reduced-motion cleanup and an unrelated report reload exceeded short timeouts. Targeted rerun: 15/15 passed, including both failures, theme/navigation and dashboard GPU disposal. After adding the worker probe, landing/theme rerun: 13/13 passed. The final worker-null compatibility branch also passes targeted unit coverage.
- Authenticated sidebar navigation, account switching, shared reports and the earlier dashboard pagination behavior passed the broader suite. No backend schema/API changes were made; backend/database suites were not needed for this frontend change.
- A cross-tab unit timing assertion failed once while browser tests ran concurrently; the full unit suite subsequently passed without that contention. A direct isolated test command encountered sandbox `EPERM`; `node --test --test-isolation=none frontend/src/components/landing/scene-capability.worker.node-test.mjs` passed 2/2.
- Vite/Chromium and tool downloads required approved execution outside the sandbox. PowerShell execution policy was left unchanged; commands used `npm.cmd`/`npx.cmd`.

## Remaining concerns and deployment

The desktop TBT target of 150 ms is not achieved. Retest both devices on the actual deployed URL and on real mobile/hardware GPUs with consistent settings. The local before/after samples are small and variable; improvements in blocking do not establish improvements in every paint metric. Inspect the retained traces for remaining layout/render/native costs before making further changes.

Deploy the new WebP assets and worker chunk with their referencing HTML/JS. Verify worker support/CSP and the compatible main-thread path on browsers without worker WebGL. Preserve PWA update coordination so active offline capture tabs are not forcibly refreshed. This work did not run a dedicated PWA/offline browser suite or a real-device accessibility audit; prior functionality and generated worker behavior were preserved, not claimed comprehensively revalidated.

Reference guidance: [Total Blocking Time](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time), [JavaScript execution](https://developer.chrome.com/docs/lighthouse/performance/bootup-time), [image delivery](https://developer.chrome.com/docs/performance/insights/image-delivery), [forced reflow](https://developer.chrome.com/docs/performance/insights/forced-reflow).

AI assistance: Codex[GPT-6].
