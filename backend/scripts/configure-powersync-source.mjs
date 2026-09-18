import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: resolve(backendRoot, '..', '.env') });
const sql = neon(process.env.DATABASE_URL);

const [role] = await sql.query(
  `SELECT rolname, rolcanlogin, rolreplication
     FROM pg_roles
    WHERE rolname = 'powersync_role'`,
);
if (!role?.rolcanlogin || !role?.rolreplication) {
  throw new Error(
    'powersync_role must exist with LOGIN and REPLICATION before configuration.',
  );
}

await sql.transaction((tx) => [
  tx.query('GRANT USAGE ON SCHEMA public TO powersync_role'),
  tx.query(`GRANT SELECT ON TABLE
    public.match_events,
    public.match_event_reviews,
    public.match_projection_state,
    public.matches,
    public.events
    TO powersync_role`),
]);

const [publication] = await sql.query(
  `SELECT pubname FROM pg_publication WHERE pubname = 'powersync'`,
);
if (!publication) {
  await sql.query(`CREATE PUBLICATION powersync FOR TABLE
    public.match_events,
    public.match_event_reviews,
    public.match_projection_state,
    public.matches,
    public.events`);
} else {
  const published = await sql.query(
    `SELECT tablename
       FROM pg_publication_tables
      WHERE pubname = 'powersync'`,
  );
  const publishedNames = new Set(published.map(({ tablename }) => tablename));
  for (const table of [
    'match_events',
    'match_event_reviews',
    'match_projection_state',
    'matches',
    'events',
  ]) {
    if (!publishedNames.has(table)) {
      await sql.query(`ALTER PUBLICATION powersync ADD TABLE public.${table}`);
    }
  }
}

const [schema] = await sql.query(`
  SELECT
    to_regclass('public.match_event_observations') AS observations,
    to_regclass('public.match_event_memberships') AS memberships,
    to_regclass('public.match_event_reviews') AS reviews,
    to_regprocedure(
      'public.ingest_match_event_observation(uuid,uuid,uuid,text,match_event_type,match_event_team,uuid,text,uuid,text,integer,integer,text,jsonb,text,timestamp with time zone,boolean)'
    ) AS ingestion_function
`);
const published = await sql.query(
  `SELECT tablename
     FROM pg_publication_tables
    WHERE pubname = 'powersync'
    ORDER BY tablename`,
);
const [migration] = await sql.query(
  `SELECT hash, created_at
     FROM drizzle.__drizzle_migrations
    ORDER BY created_at DESC
    LIMIT 1`,
);

console.log(JSON.stringify({ schema, role, published, migration }, null, 2));
