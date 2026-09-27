import { Injectable } from '@nestjs/common';
import { AthletesService } from '../athletes/athletes.service';
import {
  createAthleteSchema,
  updateAthleteSchema,
  type CreateAthleteDto,
  type UpdateAthleteDto,
} from '../athletes/athletes.schemas';
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
import type {
  AssistantExecutionResult,
  AssistantPlayerOption,
  AssistantTurnResult,
} from './types';

/**
 * Fields mirror `createAthleteSchema` exactly (backend/src/athletes/athletes.schemas.ts)
 * — the app's real player schema, not a separate AI-only shape. `status` is
 * deliberately not collected: it defaults to `available` and asking about it
 * up front adds a question for no benefit in the create flow.
 */
export const ROSTER_FIELDS: AssistantFieldSpec[] = [
  {
    key: 'firstName',
    label: 'First name',
    type: 'string',
    required: true,
    hint: "the player's first name",
  },
  {
    key: 'lastName',
    label: 'Last name',
    type: 'string',
    required: true,
    hint: "the player's surname",
  },
  {
    key: 'position',
    label: 'Position',
    type: 'string',
    required: false,
    hint: 'playing position, always converted to the standard abbreviation: GK, CB, LB, RB, DM, CM, AM, LW, RW, or ST (e.g. "striker" -> ST, "right wing" -> RW, "centre back" -> CB)',
  },
  {
    key: 'dateOfBirth',
    label: 'Date of birth',
    type: 'date',
    required: false,
    hint: 'date of birth, cannot be in the future',
  },
  {
    key: 'squadNumber',
    label: 'Squad number',
    type: 'integer',
    required: false,
    hint: 'shirt/squad number between 1 and 99',
  },
];

/** The optional profile fields a "complete a player profile" conversation can fill in — everything except identity (name), which an existing player already has. */
const PROFILE_FIELDS: AssistantFieldSpec[] = ROSTER_FIELDS.filter((field) =>
  ['position', 'dateOfBirth', 'squadNumber'].includes(field.key),
);

const HARD_REQUIRED = ['firstName', 'lastName'] as const;

/**
 * Standard shorthand positions used throughout the roster UI (matches
 * `POSITIONS` in `frontend/src/components/roster/AthleteFormDialog.tsx`).
 * The extraction prompt already asks Gemini to return one of these, but a
 * spelled-out position ("striker", "right wing") sometimes gets through
 * anyway — this is the deterministic fallback so the roster always displays
 * consistently instead of relying solely on the model's compliance.
 */
const POSITION_ALIASES: Record<string, string> = {
  goalkeeper: 'GK',
  keeper: 'GK',
  goalie: 'GK',
  'centre back': 'CB',
  'center back': 'CB',
  'centre halfback': 'CB',
  'center halfback': 'CB',
  'left back': 'LB',
  'left fullback': 'LB',
  'right back': 'RB',
  'right fullback': 'RB',
  'defensive midfielder': 'DM',
  'defensive midfield': 'DM',
  'holding midfielder': 'DM',
  'central midfielder': 'CM',
  'centre midfielder': 'CM',
  'center midfielder': 'CM',
  'central midfield': 'CM',
  'attacking midfielder': 'AM',
  'attacking midfield': 'AM',
  'left winger': 'LW',
  'left wing': 'LW',
  'left midfielder': 'LW',
  'right winger': 'RW',
  'right wing': 'RW',
  'right midfielder': 'RW',
  striker: 'ST',
  forward: 'ST',
  'centre forward': 'ST',
  'center forward': 'ST',
};

const POSITION_ABBREVIATIONS = new Set([
  'GK',
  'CB',
  'LB',
  'RB',
  'DM',
  'CM',
  'AM',
  'LW',
  'RW',
  'ST',
]);

/**
 * Maps a spelled-out or already-abbreviated position to the standard
 * abbreviation, falling back to the original text if unrecognised. Exported
 * for `lineup-assistant.ts`, which reuses it to resolve a formation slot
 * from free text (e.g. "striker" -> "ST").
 */
export function normalizePosition(raw: string): string {
  const trimmed = raw.trim();
  if (POSITION_ABBREVIATIONS.has(trimmed.toUpperCase()))
    return trimmed.toUpperCase();

  const key = trimmed.toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
  return POSITION_ALIASES[key] ?? trimmed;
}

function missingHardRequired(collected: Record<string, unknown>): string[] {
  return HARD_REQUIRED.filter((key) => collected[key] === undefined);
}

function buildSummary(
  dto: CreateAthleteDto,
): { label: string; value: string }[] {
  const summary = [
    { label: 'Name', value: `${dto.firstName} ${dto.lastName}` },
  ];
  if (dto.position) summary.push({ label: 'Position', value: dto.position });
  if (dto.dateOfBirth)
    summary.push({ label: 'Date of birth', value: dto.dateOfBirth });
  if (dto.squadNumber !== undefined) {
    summary.push({ label: 'Squad number', value: String(dto.squadNumber) });
  }
  return summary;
}

function getMissingPlayerCreateReply(
  collected: Record<string, unknown>,
): AssistantTurnResult | undefined {
  const missing = missingHardRequired(collected);
  if (!missing.includes('firstName') && !missing.includes('lastName')) {
    return undefined;
  }
  return {
    reply: "What is the player's first name, surname and primary position?",
    requiresConfirmation: false,
  };
}

function askOptionalPlayerFields(
  state: AssistantConversationState,
): AssistantTurnResult | undefined {
  if (state.askedOptionalGroup) return undefined;
  const hasOptional =
    state.collectedFields.dateOfBirth !== undefined ||
    state.collectedFields.squadNumber !== undefined;
  state.askedOptionalGroup = true;
  if (hasOptional) return undefined;
  return {
    reply: `What is ${String(state.collectedFields.firstName)}'s date of birth and squad number? Both are optional — say "skip" if you don't have them yet.`,
    requiresConfirmation: false,
  };
}

function resolveUpdatePlayer(
  state: AssistantConversationState,
  roster: RosterAthlete[],
  message: string,
): AssistantTurnResult | undefined {
  if (state.collectedFields.athleteId !== undefined) return undefined;
  const pendingIds = state.collectedFields.__pendingPlayerOptionIds as
    | string[]
    | undefined;
  const candidates = pendingIds
    ? roster.filter((athlete) => pendingIds.includes(athlete.id))
    : roster;
  const matches = matchPlayersInMessage(candidates, message);
  if (matches.length === 1) {
    state.collectedFields.athleteId = matches[0].id;
    state.resolvedPlayerName = `${matches[0].firstName} ${matches[0].lastName}`;
    delete state.collectedFields.__pendingPlayerOptionIds;
    return undefined;
  }
  if (matches.length > 1) {
    state.collectedFields.__pendingPlayerOptionIds = matches.map((athlete) => athlete.id);
    return {
      reply: `I found ${matches.length} players matching that. Which one do you mean?`,
      requiresConfirmation: false,
      playerOptions: matches.map(toPlayerOption),
    };
  }
  return {
    reply: "Which player's profile would you like to complete?",
    requiresConfirmation: false,
  };
}

interface RosterAthlete {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  squadNumber: number | null;
  position: string | null;
  archivedAt: string | Date | null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchPlayersInMessage(
  roster: RosterAthlete[],
  message: string,
): RosterAthlete[] {
  const lower = message.toLowerCase();
  const fullNameMatches = roster.filter((athlete) =>
    lower.includes(`${athlete.firstName} ${athlete.lastName}`.toLowerCase()),
  );
  if (fullNameMatches.length > 0) return fullNameMatches;

  return roster.filter((athlete) => {
    const firstNamePattern = new RegExp(
      `\\b${escapeRegExp(athlete.firstName.toLowerCase())}\\b`,
    );
    const lastNamePattern = new RegExp(
      `\\b${escapeRegExp(athlete.lastName.toLowerCase())}\\b`,
    );
    return firstNamePattern.test(lower) || lastNamePattern.test(lower);
  });
}

function toPlayerOption(athlete: RosterAthlete): AssistantPlayerOption {
  return {
    id: athlete.id,
    name: `${athlete.firstName} ${athlete.lastName}`,
    squadNumber: athlete.squadNumber,
    position: athlete.position,
  };
}

/**
 * Distinguishes "help me complete a player profile" (an update to an
 * existing player) from "add a new player" (the default). Deliberately
 * narrow — it matches the plan's suggested-action wording and close
 * variants, not every possible phrasing of an edit request.
 */
function looksLikeUpdateProfileRequest(message: string): boolean {
  return (
    /\b(complete|update|edit|finish|fill\s?(in|out))\b/i.test(message) &&
    /\b(profile|details|info|information)\b/i.test(message)
  );
}

@Injectable()
export class RosterAssistant {
  constructor(
    private readonly athletesService: AthletesService,
    private readonly geminiClient: GeminiClient,
  ) {}

  async handleMessage(
    state: AssistantConversationState,
    message: string,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    if (!state.intent) {
      state.intent = looksLikeUpdateProfileRequest(message)
        ? 'UPDATE_PLAYER'
        : 'CREATE_PLAYER';
    }

    if (state.intent === 'UPDATE_PLAYER') {
      return this.handleUpdatePlayer(state, message, teamId);
    }
    return this.handleCreatePlayer(state, message, teamId);
  }

  private async handleCreatePlayer(
    state: AssistantConversationState,
    message: string,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    let extracted: Record<string, unknown> = {};
    try {
      const prompt = buildExtractionPrompt({
        purpose: "adding a new player to a football team's roster",
        fields: ROSTER_FIELDS,
        collected: state.collectedFields,
        message,
      });
      const { text } = await this.geminiClient.generateNarrative(prompt);
      extracted = parseExtractionResponse(text);
    } catch (error) {
      if (error instanceof GeminiNotConfiguredError) {
        return {
          reply:
            "The AI assistant isn't configured yet on this server (missing GEMINI_API_KEY). Please use the standard Add Athlete form for now.",
          requiresConfirmation: false,
        };
      }
      // Extraction failure: fall through and re-ask the same question rather
      // than losing the coach's draft.
    }

    state.collectedFields = mergeExtractedFields(
      ROSTER_FIELDS,
      state.collectedFields,
      extracted,
    );
    if (typeof state.collectedFields.position === 'string') {
      state.collectedFields.position = normalizePosition(
        state.collectedFields.position,
      );
    }

    const missingReply = getMissingPlayerCreateReply(state.collectedFields);
    if (missingReply) return missingReply;
    // Position is asked alongside the required name, not with optional fields.
    const optionalReply = askOptionalPlayerFields(state);
    if (optionalReply) return optionalReply;

    const parsed = createAthleteSchema.safeParse(state.collectedFields);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      // Drop the offending field so the next answer can correct it instead
      // of failing the same way forever.
      const badKey = issue?.path[0];
      if (typeof badKey === 'string') delete state.collectedFields[badKey];
      return {
        reply: `${issue?.message ?? 'Something about those details is invalid.'} Could you clarify?`,
        requiresConfirmation: false,
      };
    }

    const duplicate = await this.findLikelyDuplicate(teamId, parsed.data);
    const summary = buildSummary(parsed.data);

    let reply =
      'Please confirm the new player:\n' +
      summary.map((row) => `${row.label}: ${row.value}`).join('\n');
    if (duplicate) {
      reply =
        `Heads up — ${duplicate.label} already exists on your roster with a similar ${duplicate.reason === 'squadNumber' ? 'squad number' : 'name'}. ` +
        reply +
        '\n\nCreate this player anyway, or would you rather view the existing one?';
    }
    reply += '\n\nCreate this player?';

    return {
      reply,
      requiresConfirmation: true,
      proposedAction: {
        type: 'CREATE_PLAYER',
        payload: parsed.data,
        displaySummary: summary,
      },
    };
  }

  /**
   * "Help me complete a player profile" — an update to an *existing*
   * player, not a new roster entry. Resolves the player by name (or trusts
   * an already-selected one), then asks only about whichever of
   * position/date of birth/squad number that player's record is still
   * missing, once.
   */
  private async handleUpdatePlayer(
    state: AssistantConversationState,
    message: string,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    const roster = (await this.athletesService.findAll(
      teamId,
    )) as RosterAthlete[];

    const playerReply = resolveUpdatePlayer(state, roster, message);
    if (playerReply) return playerReply;

    const athleteId = state.collectedFields.athleteId as string;
    const existing = roster.find((athlete) => athlete.id === athleteId);
    if (!existing) {
      delete state.collectedFields.athleteId;
      return {
        reply:
          "I couldn't find that player anymore. Which player's profile would you like to complete?",
        requiresConfirmation: false,
      };
    }

    let extracted: Record<string, unknown> = {};
    try {
      const prompt = buildExtractionPrompt({
        purpose: `completing ${existing.firstName}'s existing player profile — not creating a new player`,
        fields: PROFILE_FIELDS,
        collected: state.collectedFields,
        message,
      });
      const { text } = await this.geminiClient.generateNarrative(prompt);
      extracted = parseExtractionResponse(text);
    } catch (error) {
      if (error instanceof GeminiNotConfiguredError) {
        return {
          reply:
            "The AI assistant isn't configured yet on this server (missing GEMINI_API_KEY). Please use the standard Edit Athlete form for now.",
          requiresConfirmation: false,
        };
      }
    }

    state.collectedFields = mergeExtractedFields(
      PROFILE_FIELDS,
      state.collectedFields,
      extracted,
    );
    state.collectedFields.athleteId = athleteId;
    if (typeof state.collectedFields.position === 'string') {
      state.collectedFields.position = normalizePosition(
        state.collectedFields.position,
      );
    }

    if (!state.askedOptionalGroup) {
      const stillMissing = PROFILE_FIELDS.filter((field) => {
        const existingValue = existing[field.key as keyof RosterAthlete];
        const hasExisting =
          existingValue !== null && existingValue !== undefined;
        return !hasExisting && state.collectedFields[field.key] === undefined;
      });
      state.askedOptionalGroup = true;

      if (stillMissing.length > 0) {
        const labels = stillMissing.map((field) => field.label.toLowerCase());
        return {
          reply: `What is ${existing.firstName}'s ${joinWithAnd(labels)}? Optional — say "skip" for any you don't have.`,
          requiresConfirmation: false,
        };
      }
    }

    const providedFields = PROFILE_FIELDS.filter(
      (field) => state.collectedFields[field.key] !== undefined,
    );
    if (providedFields.length === 0) {
      return {
        reply: `${existing.firstName}'s profile is already complete — nothing new to update. Let me know if you'd like to change anything.`,
        requiresConfirmation: false,
      };
    }

    const candidatePayload: Record<string, unknown> = {};
    for (const field of providedFields) {
      candidatePayload[field.key] = state.collectedFields[field.key];
    }

    const parsed = updateAthleteSchema.safeParse(candidatePayload);
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      const badKey = issue?.path[0];
      if (typeof badKey === 'string') delete state.collectedFields[badKey];
      return {
        reply: `${issue?.message ?? 'Something about those details is invalid.'} Could you clarify?`,
        requiresConfirmation: false,
      };
    }

    const summary: { label: string; value: string }[] = [
      { label: 'Player', value: `${existing.firstName} ${existing.lastName}` },
    ];
    if (parsed.data.position) {
      summary.push({ label: 'Position', value: parsed.data.position });
    }
    if (parsed.data.dateOfBirth) {
      summary.push({ label: 'Date of birth', value: parsed.data.dateOfBirth });
    }
    if (
      parsed.data.squadNumber !== undefined &&
      parsed.data.squadNumber !== null
    ) {
      summary.push({
        label: 'Squad number',
        value: String(parsed.data.squadNumber),
      });
    }

    return {
      reply:
        'Please confirm the update:\n' +
        summary.map((row) => `${row.label}: ${row.value}`).join('\n') +
        '\n\nSave this update?',
      requiresConfirmation: true,
      proposedAction: {
        type: 'UPDATE_PLAYER',
        payload: { athleteId, ...parsed.data },
        displaySummary: summary,
      },
    };
  }

  async execute(
    teamId: string,
    payload: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const dto = createAthleteSchema.parse(payload);
    const athlete = await this.athletesService.create(teamId, dto);
    return {
      reply: `${dto.firstName} ${dto.lastName} has been added to the roster. You can open their profile now or add another player.`,
      entityType: 'player',
      entityId: athlete.id,
      entityLabel: `${dto.firstName} ${dto.lastName}`,
    };
  }

  async executeUpdate(
    teamId: string,
    payload: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const { athleteId, ...rest } = payload;
    const dto: UpdateAthleteDto = updateAthleteSchema.parse(rest);
    const athlete = await this.athletesService.update(
      teamId,
      athleteId as string,
      dto,
    );
    return {
      reply: `${athlete.firstName} ${athlete.lastName}'s profile has been updated.`,
      entityType: 'player',
      entityId: athlete.id,
      entityLabel: `${athlete.firstName} ${athlete.lastName}`,
    };
  }

  private async findLikelyDuplicate(
    teamId: string,
    dto: CreateAthleteDto,
  ): Promise<{ reason: 'name' | 'squadNumber'; label: string } | null> {
    const roster = await this.athletesService.findAll(teamId);

    const nameMatch = roster.find(
      (athlete) =>
        athlete.firstName.toLowerCase() === dto.firstName.toLowerCase() &&
        athlete.lastName.toLowerCase() === dto.lastName.toLowerCase(),
    );
    if (nameMatch) {
      return {
        reason: 'name',
        label: `${nameMatch.firstName} ${nameMatch.lastName}`,
      };
    }

    if (dto.squadNumber !== undefined) {
      const numberMatch = roster.find(
        (athlete) => athlete.squadNumber === dto.squadNumber,
      );
      if (numberMatch) {
        return {
          reason: 'squadNumber',
          label: `${numberMatch.firstName} ${numberMatch.lastName} (#${numberMatch.squadNumber})`,
        };
      }
    }

    return null;
  }
}

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  if (parts.length === 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
