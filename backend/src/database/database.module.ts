import { Global, Module } from '@nestjs/common';
import { DatabaseHealthController } from './database-health.controller';
import { OperationsHealthController } from './operations-health.controller';
import { DatabaseService } from './database.service';

@Global()
@Module({
  controllers: [DatabaseHealthController, OperationsHealthController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
