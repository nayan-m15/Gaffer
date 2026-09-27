import { Module } from '@nestjs/common';
import { SeasonsModule } from '../seasons/seasons.module';
import { GeminiClient } from './gemini-client';
import { InsightsService } from './insights.service';

@Module({
  imports: [SeasonsModule],
  providers: [GeminiClient, InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
