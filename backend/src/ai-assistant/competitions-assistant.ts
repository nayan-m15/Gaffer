import { BadRequestException, Injectable } from '@nestjs/common';
import { CompetitionsService } from '../competitions/competitions.service';
import {
  createCompetitionSchema,
  createCompetitionTeamSchema,
  type CreateCompetitionDto,
} from '../competitions/competitions.schemas';
import {
  GeminiClient,
  GeminiNotConfiguredError,
} from '../insights/gemini-client';
import type { AssistantConversationState } from './conversation-store';
import {
  buildExtractionPrompt,
  mergeExtractedFields,
  parseExtractionResponse,
  type AssistantFieldSpec,
} from './field-extraction';
import type { AssistantExecutionResult, AssistantTurnResult } from './types';

/**
 * Mirrors `createCompetitionSchema` (backend/src/competitions/competitions.schemas.ts).
 * Only `name` and `type` are actually required there — everything else has a
 * DB-level default — so the guided flow only hard-blocks on those two, per
 * the plan's own rule that the repository's schema is the source of truth.
 * The founding participant (the coach's own team) is added automatically by
 * `CompetitionsService.create`, so "which team" is never asked.
 */
export const COMPETITION_FIELDS: AssistantFieldSpec[] = [
  {
    key: 'name',
    label: 'Name',
    type: 'string',
    required: true,
    hint: 'the league or competition name',
  },
  {
    key: 'type',
    label: 'Type',
    type: 'enum',
    required: true,
    enumValues: ['league', 'cup'],
    hint: 'whether this is a league or a cup/knockout competition',
  },
  {
    key: 'season',
    label: 'Season',
    type: 'string',
    required: false,
    hint: 'the season label, e.g. "2027" or "2027/28"',
  },
  {
    key: 'startDate',
    label: 'Start date',
    type: 'date',
    required: false,
    hint: 'the date the competition starts',
  },
];

const HARD_REQUIRED = ['name', 'type'] as const;

/**
 * Generic replies to the "which team(s)?" question that name no actual team
 * — must not be mistaken for a literal team called "a team".
 */
const GENERIC_TEAM_PHRASES = new Set([
  'a team',
  'team',
  'teams',
  'some teams',
  'a few teams',
  'more teams',
]);

/**
 * Splits a free-text reply into candidate team names. Deliberately
 * deterministic (no Gemini call) — team names are proper nouns with no real
 * "extraction" to do, and a coach naming several at once ("Real Madrid,
 * Barcelona, Bayern Munich and Borussia Dortmund") separates them with
 * commas/"and"/"&"/newlines, never as a single combined name.
 */
function splitTeamNames(message: string): string[] {
  const withoutVerb = message.replace(/^\s*(please\s+)?add\s+/i, '').trim();
  if (GENERIC_TEAM_PHRASES.has(withoutVerb.toLowerCase())) return [];

  return withoutVerb
    .split(/,|\band\b|&|\n/i)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > 0 && !GENERIC_TEAM_PHRASES.has(part.toLowerCase()),
    );
}

function missingHardRequired(collected: Record<string, unknown>): string[] {
  return HARD_REQUIRED.filter((key) => collected[key] === undefined);
}

function buildSummary(
  dto: CreateCompetitionDto,
): { label: string; value: string }[] {
  const summary = [
    { label: 'Name', value: dto.name },
    { label: 'Type', value: dto.type === 'league' ? 'League' : 'Cup' },
  ];
  if (dto.season) summary.push({ label: 'Season', value: dto.season });
  if (dto.startDate)
    summary.push({ label: 'Start date', value: dto.startDate });
  return summary;
}

@Injectable()
export class CompetitionsAssistant {
  constructor(
    private readonly competitionsService: CompetitionsService,
    private readonly geminiClient: GeminiClient,
  ) {}

  /**
   * `competitionId` is only ever present when the assistant is opened on an
   * *existing* competition's own detail page — there, creating a whole new
   * league/competition makes no sense, so the conversation is switched
   * entirely into "add a participating team to this competition" mode.
   */
  async handleMessage(
    state: AssistantConversationState,
    message: string,
    competitionId?: string,
  ): Promise<AssistantTurnResult> {
    if (competitionId) {
      return this.handleAddTeam(state, message, competitionId);
    }

    // Once `type` is known, it's excluded from what the model is even asked
    // to extract — not just merged conservatively. That's what guarantees a
    // later message that happens to contain the *other* type's word (e.g.
    // answering "what's the name?" with "Sunday League" after the type was
    // already set to "cup") can never flip it: there is nothing left to
    // second-guess it with, deterministic or model-based.
    const typeAlreadyKnown = state.collectedFields.type !== undefined;
    const fieldsToExtract = typeAlreadyKnown
      ? COMPETITION_FIELDS.filter((field) => field.key !== 'type')
      : COMPETITION_FIELDS;

    let extracted: Record<string, unknown> = {};
    try {
      const prompt = buildExtractionPrompt({
        purpose: 'creating a new league or competition for a football team',
        fields: fieldsToExtract,
        collected: state.collectedFields,
        message,
      });
      const { text } = await this.geminiClient.generateNarrative(prompt);
      extracted = parseExtractionResponse(text);
    } catch (error) {
      if (error instanceof GeminiNotConfiguredError) {
        return {
          reply:
            "The AI assistant isn't configured yet on this server (missing GEMINI_API_KEY). Please use the standard create-competition form for now.",
          requiresConfirmation: false,
        };
      }
    }

    state.collectedFields = mergeExtractedFields(
      fieldsToExtract,
      state.collectedFields,
      extracted,
    );

    // An explicit "cup"/"tournament"/"knockout" or "league" in the message
    // is unambiguous and is what makes the page's own suggested actions
    // ("Create a league" / "Create a competition / tournament") set the
    // type immediately instead of re-asking what the coach just specified
    // by clicking the button. Only fires while the type is still unknown.
    if (!typeAlreadyKnown) {
      const mentionsCup = /\b(cup|tournament|knockout)\b/i.test(message);
      const mentionsLeague = /\bleague\b/i.test(message);
      if (mentionsCup && !mentionsLeague) {
        state.collectedFields.type = 'cup';
      } else if (mentionsLeague && !mentionsCup) {
        state.collectedFields.type = 'league';
      }
    }

    state.intent =
      state.collectedFields.type === 'cup'
        ? 'CREATE_COMPETITION'
        : 'CREATE_LEAGUE';

    const missing = missingHardRequired(state.collectedFields);
    if (missing.length > 0) {
      if (missing.includes('name') && missing.includes('type')) {
        return {
          reply:
            'What would you like to call this league or competition, and is it a league or a cup?',
          requiresConfirmation: false,
        };
      }
      if (missing.includes('name')) {
        const kind =
          state.collectedFields.type === 'cup' ? 'competition' : 'league';
        return {
          reply: `What would you like to call this ${kind}?`,
          requiresConfirmation: false,
        };
      }
      return {
        reply: 'Is this a league or a cup?',
        requiresConfirmation: false,
      };
    }

    if (!state.askedOptionalGroup) {
      const hasOptional =
        state.collectedFields.season !== undefined ||
        state.collectedFields.startDate !== undefined;
      state.askedOptionalGroup = true;
      if (!hasOptional) {
        return {
          reply:
            'Which season is this for, and what start date should it begin? Both are optional — say "skip" if you\'re not sure yet.',
          requiresConfirmation: false,
        };
      }
    }

    const parsed = createCompetitionSchema.safeParse(state.collectedFields);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const badKey = issue?.path[0];
      if (typeof badKey === 'string') delete state.collectedFields[badKey];
      return {
        reply: `${issue?.message ?? 'Something about those details is invalid.'} Could you clarify?`,
        requiresConfirmation: false,
      };
    }

    const summary = buildSummary(parsed.data);
    return {
      reply:
        'Please confirm:\n' +
        summary.map((row) => `${row.label}: ${row.value}`).join('\n') +
        `\n\nCreate this ${parsed.data.type === 'cup' ? 'competition' : 'league'}?`,
      requiresConfirmation: true,
      proposedAction: {
        type:
          parsed.data.type === 'cup' ? 'CREATE_COMPETITION' : 'CREATE_LEAGUE',
        payload: parsed.data,
        displaySummary: summary,
      },
    };
  }

  async execute(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const dto = createCompetitionSchema.parse(payload);
    try {
      const competition = await this.competitionsService.create(userId, dto);
      const kind = dto.type === 'cup' ? 'competition' : 'league';
      return {
        reply: `${dto.name} has been created. You can open it now to invite teams and set up fixtures.`,
        entityType: kind,
        entityId: competition.id,
        entityLabel: dto.name,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw new BadRequestException(
          `Couldn't create "${dto.name}": ${error.message}`,
        );
      }
      throw error;
    }
  }

  private handleAddTeam(
    state: AssistantConversationState,
    message: string,
    competitionId: string,
  ): AssistantTurnResult {
    state.intent = 'ADD_COMPETITION_TEAM';

    if (!Array.isArray(state.collectedFields.teamNames)) {
      const names = splitTeamNames(message);
      if (names.length === 0) {
        return {
          reply:
            "What is the name of the team (or teams) you'd like to add to this competition?",
          requiresConfirmation: false,
        };
      }
      state.collectedFields.teamNames = names;
    }

    const rawNames = state.collectedFields.teamNames as string[];
    const valid: string[] = [];
    const rejected: string[] = [];
    for (const rawName of rawNames) {
      const parsed = createCompetitionTeamSchema.safeParse({
        displayName: rawName,
      });
      if (parsed.success) {
        valid.push(parsed.data.displayName);
      } else {
        rejected.push(rawName);
      }
    }

    if (valid.length === 0) {
      delete state.collectedFields.teamNames;
      return {
        reply:
          'Something about those team names is invalid — they need to be 1-100 characters. Could you clarify?',
        requiresConfirmation: false,
      };
    }

    const summary =
      valid.length === 1
        ? [{ label: 'Team name', value: valid[0] }]
        : valid.map((name, index) => ({
            label: `Team ${index + 1}`,
            value: name,
          }));

    let reply =
      valid.length === 1
        ? `Add "${valid[0]}" as a participating team in this competition?`
        : `Add these ${valid.length} teams to this competition: ${valid.join(', ')}?`;
    if (rejected.length > 0) {
      reply += ` (Couldn't use "${rejected.join('", "')}" as a team ${rejected.length > 1 ? 'names' : 'name'} — skipped.)`;
    }

    return {
      reply,
      requiresConfirmation: true,
      proposedAction: {
        type: 'ADD_COMPETITION_TEAM',
        payload: { competitionId, displayNames: valid },
        displaySummary: summary,
      },
    };
  }

  /** Adds every name in `payload.displayNames` in turn — one confirmation can add several teams at once. Partial failure (e.g. one duplicate name among several new ones) still succeeds for the rest; only a total failure is thrown as an error that keeps the draft alive. */
  async executeAddTeam(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const competitionId = payload.competitionId as string;
    const names = Array.isArray(payload.displayNames)
      ? (payload.displayNames as string[])
      : [];

    const added: string[] = [];
    const failed: Array<{ name: string; reason: string }> = [];
    let lastParticipantId = '';

    for (const rawName of names) {
      const dto = createCompetitionTeamSchema.parse({ displayName: rawName });
      try {
        const participant = await this.competitionsService.addParticipant(
          userId,
          competitionId,
          dto,
        );
        added.push(dto.displayName);
        lastParticipantId = participant.id;
      } catch (error) {
        const reason =
          error instanceof BadRequestException
            ? error.message
            : 'an unexpected error occurred';
        failed.push({ name: dto.displayName, reason });
      }
    }

    if (added.length === 0) {
      const reason = failed[0]?.reason ?? 'unknown error';
      throw new BadRequestException(
        names.length > 1
          ? `Couldn't add any of those teams: ${reason}`
          : `Couldn't add "${names[0]}": ${reason}`,
      );
    }

    let reply =
      added.length === 1
        ? `${added[0]} has been added as a participating team.`
        : `${added.length} teams have been added: ${added.join(', ')}.`;
    if (failed.length > 0) {
      reply += ` Couldn't add ${failed.map((f) => `${f.name} (${f.reason})`).join('; ')}.`;
    }
    reply += ' You can invite coaches now from the competition page.';

    return {
      reply,
      entityType: 'competition team',
      entityId: lastParticipantId,
      entityLabel: added.join(', '),
    };
  }
}
