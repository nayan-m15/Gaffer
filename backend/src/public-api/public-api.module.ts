import { Module } from '@nestjs/common';
import { FormationsController } from './formations.controller';
import { TacticsController } from './tactics.controller';
import { PublicApiService } from './public-api.service';

/**
 * Externally accessible, unauthenticated GET-only API (`/v1/formations`,
 * `/v1/tactics`) exposing safe, shared coaching reference data. Deliberately
 * has no dependency on `AuthModule`, `TeamsModule`, or `DatabaseModule` —
 * see `public-api.service.ts`.
 */
@Module({
  controllers: [FormationsController, TacticsController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
