import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { CompetitionsModule } from '../competitions/competitions.module';
import { GamePlansModule } from '../game-plans/game-plans.module';
import { GeminiClient } from '../insights/gemini-client';
import { InjuriesModule } from '../injuries/injuries.module';
import { TeamsModule } from '../teams/teams.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { CompetitionsAssistant } from './competitions-assistant';
import { ConversationStore } from './conversation-store';
import { InjuriesAssistant } from './injuries-assistant';
import { LineupAssistant } from './lineup-assistant';
import { RosterAssistant } from './roster-assistant';

@Module({
  imports: [
    TeamsModule,
    AthletesModule,
    InjuriesModule,
    CompetitionsModule,
    GamePlansModule,
  ],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    ConversationStore,
    GeminiClient,
    RosterAssistant,
    InjuriesAssistant,
    CompetitionsAssistant,
    LineupAssistant,
  ],
})
export class AiAssistantModule {}
