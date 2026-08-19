// Jest's e2e run is CommonJS (via ts-jest), but `better-auth` ships as an
// ESM-only package (no CJS build/`require` export condition) — see
// node_modules/better-auth/package.json. `import`ing it from our
// CommonJS-compiled sources works fine at runtime (Nest's compiled output
// and ts-node both handle that interop), but Jest can't `require()` raw ESM.
// This Babel config, scoped to `test/` and wired up only for `.mjs` files in
// `jest-e2e.json`'s transform, rewrites better-auth's ESM to CommonJS before
// Jest loads it.
module.exports = {
  plugins: [
    '@babel/plugin-transform-modules-commonjs',
    // better-auth feature-detects Node's `async_hooks` via a dynamic
    // `import()` (see @better-auth/core/dist/async_hooks/index.mjs). Jest's
    // CJS runtime can't evaluate a real dynamic import without
    // `--experimental-vm-modules`, so rewrite it to `require()` instead.
    'dynamic-import-node',
  ],
};
