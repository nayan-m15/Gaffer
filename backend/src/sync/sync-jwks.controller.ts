import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { createPrivateKey, createPublicKey } from 'node:crypto';

/** Public verification material for production PowerSync authentication. */
@Controller('sync')
export class SyncJwksController {
  @Get('jwks')
  keys() {
    const kid = process.env.POWERSYNC_KID;
    const privatePem = process.env.POWERSYNC_PRIVATE_KEY?.replace(/\\n/g, '\n');
    if (!kid || !privatePem) {
      throw new ServiceUnavailableException(
        'PowerSync JWKS is not configured.',
      );
    }
    const privateKey = createPrivateKey(privatePem);
    const publicKey = createPublicKey(privateKey).export({ format: 'jwk' });
    return {
      keys: [{ ...publicKey, kid, alg: 'RS256', use: 'sig' }],
    };
  }
}
