# Dependency Security Policy (SEC-011)

How this repository decides which dependency advisories to fix, which to accept,
and what evidence to record. Audited 8 October 2026.

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
| backend     | 10 (5 high)       | 4 moderate       | 24 moderate     |
| frontend    | 18 (12 high)      | **0**            | 7 high          |

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

## Accepted advisories

### `esbuild` ≤0.24.2 via `drizzle-kit` — 4 moderate, backend

```
drizzle-kit@0.31.10 → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild
```

**Not fixed, deliberately.** Three reasons:

1. **Not reachable.** [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99)
   affects esbuild's **development server** (`esbuild serve`), which lets any
   website send requests to it and read the response. `drizzle-kit` never
   starts that server; it uses esbuild to transpile `drizzle.config.ts` for
   the `db:generate` / `db:migrate:kit` CLI commands.
2. **It is a devDependency.** It appears in `--omit=dev` output only because
   `better-auth` declares `drizzle-kit` as an *optional peer dependency*,
   which makes npm walk the edge from a production package. It is not
   installed or executed by a deployed runtime.
3. **The "fix" is worse.** `npm audit fix --force` installs `drizzle-kit@0.18.1`
   — a 13-minor downgrade that would break the migration tooling this project
   depends on. `@esbuild-kit/*` is deprecated and pins `esbuild ~0.18.20`, so
   no in-range patch exists.

Revisit when `drizzle-kit` drops `@esbuild-kit/*` in favour of `tsx`.

### `braces` / `micromatch` / `fast-glob` via `shadcn` — 7 high, frontend dev tree

These moved out of production and into the dev tree with `shadcn` itself. The
only offered fix is `shadcn@1.0.0`, a breaking downgrade of a tool the project
uses at version 4. The advisory is a stack-exhaustion DoS triggered by deeply
nested glob patterns, which here means a developer's own
`components.json` globs on their own machine. No untrusted input reaches it.

If the team would rather carry zero dev advisories, `shadcn` can be dropped
from `devDependencies` entirely and invoked as `npx shadcn@latest add <component>`,
which is what the upstream shadcn/ui docs recommend. That is a workflow
change, so it is left as a team decision rather than made here.

### `sprintf-js` via `ts-jest` — moderate, backend dev tree

```
ts-jest → @jest/transform → babel-plugin-istanbul → @istanbuljs/load-nyc-config → js-yaml@3 → argparse → sprintf-js
```

Jest coverage tooling only; never runs outside CI and local test runs. No fix
exists that does not require the upstream Jest chain to update.

## Re-running the audit

```bash
npm audit --omit=dev     # run in /, /backend and /frontend separately
npm ls <package>         # trace which dependency pulls an advisory in
```

Treat a new **production** advisory as something to fix. For a dev-tree
advisory, first check whether the package is CLI or build-only tooling and
whether untrusted input can reach the vulnerable code path; record the
reasoning here rather than forcing a breaking upgrade.
