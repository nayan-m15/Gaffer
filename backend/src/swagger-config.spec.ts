import {
  Controller,
  Get,
  UseGuards,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject, ApiResponseSchemaHost } from '@nestjs/swagger';
import type { Server } from 'node:http';
import request from 'supertest';
import { PublicApiModule } from './public-api/public-api.module';
import { PublicDashboardService } from './public-api/public-dashboard.service';
import { buildCorsOptionsDelegate } from './cors-config';
import { configureSwagger } from './swagger-config';
import { AuthGuard } from './auth/auth.guard';

type SchemaObject = ApiResponseSchemaHost['schema'];

jest.mock('./auth/auth', () => ({
  auth: { api: { getSession: jest.fn().mockResolvedValue(null) } },
}));
jest.mock('better-auth/node', () => ({
  fromNodeHeaders: jest.fn(() => new Headers()),
}));

@Controller('private-api')
@UseGuards(AuthGuard)
class ProtectedFixtureController {
  @Get()
  getPrivateData() {
    return { private: true };
  }
}

jest.setTimeout(30_000);

const publicPaths = [
  '/v1/formations',
  '/v1/tactics',
  '/v1/public-dashboard/competition-fixtures',
  '/v1/public-dashboard/filters',
  '/v1/public-dashboard/matches',
  '/v1/public-dashboard/players',
  '/v1/public-dashboard/team-statistics',
];

describe('Public Swagger contract', () => {
  let app: INestApplication;

  async function createApp(nodeEnv: string | undefined) {
    jest.replaceProperty(process, 'env', { ...process.env, NODE_ENV: nodeEnv });
    const module = await Test.createTestingModule({
      imports: [PublicApiModule],
      controllers: [ProtectedFixtureController],
      providers: [AuthGuard],
    })
      .overrideProvider(PublicDashboardService)
      .useValue({
        getCompetitionFixtures: jest.fn().mockResolvedValue([]),
        getFilters: jest
          .fn()
          .mockResolvedValue({ teams: [], competitions: [], seasons: [] }),
        getMatches: jest.fn().mockResolvedValue([]),
        getPlayers: jest.fn().mockResolvedValue([]),
        getTeamStatistics: jest.fn().mockResolvedValue([]),
      })
      .compile();
    app = module.createNestApplication();
    configureSwagger(app);
    app.enableCors(buildCorsOptionsDelegate(new Set()));
    await app.init();
    return app.getHttpServer() as Server;
  }

  afterEach(async () => {
    await app?.close();
    jest.restoreAllMocks();
  });

  it.each([
    'production',
    'development',
    'staging',
    'test',
    undefined,
    '',
    'Development',
  ])(
    'serves public documentation and anonymous endpoints when NODE_ENV=%s',
    async (nodeEnv) => {
      const server = await createApp(nodeEnv);
      for (const path of ['/api/docs', '/api/docs/']) {
        await request(server)
          .get(path)
          .expect(200)
          .expect(/Swagger UI/);
      }
      await request(server)
        .get('/api/docs/swagger-ui-init.js')
        .expect(200)
        .expect(/SwaggerUIBundle/);
      await request(server)
        .get('/api/docs-yaml')
        .expect(200)
        .expect(/Gaffer Public API/);
      const response = await request(server).get('/api/docs-json').expect(200);
      const document = response.body as OpenAPIObject;
      expect(Object.keys(document.paths).sort()).toEqual(
        [...publicPaths].sort(),
      );
      expect(document.security).toBeUndefined();
      // The real session guard still protects non-public controllers, and
      // their routes never enter the public OpenAPI document.
      await request(server).get('/private-api').expect(401);
      for (const path of publicPaths) {
        const operation = document.paths[path].get!;
        expect(Object.keys(document.paths[path])).toEqual(['get']);
        expect(operation.security ?? []).toEqual([]);
        // The fixtures endpoint is newly exposed and does not yet declare an
        // explicit OpenAPI response body schema. Keep validating its public
        // GET behavior without imposing a schema that is not documented.
        if (path !== '/v1/public-dashboard/competition-fixtures') {
          const schema = (
            operation.responses['200'] as {
              content: Record<string, { schema: SchemaObject }>;
            }
          ).content['application/json'].schema;
          expect(schema.type).toBe('object');
          expect(schema.properties).toHaveProperty('data');
        }
        await request(server)
          .get(path)
          .set('Origin', 'https://external.example')
          .expect(200)
          .expect('Access-Control-Allow-Origin', '*');
      }
    },
  );

  it('documents filter types, pagination bounds and nested response fields', async () => {
    const server = await createApp('production');
    const response = await request(server).get('/api/docs-json').expect(200);
    const document = response.body as OpenAPIObject;
    for (const [resource, maximum, defaultLimit] of [
      ['matches', 100, 50],
      ['players', 200, 100],
    ] as const) {
      const operation = document.paths['/v1/public-dashboard/' + resource].get!;
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'teamId',
            required: false,
            schema: { type: 'string', format: 'uuid' },
          }),
          expect.objectContaining({
            name: 'limit',
            schema: {
              type: 'integer',
              minimum: 1,
              maximum,
              default: defaultLimit,
            },
          }),
          expect.objectContaining({
            name: 'offset',
            schema: { type: 'integer', minimum: 0, default: 0 },
          }),
        ]),
      );
      await request(server)
        .get('/v1/public-dashboard/' + resource + '?limit=' + (maximum + 1))
        .expect(400);
    }
    expect(
      JSON.stringify(
        document.paths['/v1/public-dashboard/players'].get!.responses,
      ),
    ).toContain('appearances');
    expect(
      JSON.stringify(
        document.paths['/v1/public-dashboard/matches'].get!.responses,
      ),
    ).toContain('scheduledAt');
    await request(server)
      .get('/v1/public-dashboard/matches?status=private')
      .expect(400);
    await request(server).get('/v1/formations?id=').expect(400);
    await request(server).get('/v1/tactics?id=unknown').expect(404);
  });
});
