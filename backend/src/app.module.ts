import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { AthletesModule } from './athletes/athletes.module';

@Module({
  imports: [DatabaseModule, AthletesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
