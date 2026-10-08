import { Module } from '@nestjs/common';
import { FormationsController } from './formations.controller';
import { TacticsController } from './tactics.controller';
import { PublicApiService } from './public-api.service';
import { PublicDashboardCacheService } from './public-dashboard-cache.service';
import { PublicDashboardController } from './public-dashboard.controller';
import { PublicDashboardRateLimitGuard } from './public-dashboard-rate-limit.guard';
import { PublicDashboardRateLimitService } from './public-dashboard-rate-limit.service';
import { PublicDashboardService } from './public-dashboard.service';

/**
 * Externally accessible, unauthenticated GET-only API (`/v1/formations`,
 * `/v1/tactics`) exposing safe, shared coaching reference data. Deliberately
 * has no dependency on `AuthModule`, `TeamsModule`, or `DatabaseModule` —
 * see `public-api.service.ts`.
 *
 * `/v1/public-dashboard` is the exception: it reads team data from the
 * database, so its routes are rate limited per caller and served through a
 * short-lived response cache (SEC-008). Both hold state in memory, so they
 * are registered here as module-scoped singletons — one set of counters and
 * one cache per instance, shared by every request the instance handles.
 */
@Module({
  controllers: [
    FormationsController,
    TacticsController,
    PublicDashboardController,
  ],
  providers: [
    PublicApiService,
    PublicDashboardService,
    PublicDashboardCacheService,
    PublicDashboardRateLimitService,
    PublicDashboardRateLimitGuard,
  ],
})
export class PublicApiModule {}
