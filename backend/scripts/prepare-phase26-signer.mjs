import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrivateKey, createPublicKey, generateKeyPairSync, createHash, sign, verify } from 'node:crypto';
import { parse } from 'dotenv';

const root = fileURLToPath(new URL('../../', import.meta.url));
const secretPath = resolve(root, '.env.phase26-validation.local');
const kid = 'gaffer-phase25-validation-1';
// This file is ignored by the repository's existing .env.* rule. Never overwrite a signer.
let created = false;
if (!existsSync(secretPath)) {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 3072 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  writeFileSync(secretPath, `# Local validation signer only; endpoint/database must be pinned by the validation launcher.\nPOWERSYNC_KID=${kid}\nTWO_SIDED_LIVE_LOGGING_ENABLED=true\nPOWERSYNC_PRIVATE_KEY="${pem.replaceAll('\n', '\\n')}"\n`, { flag: 'wx', mode: 0o600 });
  created = true;
}
const env = parse(readFileSync(secretPath));
if (env.POWERSYNC_KID !== kid) throw new Error('STOP: existing validation KID differs');
const privateKey = createPrivateKey(env.POWERSYNC_PRIVATE_KEY.replace(/\\n/g, '\n'));
if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails.modulusLength < 3072) throw new Error('STOP: unexpected validation key');
const publicKey = createPublicKey(privateKey);
const { e, kty, n } = publicKey.export({ format: 'jwk' });
const jwks = { keys: [{ e, kty, n, kid, alg: 'RS256', use: 'sig' }] };
const challenge = Buffer.from('Phase 2.6 dedicated signer verification');
if (!verify('RSA-SHA256', challenge, publicKey, sign('RSA-SHA256', challenge, privateKey))) throw new Error('Signer verification failed');
const directory = resolve(root, 'docs/phase26-validation');
mkdirSync(directory, { recursive: true });
writeFileSync(resolve(directory, 'validation-public-jwks.json'), JSON.stringify(jwks, null, 2) + '\n');
const result = { capturedAt: new Date().toISOString(), created, secretFile: '.env.phase26-validation.local',
  scope: 'Prepared local signer; not installed in a running or hosted backend, not accepted by Cloud',
  kid, alg: 'RS256', kty, use: 'sig', modulusLength: privateKey.asymmetricKeyDetails.modulusLength,
  publicKeyFingerprintSha256: createHash('sha256').update(JSON.stringify({ e, kty, n })).digest('hex'),
  rfc7638Thumbprint: createHash('sha256').update(JSON.stringify({ e, kty, n })).digest('base64url'),
  signatureVerified: true, publicJwksUrl: null };
writeFileSync(resolve(directory, 'validation-signer.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
