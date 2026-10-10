import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey, createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../', import.meta.url));
const env = { ...parse(readFileSync(resolve(root, '.env'))), ...process.env };
const result = {
  capturedAt: new Date().toISOString(),
  kid: env.POWERSYNC_KID,
  algorithm: env.POWERSYNC_PRIVATE_KEY
    ? 'RS256'
    : env.POWERSYNC_SHARED_SECRET
      ? 'HS256'
      : 'unconfigured',
  endpoint: env.POWERSYNC_URL,
  issuer: null,
  audience: env.POWERSYNC_URL,
  testHost: env.TEST_DATABASE_URL
    ? new URL(env.TEST_DATABASE_URL).hostname
    : null,
  appHost: env.DATABASE_URL ? new URL(env.DATABASE_URL).hostname : null,
  cloudCredentialNames: Object.keys(env)
    .filter((k) => /POWERSYNC/.test(k))
    .map((name) => ({ name, present: !!env[name] })),
};
if (env.POWERSYNC_PRIVATE_KEY) {
  const jwk = createPublicKey(
    createPrivateKey(env.POWERSYNC_PRIVATE_KEY.replace(/\\n/g, '\n')),
  ).export({ format: 'jwk' });
  result.localPublicKeyFingerprint = createHash('sha256')
    .update(JSON.stringify({ e: jwk.e, kty: jwk.kty, n: jwk.n }))
    .digest('hex');
}
const service = readFileSync(resolve(root, 'powersync/service.yaml'), 'utf8');
const uri = service.match(/jwks_uri:\s*(https:\/\/\S+)/)?.[1];
result.repositoryJwksUri = uri;
try {
  const response = await fetch(uri, { signal: AbortSignal.timeout(45000) });
  result.jwksHttpStatus = response.status;
  if (response.ok) {
    const body = await response.json();
    result.publicKeys = body.keys.map(({ kid, alg, kty, use, e, n }) => ({
      kid,
      alg,
      kty,
      use,
      fingerprint: createHash('sha256')
        .update(JSON.stringify({ e, kty, n }))
        .digest('hex'),
    }));
    result.kidPresent = result.publicKeys.some((key) => key.kid === result.kid);
    result.localPublicKeyMatches = result.publicKeys.some(
      (key) =>
        key.kid === result.kid &&
        key.fingerprint === result.localPublicKeyFingerprint,
    );
  }
} catch (error) {
  result.jwksNetworkError = {
    name: error.name,
    code: error.cause?.code ?? null,
  };
}
mkdirSync(resolve(root, 'docs/phase2-validation'), { recursive: true });
writeFileSync(
  resolve(root, 'docs/phase2-validation/auth-key-diagnosis.json'),
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result, null, 2));
