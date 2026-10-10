# Landing scene follow-up — 10 October 2026

The reported symptoms are delayed first appearance and camera lag/stalls during rapid scrolling. These changes preserve the scheduled construction batches, capability worker, dynamic Three.js import, constrained-device fallbacks, static mesh matrices, resolution budgets, idle rendering stop, pause/visibility handling, and resource cleanup. The plain initialization background remains.

## Findings and changes

- Camera easing previously advanced by a fixed fraction per frame. At 30 Hz, catching up took twice as long as at 60 Hz. Easing now uses elapsed time, retains the original 60 Hz response, bounds long gaps, and stops at the target. Unit coverage exercises 30/60/120 Hz, reversals, convergence, and resume gaps.
- Stadium floodlights changed visibility at the reveal; the daylight sun changed visibility with the theme. Three.js r128 includes visible light counts in program parameters, so those transitions could create new shader variants while scrolling. Lights now retain visibility and use zero intensity when off. The existing theme regression test also checks that program creation does not increase across repeated theme changes, with optional shirt downloads blocked to isolate lighting.
- Production shader diagnostics queried shader/link logs synchronously. Production now disables those diagnostic queries; development retains them. Shader compilation, rendering, and WebGL failure recovery remain.
- Public deployment inspection found Brotli-compressed scene/Three.js bundles, CDN hits, and `Cache-Control: public, max-age=0, must-revalidate`. Both Vercel configurations now set `public, max-age=31536000, immutable` only for `/assets/`, whose files are generated with content hashes. HTML, service-worker entrypoints, auth/API routes, and unversioned models retain their existing policies. This helps repeat visits; it does not eliminate cold shader/texture work. See [Vercel headers configuration](https://vercel.com/docs/project-configuration/vercel-json#headers).

## Measurements and limits

The deployed URL inspected was https://gaffer-virid.vercel.app/. Individual public asset fetches took roughly 55–168 ms on this connection. This is not a mobile network measurement or proof that downloads are fast for every visitor. The deployed scene still contained the old visibility toggles and lacked the local shader-diagnostic change at inspection time.

The existing profiling script was run against the pre-existing local production build and the updated production build, sequentially, using its hardware-capability shim on SwiftShader. The pre-existing build's exact correspondence to current HEAD was not independently established, so these are diagnostic observations rather than a controlled revision benchmark:

| Observation | Pre-existing build | Updated build |
| --- | ---: | ---: |
| Scene readiness / scroll start | 3.924 s | 4.636 s |
| Longest observed scroll task | 12,318 ms | 268 ms |

The updated cold-start browser test separately recorded first scene appearance at 3.949 s. Software GPU timings are variable and do not establish hardware GPU performance, a startup improvement, or absence of all scrolling stalls. The five-second profile can finish later when a long task blocks its timer. The diagnostic records are in ignored `.performance-local/scene-before-followup-tasks.json` and `.performance-local/scene-tasks.json`.

Cold first appearance still requires downloading/evaluating the lazy scene, procedural geometry/textures, shader preparation, and a first render. Without a visual placeholder, instant background appearance is not established. Verify the new cache headers after deployment and measure first appearance plus rapid reveal/reversal scrolling on the affected real devices.

## Validation

Production TypeScript/Vite/PWA build, frontend lint, and all 157 frontend unit tests pass. All 14 landing scene/theme Playwright tests pass, covering startup, controls, mobile resolution, theme shader reuse, reduced motion, software/WebGL fallback, navigation cancellation, and optional asset failure. Browser validation uses the repository Playwright suite because the Browser skill connection failed with missing `sandboxPolicy` metadata. Both Vercel configurations parse successfully and `git diff --check` passes. No deployment, commit, or push was performed.
