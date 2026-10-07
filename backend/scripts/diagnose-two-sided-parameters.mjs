import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createSign, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = fileURLToPath(new URL('../../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const sql = neon(process.env.DATABASE_URL);
const [, rows] = await sql.transaction((tx) => [
  tx.query('SET TRANSACTION READ ONLY'),
  tx.query(`SELECT t.id,t.name,
    (SELECT count(*) FROM events e WHERE e.team_id=t.id)::int AS events,
    (SELECT count(*) FROM matches m JOIN events e ON e.id=m.event_id WHERE e.team_id=t.id)::int AS sheets,
    (SELECT count(*) FROM match_event_observations o JOIN matches m ON m.id=o.match_id JOIN events e ON e.id=m.event_id WHERE e.team_id=t.id)::int AS own_observations,
    (SELECT count(*) FROM match_events me WHERE me.event_type<>'injury' AND me.session_id IN (SELECT p.session_id FROM match_session_participants p WHERE p.team_id=t.id))::int AS session_public_events
    FROM teams t WHERE t.id IN (SELECT team_id FROM events WHERE competition_fixture_id='fd41392c-429f-42ee-80a3-f72af3195323')`),
]);
console.log(JSON.stringify(rows, null, 2));
if (process.argv.includes('--stream')) {
  const names = [
    ...readFileSync(
      resolve(root, 'powersync/sync-config.yaml'),
      'utf8',
    ).matchAll(/^  (\w+):\r?$/gm),
  ]
    .map((m) => m[1])
    .filter(
      (name) =>
        !process.argv.includes('--sample') ||
        name === 'shared_session_match_reviews' ||
        name === 'team_match_events',
    );
  for (const row of rows.filter(
    (row) => !process.argv.includes('--chelsea') || row.name === 'Chelsea FC',
  )) {
    const [member] = await sql.query(
      "SELECT user_id FROM team_members WHERE team_id=$1 AND role='coach' LIMIT 1",
      [row.id],
    );
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({
        alg: 'RS256',
        kid: process.env.POWERSYNC_KID,
        typ: 'JWT',
      }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: member.user_id,
        user_id: member.user_id,
        team_id: row.id,
        team_role: 'coach',
        aud: process.env.POWERSYNC_URL,
        iat: now,
        exp: now + 300,
        two_sided_live_logging: 'true',
      }),
    ).toString('base64url');
    const unsigned = `${header}.${payload}`;
    const token = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(process.env.POWERSYNC_PRIVATE_KEY.replace(/\\n/g, '\n'), 'base64url')}`;
    const probe = async (name) => {
      const controller = new AbortController();
      const response = await fetch(
        `${process.env.POWERSYNC_URL.replace(/\/$/, '')}/sync/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Token ${token}`,
            Accept: 'application/x-ndjson',
            'x-user-agent': 'powersync-js/1.38.8',
          },
          body: JSON.stringify({
            buckets: [],
            include_checksum: true,
            raw_data: true,
            client_id: randomUUID(),
            streams: {
              include_defaults: name === 'defaults',
              subscriptions:
                name === 'defaults'
                  ? []
                  : [{ stream: name, parameters: {}, override_priority: null }],
            },
          }),
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(20000),
          ]),
        },
      );
      const status = response.status;
      if (status === 200 && process.argv.includes('--checkpoint')) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let pending = '',
          bytes = 0,
          buckets = null;
        try {
          while (bytes < 10 * 1024 * 1024) {
            const { value, done } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            pending += decoder.decode(value, { stream: true });
            let end;
            while ((end = pending.indexOf('\n')) >= 0) {
              const line = pending.slice(0, end);
              pending = pending.slice(end + 1);
              if (!line.trim()) continue;
              const message = JSON.parse(line);
              if (message.checkpoint)
                buckets = message.checkpoint.buckets?.length ?? null;
              if (message.error)
                return {
                  team: row.name,
                  stream: name,
                  status,
                  error: { code: message.error.code },
                  checkpointComplete: false,
                };
              if (
                message.checkpoint_complete ||
                message.partial_checkpoint_complete
              ) {
                return {
                  team: row.name,
                  stream: name,
                  status,
                  error: null,
                  buckets,
                  checkpointComplete: true,
                };
              }
            }
          }
          return {
            team: row.name,
            stream: name,
            status,
            error: null,
            buckets,
            checkpointComplete: false,
          };
        } finally {
          controller.abort();
        }
      }
      const body = status === 200 ? '' : await response.text();
      let error = null;
      if (body) {
        try {
          error = JSON.parse(body);
        } catch {
          error = {
            nonJson: true,
            description: body.replaceAll(token, '[REDACTED]').slice(0, 180),
          };
        }
      }
      if (status === 200) controller.abort();
      return { team: row.name, stream: name, status, error };
    };
    const safeProbe = async (name) => {
      try {
        return await probe(name);
      } catch (error) {
        return { team: row.name, stream: name, error: error.name };
      }
    };
    if (!process.argv.includes('--only-each'))
      console.log(JSON.stringify(await safeProbe('defaults')));
    if (process.argv.includes('--each-stream')) {
      for (let i = 0; i < names.length; i += 4)
        console.log(
          JSON.stringify(
            await Promise.all(names.slice(i, i + 4).map(safeProbe)),
          ),
        );
    }
  }
}
