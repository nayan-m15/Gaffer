import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';
import { PublicDashboardService } from './../src/public-api/public-dashboard.service';

interface CatalogBody {
  success: boolean;
  count: number;
  data: Record<string, unknown>[];
}

interface ErrorBody {
  statusCode: number;
  message: string;
}

/**
 * Covers the externally accessible public API (`GET /v1/formations`,
 * `GET /v1/tactics`): no auth cookie is ever sent, matching how an outside
 * developer/assessor would call these endpoints.
 *
 * CORS is unit-tested separately in `../src/cors-config.spec.ts` — this
 * harness builds the Nest app straight from `AppModule` and never calls
 * `bootstrap()`/`app.enableCors`, so no CORS headers are present here.
 */
describe('Public API (e2e)', () => {
  let app: INestApplication<App>;
  const databaseService = {
    assertConnection: jest.fn().mockResolvedValue(undefined),
  };
  const publicDashboardService = {
    getFilters: jest.fn().mockResolvedValue({
      teams: [{ id: 'team-1', name: 'Gaffer FC' }],
      competitions: [],
      seasons: [],
    }),
    getMatches: jest.fn().mockResolvedValue([]),
    getPlayers: jest.fn().mockResolvedValue([]),
    getTeamStatistics: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(databaseService)
      .overrideProvider(PublicDashboardService)
      .useValue(publicDashboardService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('/v1/formations (GET)', () => {
    it('returns every formation with no auth required', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/formations')
        .expect(200);
      const body = response.body as CatalogBody;

      expect(body.success).toBe(true);
      expect(body.count).toBe(body.data.length);
      expect(body.data.length).toBeGreaterThan(0);
      for (const formation of body.data) {
        expect(Object.keys(formation).sort()).toEqual(
          ['description', 'id', 'name', 'shape'].sort(),
        );
      }
    });

    it('returns one formation when ?id= matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/formations?id=4-3-3')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        count: 1,
        data: [expect.objectContaining({ id: '4-3-3', name: '4-3-3' })],
      });
    });

    it('returns 404 with a clean JSON error for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/formations?id=unknown-formation')
        .expect(404);

      const body = response.body as ErrorBody;
      expect(body).toMatchObject({ statusCode: 404 });
      expect(typeof body.message).toBe('string');
    });

    it('returns 400 when ?id= is present but empty', async () => {
      await request(app.getHttpServer()).get('/v1/formations?id=').expect(400);
    });

    it('never leaks user, team or account fields', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/formations')
        .expect(200);

      const serialized = JSON.stringify(response.body).toLowerCase();
      for (const forbidden of [
        'email',
        'password',
        'token',
        'teamid',
        'userid',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });

  describe('/v1/tactics (GET)', () => {
    it('returns every tactic with no auth required', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/tactics')
        .expect(200);
      const body = response.body as CatalogBody;

      expect(body.success).toBe(true);
      expect(body.count).toBe(body.data.length);
      expect(body.data.length).toBeGreaterThan(0);
      for (const tactic of body.data) {
        expect(Object.keys(tactic).sort()).toEqual(
          ['category', 'description', 'formationId', 'id', 'name'].sort(),
        );
      }
    });

    it('returns one tactic when ?id= matches', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/tactics?id=possession')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        count: 1,
        data: [
          expect.objectContaining({ id: 'possession', category: 'offensive' }),
        ],
      });
    });

    it('returns 404 with a clean JSON error for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/tactics?id=unknown-tactic')
        .expect(404);

      expect(response.body as ErrorBody).toMatchObject({ statusCode: 404 });
    });
  });

  describe('/v1/public-dashboard (GET)', () => {
    it('returns dashboard filters with no auth cookie', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/public-dashboard/filters')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        data: {
          teams: [{ id: 'team-1', name: 'Gaffer FC' }],
          competitions: [],
          seasons: [],
        },
      });
    });

    it('validates public dashboard query parameters', async () => {
      await request(app.getHttpServer())
        .get('/v1/public-dashboard/matches?teamId=not-a-uuid')
        .expect(400);
    });

    it('does not expose account or private athlete fields', async () => {
      const response = await request(app.getHttpServer())
        .get('/v1/public-dashboard/filters')
        .expect(200);
      const serialized = JSON.stringify(response.body).toLowerCase();

      for (const forbidden of [
        'email',
        'password',
        'token',
        'userid',
        'dateofbirth',
        'notes',
      ]) {
        expect(serialized).not.toContain(forbidden);
      }
    });
  });
});
