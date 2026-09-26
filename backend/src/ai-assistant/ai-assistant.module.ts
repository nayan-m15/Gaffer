import { Module } from '@nestjs/common';
import { AthletesModule } from '../athletes/athletes.module';
import { CompetitionsModule } from '../competitions/competitions.module';
import { GeminiClient } from '../insights/gemini-client';
import { InjuriesModule } from '../injuries/injuries.module';
import { TeamsModule } from '../teams/teams.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { CompetitionsAssistant } from './competitions-assistant';
import { ConversationStore } from './conversation-store';
import { InjuriesAssistant } from './injuries-assistant';
import { RosterAssistant } from './roster-assistant';

@Module({
  imports: [TeamsModule, AthletesModule, InjuriesModule, CompetitionsModule],
  controllers: [AiAssistantController],
  providers: [
    AiAssistantService,
    ConversationStore,
    GeminiClient,
    RosterAssistant,
    InjuriesAssistant,
    CompetitionsAssistant,
  ],
})
export class AiAssistantModule {}
