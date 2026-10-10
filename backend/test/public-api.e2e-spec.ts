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
    getMatchSummary: jest.fn().mockResolvedValue({ total: 0, cleanSheets: 0 }),
    getPlayers: jest.fn().mockResolvedValue([]),
    getTeamStatistics: jest.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
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

    // `clearAllMocks` drops the implementations above, and a fresh app per
    // test also means a fresh cache and a fresh rate-limit window.
    publicDashboardService.getFilters.mockResolvedValue({
      teams: [{ id: 'team-1', name: 'Gaffer FC' }],
      competitions: [],
      seasons: [],
    });
    publicDashboardService.getMatches.mockResolvedValue([]);
    publicDashboardService.getPlayers.mockResolvedValue([]);
    publicDashboardService.getTeamStatistics.mockResolvedValue([]);
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
          ['description', 'id', 'name', 'playerCount', 'shape'].sort(),
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

    it('rejects a player page above the public cap (SEC-008)', async () => {
      await request(app.getHttpServer())
        .get('/v1/public-dashboard/players?limit=500')
        .expect(400);
      await request(app.getHttpServer())
        .get('/v1/public-dashboard/players?limit=200')
        .expect(200);
    });

    it('serves a repeated identical request from cache (SEC-008)', async () => {
      const url = '/v1/public-dashboard/players?limit=100';

      const first = await request(app.getHttpServer()).get(url).expect(200);
      const second = await request(app.getHttpServer()).get(url).expect(200);

      expect(second.body).toEqual(first.body);
      expect(publicDashboardService.getPlayers).toHaveBeenCalledTimes(1);
    });

    it('still queries separately for a different filter (SEC-008)', async () => {
      await request(app.getHttpServer())
        .get('/v1/public-dashboard/matches?limit=10')
        .expect(200);
      await request(app.getHttpServer())
        .get('/v1/public-dashboard/matches?limit=20')
        .expect(200);

      expect(publicDashboardService.getMatches).toHaveBeenCalledTimes(2);
    });

    it('rate limits an anonymous flood with 429 (SEC-008)', async () => {
      process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '3:60';
      try {
        const url = '/v1/public-dashboard/filters';
        for (let attempt = 0; attempt < 3; attempt += 1) {
          await request(app.getHttpServer()).get(url).expect(200);
        }

        const rejected = await request(app.getHttpServer())
          .get(url)
          .expect(429);
        expect((rejected.body as ErrorBody).message).toBe(
          'Too many requests. Please try again later.',
        );
      } finally {
        delete process.env.PUBLIC_DASHBOARD_RATE_LIMIT;
      }
    });

    it('rejects a flood before it reaches query validation (SEC-008)', async () => {
      process.env.PUBLIC_DASHBOARD_RATE_LIMIT = '1:60';
      try {
        await request(app.getHttpServer())
          .get('/v1/public-dashboard/filters')
          .expect(200);

        // A malformed query would normally be a 400; the guard runs first.
        await request(app.getHttpServer())
          .get('/v1/public-dashboard/matches?teamId=not-a-uuid')
          .expect(429);
      } finally {
        delete process.env.PUBLIC_DASHBOARD_RATE_LIMIT;
      }
    });
  });
});
