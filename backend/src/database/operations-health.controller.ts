import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { DatabaseService } from './database.service';

@Controller('health')
export class OperationsHealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  @Get('operations')
  async operations(@Headers('authorization') authorization?: string) {
    this.authorise(authorization);
    const database = this.databaseService.database;
    const [uploadsResult, clientsResult, reviewsResult, projectionsResult] =
      await Promise.all([
        database.execute<{
          uploads_24h: number;
          rejected_24h: number;
          dependency_pending_24h: number;
          average_processing_ms: number | null;
          p95_processing_ms: number | null;
        }>(sql`
          SELECT
            count(*)::int AS uploads_24h,
            count(*) FILTER (WHERE outcome = 'rejected')::int AS rejected_24h,
            count(*) FILTER (WHERE outcome = 'dependency_pending')::int
              AS dependency_pending_24h,
            avg(processing_duration_ms)::float AS average_processing_ms,
            percentile_cont(0.95) WITHIN GROUP (
              ORDER BY processing_duration_ms
            )::float AS p95_processing_ms
          FROM sync_upload_receipts
          WHERE created_at >= now() - interval '24 hours'
        `),
        database.execute<{
          reporting_devices: number;
          pending_items: number;
          rejected_items: number;
          oldest_pending_at: Date | null;
          oldest_pending_age_seconds: number | null;
          stalest_report_at: Date | null;
        }>(sql`
          SELECT
            count(*)::int AS reporting_devices,
            coalesce(sum(pending_count), 0)::int AS pending_items,
            coalesce(sum(rejected_count), 0)::int AS rejected_items,
            min(oldest_pending_at) AS oldest_pending_at,
            extract(epoch from (now() - min(oldest_pending_at)))::int
              AS oldest_pending_age_seconds,
            min(updated_at) AS stalest_report_at
          FROM sync_client_telemetry
          WHERE updated_at >= now() - interval '7 days'
        `),
        database.execute<{ unresolved_reviews: number }>(sql`
          SELECT count(*)::int AS unresolved_reviews
          FROM match_event_reviews
          WHERE status = 'open'
        `),
        database.execute<{
          latest_projection_at: Date | null;
          maximum_revision: number | null;
        }>(sql`
          SELECT max(updated_at) AS latest_projection_at,
                 max(revision)::int AS maximum_revision
          FROM match_projection_state
        `),
      ]);

    let replicationWalRetainedBytes: number | null = null;
    let replicationLagBytes: number | null = null;
    let replicationSlotActive: boolean | null = null;
    try {
      const result = await database.execute<{
        retained_bytes: number | null;
        lag_bytes: number | null;
        active: boolean | null;
      }>(sql`
          SELECT max(
            pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)
          )::float AS retained_bytes,
          max(
            pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)
          )::float AS lag_bytes,
          bool_or(active) AS active
          FROM pg_replication_slots
          WHERE slot_name ILIKE '%powersync%'
        `);
      replicationWalRetainedBytes = result.rows[0]?.retained_bytes ?? null;
      replicationLagBytes = result.rows[0]?.lag_bytes ?? null;
      replicationSlotActive = result.rows[0]?.active ?? null;
    } catch {
      // Managed Postgres may hide replication slots from the application role.
    }

    return {
      checkedAt: new Date().toISOString(),
      uploads: uploadsResult.rows[0],
      clients: clientsResult.rows[0],
      unresolvedReviews: reviewsResult.rows[0]?.unresolved_reviews ?? 0,
      projections: projectionsResult.rows[0],
      replicationWalRetainedBytes,
      replicationLagBytes,
      replicationSlotActive,
    };
  }

  private authorise(authorization?: string) {
    const expected = process.env.OPERATIONS_HEALTH_TOKEN;
    if (!expected) {
      throw new ServiceUnavailableException(
        'Operations monitoring is not configured.',
      );
    }
    const supplied = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    const expectedBuffer = Buffer.from(expected);
    const suppliedBuffer = Buffer.from(supplied);
    if (
      expectedBuffer.length !== suppliedBuffer.length ||
      !timingSafeEqual(expectedBuffer, suppliedBuffer)
    ) {
      throw new UnauthorizedException();
    }
  }
}
