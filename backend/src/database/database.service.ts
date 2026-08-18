import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { createDatabaseClient, type DatabaseClient } from './drizzle';

@Injectable()
export class DatabaseService {
  private client?: DatabaseClient;

  get database(): DatabaseClient {
    this.client ??= createDatabaseClient();
    return this.client;
  }

  async assertConnection(): Promise<void> {
    try {
      await this.database.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException(
        'Database is unavailable or DATABASE_URL is not configured.',
      );
    }
  }
}
