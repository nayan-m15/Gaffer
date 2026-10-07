import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { configureSwagger } from './swagger-config';

@Controller('v1/formations')
class FixtureController {
  @Get()
  getFormations() {
    return { success: true, data: [] };
  }
}

// Each case boots a real Nest app and makes several HTTP requests; the first
// one also pays for cold module loading, which can exceed Jest's 5s default
// while the rest of the unit suite runs in parallel.
jest.setTimeout(30_000);

describe('Swagger exposure policy (HARD-002)', () => {
  let app: INestApplication;

  async function createApp(nodeEnv: string | undefined) {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: nodeEnv });
    const module = await Test.createTestingModule({
      controllers: [FixtureController],
    }).compile();
    app = module.createNestApplication();
    configureSwagger(app);
    await app.init();
    return app.getHttpServer() as Server;
  }

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it.each(['production', 'staging', 'test', undefined, '', 'Development'])(
    'serves no Swagger UI, assets or schemas when NODE_ENV=%s',
    async (nodeEnv) => {
      const server = await createApp(nodeEnv);
      for (const path of [
        '/api/docs',
        '/api/docs/',
        '/api/docs/swagger-ui-init.js',
        '/api/docs-json',
        '/api/docs-yaml',
      ]) {
        await request(server).get(path).expect(404);
      }
      await request(server)
        .get('/v1/formations')
        .expect(200)
        .expect({ success: true, data: [] });
    },
  );

  it('keeps the interactive UI and schemas available in development', async () => {
    const server = await createApp('development');
    await request(server)
      .get('/api/docs')
      .expect(200)
      .expect(/Swagger UI/);
    await request(server)
      .get('/api/docs/swagger-ui-init.js')
      .expect(200)
      .expect(/SwaggerUIBundle/);
    await request(server)
      .get('/api/docs-json')
      .expect(200)
      .expect(/Sport Coaching Tool API/)
      .expect(/\/v1\/formations/);
    await request(server)
      .get('/api/docs-yaml')
      .expect(200)
      .expect(/Sport Coaching Tool API/);
  });
});
