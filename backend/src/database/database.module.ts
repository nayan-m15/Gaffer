import { Global, Module } from '@nestjs/common';
import { DatabaseHealthController } from './database-health.controller';
import { DatabaseService } from './database.service';

@Global()
@Module({
  controllers: [DatabaseHealthController],
  providers: [DatabaseService],
  exports: [DatabaseService],
})
export class DatabaseModule {}
