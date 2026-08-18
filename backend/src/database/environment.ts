import { config } from 'dotenv';
import { resolve } from 'node:path';

// Resolved from `process.cwd()` (always `backend/`, since every npm script
// that runs this app does so from that directory) rather than `__dirname`:
// the compiled output nests an extra `dist/src/...` level compared to
// `src/...`, so a `__dirname`-relative path lands in the wrong place
// depending on whether the app is run from source or from `dist`.
config({ path: resolve(process.cwd(), '..', '.env') });
