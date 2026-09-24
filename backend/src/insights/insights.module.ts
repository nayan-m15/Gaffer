import { Module } from '@nestjs/common';
import { GeminiClient } from './gemini-client';
import { InsightsService } from './insights.service';

@Module({
  providers: [GeminiClient, InsightsService],
  exports: [InsightsService],
})
export class InsightsModule {}
