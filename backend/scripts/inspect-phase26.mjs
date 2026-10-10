import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';
import { neon } from '@neondatabase/serverless';

// Read-only inspection. Never fall back to the root application database.
const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...parse(readFileSync(resolve(root, '.env'))), ...process.env };
const expected = {
  host: 'ep-royal-star-b253pvlk-pooler.c-6.eu-central-1.aws.neon.tech',
  branch: 'br-misty-moon-b2be9vmt',
  endpoint: 'ep-royal-star-b253pvlk',
  database: 'neondb',
};
const target = new URL(env.TEST_DATABASE_URL);
if (target.hostname !== expected.host || target.pathname !== '/neondb') {
  throw new Error('STOP: validation database URL does not match authorized endpoint');
}
const sql = neon(target.toString(), { fetchOptions: { signal: AbortSignal.timeout(30000) } });
const [identity] = await sql.query(`SELECT current_database() AS database,
  current_setting('neon.branch_id') AS branch,
  current_setting('neon.endpoint_id') AS endpoint,
  current_setting('server_version') AS version, current_user AS connected_role`);
if (['database', 'branch', 'endpoint'].some((name) => identity[name] !== expected[name])) {
  throw new Error('STOP: server validation database identity mismatch');
}
const streamBytes = readFileSync(resolve(root, 'powersync/sync-config.yaml'));
const streamText = streamBytes.toString();
const directTarget = new URL(target);
directTarget.hostname = target.hostname.replace('-pooler.', '.');
const directSql = neon(directTarget.toString(), { fetchOptions: { signal: AbortSignal.timeout(30000) } });
const [directIdentity] = await directSql.query(`SELECT current_database() AS database,
  current_setting('neon.branch_id') AS branch, current_setting('neon.endpoint_id') AS endpoint`);
if (['database', 'branch', 'endpoint'].some((name) => directIdentity[name] !== expected[name])) {
  throw new Error('STOP: direct endpoint identity mismatch');
}
const streams = [...streamText.matchAll(/^  (\w+):\r?$/gm)].map((match) => match[1]);
const tables = [...new Set([...streamText.matchAll(/\b(?:FROM|JOIN)\s+(\w+)/gi)].map((match) => match[1]))].sort();
const results = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query("SELECT name, setting FROM pg_settings WHERE name IN ('wal_level','max_replication_slots','max_wal_senders') ORDER BY name"),
  tx.query("SELECT rolname, rolcanlogin, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'powersync_role'"),
  tx.query("SELECT pubname, puballtables, pubinsert, pubupdate, pubdelete, pubtruncate FROM pg_publication ORDER BY pubname"),
  tx.query("SELECT pubname, schemaname, tablename FROM pg_publication_tables ORDER BY pubname, schemaname, tablename"),
  tx.query(`SELECT c.relname AS table_name, c.relreplident AS replica_identity,
    EXISTS(SELECT 1 FROM pg_index i WHERE i.indrelid=c.oid AND i.indisprimary) AS has_primary_key
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`),
  tx.query(`SELECT slot_name, plugin, slot_type, database, active, temporary, wal_status,
    confirmed_flush_lsn IS NOT NULL AS has_confirmed_flush_lsn,
    CASE WHEN restart_lsn IS NOT NULL THEN pg_wal_lsn_diff(pg_current_wal_lsn(),restart_lsn)::text END AS retained_wal_bytes,
    CASE WHEN confirmed_flush_lsn IS NOT NULL THEN pg_wal_lsn_diff(pg_current_wal_lsn(),confirmed_flush_lsn)::text END AS unconfirmed_wal_bytes
    FROM pg_replication_slots ORDER BY slot_name`),
]);
const [, settings, roles, publications, published, replicaIdentity, slots] = results;
let grants = null;
if (roles.length) {
  grants = await sql.query(`SELECT c.relname AS table_name,
    has_table_privilege('powersync_role', c.oid, 'SELECT') AS can_select,
    has_schema_privilege('powersync_role','public','USAGE') AS schema_usage
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`);
}
const result = {
  capturedAt: new Date().toISOString(), readOnly: true,
  configuredSigner: { alg: env.POWERSYNC_PRIVATE_KEY ? 'RS256' : 'HS256', kid: env.POWERSYNC_KID, audience: env.POWERSYNC_URL },
  database: { configuredHost: target.hostname, unpooledHost: directTarget.hostname, directIdentity,
    directProbeTransport: 'Neon HTTPS SQL, not a logical replication connection', identity, settings, roles, publications, published, replicaIdentity, slots, grants },
  syncConfig: { path: 'powersync/sync-config.yaml', sha256: createHash('sha256').update(streamBytes).digest('hex'),
    lfNormalizedSha256: createHash('sha256').update(streamText.replaceAll('\r\n', '\n')).digest('hex'), streams, sourceTables: tables,
    missingPublishedTables: tables.filter((table) => !published.some((row) => row.pubname === 'powersync' && row.schemaname === 'public' && row.tablename === table)),
    missingSelectGrants: tables.filter((table) => !grants?.some((row) => row.table_name === table && row.can_select && row.schema_usage)) },
};
const directory = resolve(root, 'docs/phase26-validation');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'preflight.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
