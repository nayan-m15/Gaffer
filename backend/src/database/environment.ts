import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Walks up from `startDir` until it finds a directory containing a
 * `package.json` — i.e. `backend/` itself, regardless of how deep this file
 * lives under it (`src/database/` when run from source, `dist/src/database/`
 * once compiled). Falls back to `startDir` if nothing is found.
 */
function findBackendRoot(startDir: string): string {
  let dir = startDir;
  while (!existsSync(join(dir, 'package.json'))) {
    const parent = dirname(dir);
    if (parent === dir) {
      return startDir;
    }
    dir = parent;
  }
  return dir;
}

// Deliberately not `process.cwd()`-based: `npm --prefix backend run <script>`
// (what the root-level `npm run dev` actually does) runs with cwd still at
// the repo root, not `backend/`, so a cwd-relative path resolves wrong
// depending on how the app was launched. Walking up from `__dirname` to the
// `backend/` package root is correct no matter the invocation method or
// whether this is running from source or from the compiled `dist` output.
const backendRoot = findBackendRoot(__dirname);
config({ path: resolve(backendRoot, '..', '.env') });
