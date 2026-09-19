import { generateKeyPairSync } from 'node:crypto';
import { SyncJwksController } from './sync-jwks.controller';

describe('SyncJwksController', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('publishes only the RSA public verification key', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.POWERSYNC_KID = 'production-key';
    process.env.POWERSYNC_PRIVATE_KEY = privateKey.export({
      type: 'pkcs8',
      format: 'pem',
    }) as string;
    const result = new SyncJwksController().keys();
    expect(result.keys[0]).toMatchObject({
      kid: 'production-key',
      alg: 'RS256',
      use: 'sig',
      kty: 'RSA',
    });
    expect(result.keys[0]).not.toHaveProperty('d');
  });
});
