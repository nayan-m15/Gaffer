import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...parse(readFileSync(resolve(root, '.env'))), ...process.env };
const hash = (value) => createHash('sha256').update(value).digest('hex');
const safeUrl = (value) => {
  if (!value) return null;
  const url = new URL(value);
  return { origin: url.origin, hostname: url.hostname, pathname: url.pathname };
};
const streams = readFileSync(resolve(root, 'powersync/sync-config.yaml'));
const text = streams.toString();
const headers = [...text.matchAll(/^ {2}(\w+):\r?$/gm)];
const blocks = headers.map((match, index) => [match[0], match[1], text.slice(match.index + match[0].length, headers[index + 1]?.index ?? text.length)]);
const result = {
  capturedAt: new Date().toISOString(),
  scope: 'Configured files plus inherited environment; not attestation of a running backend or deployed Cloud state',
  backend: {
    nodeEnv: env.NODE_ENV ?? 'unset',
    authUrl: safeUrl(env.BETTER_AUTH_URL),
    frontendUrl: safeUrl(env.FRONTEND_URL),
    apiUrl: safeUrl(env.VITE_API_URL),
    deployment: env.VITE_DEPLOYMENT_ENV ?? 'unset',
    twoSidedLiveLogging: env.TWO_SIDED_LIVE_LOGGING_ENABLED ?? 'unset',
    algorithm: env.POWERSYNC_PRIVATE_KEY ? 'RS256' : env.POWERSYNC_SHARED_SECRET ? 'HS256' : 'unconfigured',
    kid: env.POWERSYNC_KID ?? null,
    issuer: null,
    audience: env.POWERSYNC_URL ?? null,
    endpoint: safeUrl(env.POWERSYNC_URL),
    frontendEndpoint: safeUrl(env.VITE_POWERSYNC_URL),
    rsaPrivateKeyPresent: Boolean(env.POWERSYNC_PRIVATE_KEY),
    hmacSecretPresent: Boolean(env.POWERSYNC_SHARED_SECRET),
    applicationDatabase: safeUrl(env.DATABASE_URL),
    testDatabase: safeUrl(env.TEST_DATABASE_URL),
  },
  managementCredentialPresence: Object.keys(env).filter((key) => /^(PS_|POWERSYNC_)/.test(key)).map((name) => ({ name, present: Boolean(env[name]) })),
  repositoryConfig: {
    sha256: hash(streams),
    streamCount: blocks.length,
    streams: blocks.map(([, name, body]) => ({
      name,
      featureFlag: body.includes("auth.parameter('two_sided_live_logging') = 'true'"),
      liveMembership: body.includes("team_members.user_id = auth.parameter('user_id')"),
      excludesInjury: body.includes("event_type <> 'injury'"),
      fields: body.split('SELECT')[1]?.split('FROM')[0]?.trim(),
    })),
  },
  templates: [],
};
for (const directory of ['powersync', 'powersync-recovery']) {
  const service = readFileSync(resolve(root, directory, 'service.yaml'), 'utf8');
  const linkPath = resolve(root, directory, 'cli.yaml');
  // Only known public IDs are extracted; arbitrary link/secret contents never leave disk.
  const link = existsSync(linkPath) ? readFileSync(linkPath, 'utf8') : '';
  result.templates.push({
    directory,
    name: service.match(/^name:\s*(.+)$/m)?.[1],
    jwksUri: service.match(/^\s*jwks_uri:\s*(https:\/\/\S+)/m)?.[1],
    sourceHostname: service.match(/^\s*hostname:\s*(\S+)/m)?.[1],
    additionalAudiences: service.match(/^\s*additional_audiences:\s*(.+)$/m)?.[1],
    linkPresent: Boolean(link),
    linkIds: [...link.matchAll(/^\s*(\w*(?:instance|project|org)\w*):\s*([a-f0-9]{24})\s*$/gim)].map(([, field, value]) => ({ field, value })),
    syncConfigSha256: hash(readFileSync(resolve(root, directory, 'sync-config.yaml'))),
  });
}
const uri = result.templates[0].jwksUri;
try {
  const response = await fetch(uri, { signal: AbortSignal.timeout(20000) });
  result.publicJwks = { uri, httpStatus: response.status };
  if (response.ok) {
    const body = await response.json();
    result.publicJwks.keys = body.keys.map(({ kid, alg, kty, use, e, n }) => ({ kid, alg, kty, use, fingerprint: hash(JSON.stringify({ e, kty, n })) }));
  }
} catch (error) {
  result.publicJwks = { uri, networkError: { name: error.name, code: error.cause?.code ?? null } };
}
const directory = resolve(root, 'docs/phase25-validation');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'environment.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, repositoryConfig: { sha256: result.repositoryConfig.sha256, streamCount: blocks.length, sharedStreams: result.repositoryConfig.streams.filter(({ name }) => name.startsWith('shared_')).map(({ fields, ...rest }) => rest) } }, null, 2));
