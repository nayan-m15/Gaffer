// Read-only reproduction of PowerSync's compiled parameter lookups and bucket budget.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import { neon } from '@neondatabase/serverless';
import * as sqlite from 'node:sqlite';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const cache = resolve(root, '.npm-cache/_npx');
const compiler = readdirSync(cache)
  .map((dir) =>
    resolve(cache, dir, 'node_modules/@powersync/service-sync-rules'),
  )
  .find(
    (dir) =>
      existsSync(resolve(dir, 'package.json')) &&
      JSON.parse(readFileSync(resolve(dir, 'package.json'))).version ===
        '0.37.0',
  );
if (!compiler)
  throw new Error(
    'Install PowerSync CLI 0.10.1 in the workspace npm cache to supply compiler 0.37.0',
  );
const {
  SqlSyncRules,
  DEFAULT_HYDRATION_STATE,
  nodeSqlite,
  RequestParameters,
  BaseJwtPayload,
} = await import(pathToFileURL(resolve(compiler, 'dist/index.js')));
config({ path: resolve(root, '.env'), quiet: true });
const sql = neon(process.env.DATABASE_URL);
const paths = process.argv.slice(2);
if (!paths.length) paths.push('powersync/sync-config.yaml');
const rules = paths.map((path) => {
  const parsed = SqlSyncRules.fromYaml(
    readFileSync(resolve(root, path), 'utf8'),
    { defaultSchema: 'public' },
  );
  if (parsed.errors.length) throw new Error(JSON.stringify(parsed.errors));
  return {
    path,
    config: parsed.config.hydrate({
      hydrationState: DEFAULT_HYDRATION_STATE,
      sqlite: nodeSqlite(sqlite),
    }),
  };
});
const tables = [
  ...new Set(
    rules.flatMap((r) => r.config.getSourceTables().map((t) => t.name)),
  ),
];
const loaded = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  ...tables.map((table) => {
    if (!/^\w+$/.test(table)) throw new Error('Unexpected table name');
    return tx.query(`SELECT * FROM "${table}"`);
  }),
]);
const data = new Map(tables.map((t, i) => [t, loaded[i + 1]]));
const coaches = await sql.query(
  "SELECT tm.team_id,tm.user_id,t.name FROM team_members tm JOIN teams t ON t.id=tm.team_id WHERE tm.role='coach' AND t.id IN ('4d33f355-5c40-4830-8a3c-6b84c2f991b9','c21b2ad0-4c84-4f62-9d31-dc2c4f8fadff')",
);
const encode = (value) =>
  JSON.stringify(value, (_key, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  );
for (const rule of rules) {
  const index = new Map();
  for (const [name, rows] of data)
    for (const input of rows) {
      const row = Object.fromEntries(
        Object.entries(input).map(([k, v]) => [
          k,
          typeof v === 'boolean'
            ? Number(v)
            : v instanceof Date
              ? v.toISOString()
              : v !== null && typeof v === 'object'
                ? JSON.stringify(v)
                : v,
        ]),
      );
      const seen = new Set();
      for (const result of rule.config.evaluateParameterRow(
        { connectionTag: 'default', schema: 'public', name },
        row,
      )) {
        const key = encode(result.lookup.values);
        const identity = key + encode(result.bucketParameters);
        if (seen.has(identity)) continue;
        seen.add(identity);
        const values = index.get(key) ?? [];
        values.push(...result.bucketParameters);
        index.set(key, values);
      }
    }
  for (const coach of coaches.flatMap((coach) => [
    { ...coach, mode: 'enabled', enabled: 'true' },
    { ...coach, mode: 'feature-disabled', enabled: 'false' },
    {
      ...coach,
      user_id: 'revoked-or-outsider',
      mode: 'outsider',
      enabled: 'true',
    },
  ])) {
    let parameterResults = 0;
    const perStream = {};
    const params = new RequestParameters(
      new BaseJwtPayload({
        sub: coach.user_id,
        user_id: coach.user_id,
        team_id: coach.team_id,
        two_sided_live_logging: coach.enabled,
      }),
      {},
    );
    const { querier, errors } = rule.config.getBucketParameterQuerier({
      globalParameters: params,
      hasDefaultStreams: true,
      streams: {},
    });
    if (errors.length) throw new Error(encode(errors));
    let buckets = [];
    let failure = null;
    try {
      buckets = await querier.queryDynamicBucketDescriptions({
        getParameterSets: async (lookups, definition) =>
          lookups.map((lookup) => {
            const rows = index.get(encode(lookup.values)) ?? [];
            parameterResults += rows.length;
            perStream[definition] = (perStream[definition] ?? 0) + rows.length;
            if (parameterResults > 10000 || lookups.length > 10000)
              throw new Error(
                'Parameter budget exceeds 10,000; stopped bounded reproduction',
              );
            return { lookup, rows };
          }),
      });
    } catch (error) {
      failure = error.message;
    }
    const allBuckets = [...querier.staticBuckets, ...buckets];
    const count = new Set(allBuckets.map((b) => b.bucket)).size;
    assert.equal(failure, null, 'Compiled parameter evaluation failed');
    assert.ok(
      count < 1000 && parameterResults < 1000,
      `Budget exceeded for ${coach.name}`,
    );
    if (coach.mode === 'outsider')
      assert.equal(count, 0, 'Revoked membership must receive no data');
    if (coach.mode === 'feature-disabled')
      assert.ok(
        allBuckets.every((b) => !b.definition.startsWith('shared_session_')),
        'Disabled feature must receive no shared data',
      );
    console.log(
      encode({
        rules: rule.path,
        team: coach.name,
        mode: coach.mode,
        buckets: count,
        parameterResults,
        perStream,
      }),
    );
  }
}
