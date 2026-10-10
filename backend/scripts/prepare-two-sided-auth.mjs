import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey } from 'node:crypto';
import { parse } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../../', import.meta.url));
const directory = resolve(root, 'docs/phase-delivery-validation');
assert(!existsSync(resolve(directory, 'local-env-before.txt')), 'Existing backup: auth preparation has already run; do not overwrite it.');
const bytes = readFileSync(resolve(directory, 'cloud-before.json'));
const cloud = JSON.parse(bytes.toString(bytes[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, ''));
assert.equal(cloud.config.replication.connections[0].hostname, 'ep-blue-hill-b1j037cs.c-5.eu-central-1.aws.neon.tech');
const signer = parse(readFileSync(resolve(root, '.env.phase26-validation.local')));
const key = createPublicKey(createPrivateKey(signer.POWERSYNC_PRIVATE_KEY.replace(/\\n/g, '\n'))).export({ format: 'jwk' });
const jwk = { ...key, kid: signer.POWERSYNC_KID, alg: 'RS256', use: 'sig' };
cloud.config.client_auth.jwks ??= { keys: [] };
assert(!cloud.config.client_auth.jwks.keys.some(entry => entry.kid === jwk.kid));
cloud.config.client_auth.jwks.keys.push(jwk);
// Preserve the repository's documented YAML template; only add public trust.
const servicePath = resolve(root, 'powersync/service.yaml');
let service = readFileSync(servicePath, 'utf8');
if (service.trimStart().startsWith('{')) {
  writeFileSync(servicePath, JSON.stringify(cloud.config, null, 2) + '\n');
} else {
  assert(!/^  jwks:/m.test(service), 'Review existing inline keys before changing trust.');
  service = service.replace(/(  jwks_uri:.*)/, '$1\n  # Public RSA key for the authorized local Development backend.\n  jwks: ' + JSON.stringify({ keys: [jwk] }));
  writeFileSync(servicePath, service);
}
let env = readFileSync(resolve(root, '.env'), 'utf8');
writeFileSync(resolve(directory, 'local-env-before.txt'), env, { flag: 'wx' });
for (const [name, value] of Object.entries(signer)) {
  const line = name + '=' + JSON.stringify(value);
  const pattern = new RegExp('^' + name + '=.*$', 'm');
  env = pattern.test(env) ? env.replace(pattern, () => line) : env + '\n' + line;
}
writeFileSync(resolve(root, '.env'), env);
console.log(JSON.stringify({ publicKid: jwk.kid, hostedJwksRetained: cloud.config.client_auth.jwks_uri,
  streamsMatch: cloud.syncRules.replace(/\r\n/g, '\n') === readFileSync(resolve(root, 'powersync/sync-config.yaml'), 'utf8').replace(/\r\n/g, '\n') }));
