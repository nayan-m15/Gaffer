# Dependency Security Policy (SEC-011)

How this repository decides which dependency advisories to fix, which to accept,
and what evidence to record. Audited 10 October 2026.

## Projects audited

Three independent npm projects, each with its own lockfile:

| Project     | Command                                |
| ----------- | -------------------------------------- |
| `/` (root)  | `npm audit --omit=dev` / `npm audit`   |
| `/backend`  | `npm audit --omit=dev` / `npm audit`   |
| `/frontend` | `npm audit --omit=dev` / `npm audit`   |

`--omit=dev` is the number that matters: it is the tree that reaches a
deployed runtime. The full-tree number also covers build and test tooling,
which runs only on developer machines and CI.

## Result

| Project     | Production before | Production after | Full tree after |
| ----------- | ----------------- | ---------------- | --------------- |
| root        | 0                 | 0                | 0               |
| backend     | 10 (5 high)       | **0**            | **0**           |
| frontend    | 18 (12 high)      | **0**            | **0**           |

No production high-severity advisories remain in any project.

## What changed

### Removed CLI-only tooling from the frontend production tree

`shadcn` was listed in `dependencies`. It is a scaffolding CLI — it generates
component source into `src/` and is configured by `components.json`. Nothing in
`src/` imports it, so it has no runtime role, yet it pulled an entire
second server stack into the production graph (`@modelcontextprotocol/sdk`,
`express`, `undici`, `ts-morph`, `socks`). It accounted for **14 of the 18**
frontend production advisories on its own.

Moved to `devDependencies`, together with three build-time-only packages that
are referenced only by `vite.config.ts` and `index.css`:

- `shadcn` — scaffolding CLI
- `@tailwindcss/vite` — Vite plugin
- `vite-plugin-pwa` — Vite plugin
- `tailwindcss` — compiled at build time by `@tailwindcss/vite`

This is safe because nothing installs with `--omit=dev`: CI uses plain
`npm ci`, and Vercel installs devDependencies for builds by default. The
frontend build was re-run and verified to still emit Tailwind utilities
(230 KB of CSS) and a Workbox service worker.

### Patched reachable advisories

Applied via `npm audit fix` (no breaking changes):

| Package      | Project  | Why it mattered                                       |
| ------------ | -------- | ----------------------------------------------------- |
| `engine.io`  | backend  | High, DoS. Reachable — live match logging uses sockets |
| `multer`     | backend  | High, DoS via multipart parsing                        |
| `qs`         | backend  | Moderate, reachable through Express query parsing      |
| `js-yaml`    | backend  | High, exponential parse time                           |
| `dompurify`  | frontend | DOM XSS. Reachable — `jspdf` uses it for PDF export    |

### Pinned a patched transitive instead of taking a major bump

`@nestjs/swagger@11.4.6` pins `js-yaml` at exactly `5.2.1`. `npm audit fix
--force` wanted `@nestjs/swagger@12`, a breaking major. Instead, `backend/package.json`
carries a scoped override:

```json
"overrides": {
  "@nestjs/swagger": { "js-yaml": "5.4.3" }
}
```

`5.4.3` is outside the advisory range (`5.0.0`–`5.4.0`) and same-major, so the
API `@nestjs/swagger` relies on is unchanged. This matches the existing
`shell-quote` and `proxy-addr` overrides already in the repo.

## Follow-up remediation (10 October 2026)

The install reports contained 7 high frontend findings and 25 backend findings
(24 moderate, 1 critical). All four root causes are now resolved:

- Removed the shadcn scaffolding CLI from frontend devDependencies. Its glob
  dependency chain has no patched braces release. The frontend imports
  shadcn/tailwind.css, so the exact stylesheet from shadcn 4.17.0 and its MIT
  license are preserved in frontend/src/styles/vendor/ and imported locally.
  Existing components and components.json remain available. To scaffold a
  component, run npx shadcn@4.17.0 add <component> in frontend. This temporary
  CLI still carries the upstream advisory; it is outside normal installs.
- Required handlebars >=4.7.10 through a backend override to resolve the
  template JavaScript injection advisories, including critical findings.
- Scoped esbuild ^0.25.0 to @esbuild-kit/core-utils, removing vulnerable 0.18
  while retaining the current Drizzle Kit. The loader uses the transform API.
- Scoped js-yaml ^4.3.2 to @istanbuljs/load-nyc-config. The loader calls load,
  which remains supported in v4. This removes argparse v1 and sprintf-js from
  the Jest coverage chain. Other js-yaml consumers retain their own versions.

Lockfiles record these resolutions without the downgrades suggested by
npm audit fix --force. Retain overrides until upstream packages resolve the
advisories, and verify coverage and config loading when changing them.

Offline npm audit can misleadingly report zero findings. Run the registry audit
with --offline=false; an endpoint failure is not a passing audit.

## Re-running the audit

```bash
npm audit --offline=false
npm audit --omit=dev --offline=false  # run in each npm project
npm ls <package>         # trace which dependency pulls an advisory in
```

Treat a new **production** advisory as something to fix. For a dev-tree
advisory, first check whether the package is CLI or build-only tooling and
whether untrusted input can reach the vulnerable code path; record the
reasoning here rather than forcing a breaking upgrade.
