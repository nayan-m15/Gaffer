import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { DatabaseService } from './database.service';
import { OperationsHealthController } from './operations-health.controller';

const uploads = {
  uploads_24h: 12,
  rejected_24h: 1,
  dependency_pending_24h: 2,
  average_processing_ms: 40.5,
  p95_processing_ms: 120,
};
const clients = { reporting_devices: 3, pending_items: 4 };
const projections = { latest_projection_at: null, maximum_revision: 7 };
const replication = { retained_bytes: 1024, lag_bytes: 32, active: true };

describe('OperationsHealthController', () => {
  let controller: OperationsHealthController;
  let execute: jest.Mock;

  /** Replies to the four parallel reads, then the replication probe. */
  const respondWithAll = () =>
    execute
      .mockResolvedValueOnce({ rows: [uploads] })
      .mockResolvedValueOnce({ rows: [clients] })
      .mockResolvedValueOnce({ rows: [{ unresolved_reviews: 5 }] })
      .mockResolvedValueOnce({ rows: [projections] })
      .mockResolvedValueOnce({ rows: [replication] });

  beforeEach(() => {
    process.env.OPERATIONS_HEALTH_TOKEN = 'secret-token';
    execute = jest.fn();
    controller = new OperationsHealthController({
      database: { execute },
    } as unknown as DatabaseService);
  });

  afterEach(() => {
    delete process.env.OPERATIONS_HEALTH_TOKEN;
  });

  describe('authorisation', () => {
    it('reports an unconfigured token as unavailable, not unauthorized', async () => {
      delete process.env.OPERATIONS_HEALTH_TOKEN;

      await expect(controller.operations('Bearer anything')).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(execute).not.toHaveBeenCalled();
    });

    it.each([
      [undefined, 'no header'],
      ['', 'an empty header'],
      ['secret-token', 'a bare token without the scheme'],
      ['Bearer wrong-token', 'the wrong token'],
      ['Bearer secret-token-longer', 'a token with a matching prefix'],
      ['Basic secret-token', 'the wrong scheme'],
    ])('rejects %p (%s)', async (header) => {
      await expect(controller.operations(header)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(execute).not.toHaveBeenCalled();
    });

    it('accepts the configured bearer token', async () => {
      respondWithAll();

      await expect(
        controller.operations('Bearer secret-token'),
      ).resolves.toBeDefined();
    });
  });

  describe('report', () => {
    it('assembles the operational snapshot', async () => {
      respondWithAll();

      const report = await controller.operations('Bearer secret-token');

      expect(report).toMatchObject({
        uploads,
        clients,
        unresolvedReviews: 5,
        projections,
        replicationWalRetainedBytes: 1024,
        replicationLagBytes: 32,
        replicationSlotActive: true,
      });
      expect(Date.parse(report.checkedAt)).not.toBeNaN();
    });

    it('defaults the unresolved review count when the row is missing', async () => {
      execute
        .mockResolvedValueOnce({ rows: [uploads] })
        .mockResolvedValueOnce({ rows: [clients] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [projections] })
        .mockResolvedValueOnce({ rows: [replication] });

      await expect(
        controller.operations('Bearer secret-token'),
      ).resolves.toMatchObject({ unresolvedReviews: 0 });
    });

    it('still reports when replication slots are hidden from the app role', async () => {
      execute
        .mockResolvedValueOnce({ rows: [uploads] })
        .mockResolvedValueOnce({ rows: [clients] })
        .mockResolvedValueOnce({ rows: [{ unresolved_reviews: 0 }] })
        .mockResolvedValueOnce({ rows: [projections] })
        .mockRejectedValueOnce(new Error('permission denied'));

      await expect(
        controller.operations('Bearer secret-token'),
      ).resolves.toMatchObject({
        replicationWalRetainedBytes: null,
        replicationLagBytes: null,
        replicationSlotActive: null,
        uploads,
      });
    });

    it('nulls replication fields when the probe returns no rows', async () => {
      execute
        .mockResolvedValueOnce({ rows: [uploads] })
        .mockResolvedValueOnce({ rows: [clients] })
        .mockResolvedValueOnce({ rows: [{ unresolved_reviews: 0 }] })
        .mockResolvedValueOnce({ rows: [projections] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(
        controller.operations('Bearer secret-token'),
      ).resolves.toMatchObject({
        replicationWalRetainedBytes: null,
        replicationLagBytes: null,
        replicationSlotActive: null,
      });
    });

    it('propagates a failure of the core reads', async () => {
      execute.mockRejectedValue(new Error('database unreachable'));

      await expect(
        controller.operations('Bearer secret-token'),
      ).rejects.toThrow('database unreachable');
    });
  });
});
