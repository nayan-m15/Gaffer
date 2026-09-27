import { BadRequestException, Injectable } from '@nestjs/common';
import { AthletesService } from '../athletes/athletes.service';
import {
  FORMATIONS,
  getPositionRole,
  suggestStartingXi,
  type PitchAssignments,
} from '../game-plans/lineup-engine';
import { GamePlansService } from '../game-plans/game-plans.service';
import type {
  AssistantConversationState,
  ProposedAction,
} from './conversation-store';
import { normalizePosition } from './roster-assistant';
import type { AssistantExecutionResult, AssistantTurnResult } from './types';

/**
 * The Team page's "Gaffer AI" lineup assistant. Deliberately does not call
 * an LLM: a formation name and player names are the only open-vocabulary
 * inputs here, and both are resolved deterministically against a closed
 * list (the 8 known formations, the team's own roster) the same way
 * `roster-assistant.ts`'s `matchPlayersInMessage` resolves player names —
 * so this works even without `GEMINI_API_KEY` configured, and it can never
 * invent a player or a stat. See `lineup-engine.ts` for the ranking itself.
 *
 * Confirming a suggestion never writes to the database: it hands the
 * lineup back to the Team page, which loads it onto the existing editable
 * board (`useLineupState::loadLineup`) for the coach to review and save
 * through the page's own, already-validated Save flow.
 */

interface LineupRosterAthlete {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  status: string;
  squadNumber: number | null;
  appearances?: number;
  goals?: number;
  assists?: number;
}

interface LineupProposalRecord {
  formationId: string;
  assignments: PitchAssignments;
  substituteIds: string[];
  displaySummary: Array<{ label: string; value: string }>;
}

const FORMATION_OPTIONS = Object.values(FORMATIONS).map((formation) => ({
  id: formation.id,
  label: formation.name,
}));

/** Spelled-out / no-separator forms for the 8 supported formations. */
const FORMATION_ALIASES: Record<string, string> = {
  '433': '4-3-3',
  'four three three': '4-3-3',
  '442': '4-4-2',
  'four four two': '4-4-2',
  '4231': '4-2-3-1',
  'four two three one': '4-2-3-1',
  '4141': '4-1-4-1',
  'four one four one': '4-1-4-1',
  '352': '3-5-2',
  'three five two': '3-5-2',
  '343': '3-4-3',
  'three four three': '3-4-3',
  '532': '5-3-2',
  'five three two': '5-3-2',
  '541': '5-4-1',
  'five four one': '5-4-1',
};

function parseFormationId(text: string): string | null {
  const lower = text.toLowerCase();
  for (const id of Object.keys(FORMATIONS)) {
    if (lower.includes(id)) return id;
  }
  const normalized = lower.replace(/[-/]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [alias, id] of Object.entries(FORMATION_ALIASES)) {
    if (normalized.includes(alias)) return id;
  }
  return null;
}

/** Finds a formation slot label matching free text, e.g. "striker" -> "ST" (or a role fallback, e.g. "AM" -> the formation's own attacking-mid label). */
function resolveSlotLabel(formationId: string, rawText: string): string | null {
  const formation = FORMATIONS[formationId];
  if (!formation) return null;
  const cleaned = rawText.trim().replace(/[.?!,]+$/, '');
  const normalized = normalizePosition(cleaned);

  const exact = formation.positions.find(
    (slot) => slot.label.toUpperCase() === normalized.toUpperCase(),
  );
  if (exact) return exact.label;

  const role = getPositionRole(normalized);
  if (role) {
    const roleSlot = formation.positions.find((slot) => slot.role === role);
    if (roleSlot) return roleSlot.label;
  }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordIndex(lower: string, word: string): number {
  if (!word) return -1;
  const match = new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`).exec(
    lower,
  );
  return match ? match.index : -1;
}

/** All roster athletes named in `text`, ordered by where their name first appears (earliest first) — used to tell "swap A for B" apart. */
function findMentionedAthletesOrdered(
  roster: LineupRosterAthlete[],
  text: string,
): LineupRosterAthlete[] {
  const lower = text.toLowerCase();
  const withIndex: Array<{ athlete: LineupRosterAthlete; index: number }> = [];

  for (const athlete of roster) {
    const fullName = `${athlete.firstName} ${athlete.lastName}`.toLowerCase();
    let index = lower.indexOf(fullName);
    if (index === -1) {
      const candidates = [
        wordIndex(lower, athlete.firstName),
        wordIndex(lower, athlete.lastName),
      ].filter((value) => value >= 0);
      index = candidates.length > 0 ? Math.min(...candidates) : -1;
    }
    if (index >= 0) withIndex.push({ athlete, index });
  }

  withIndex.sort((a, b) => a.index - b.index);
  return withIndex.map((entry) => entry.athlete);
}

const COMPARE_INTENT =
  /\b(compare|who should start|who starts|versus|\bvs\b)\b/i;
const WHY_INTENT = /\bwhy\b/i;
const SWAP_PATTERN = /\b(?:swap|replace)\s+(.+?)\s+(?:for|with)\s+(.+)/i;
const PREFER_PATTERN =
  /\b(?:put|play|start|place)\s+(.+?)\s+(?:at|in|as)\s+(.+)/i;
const EXCLUDE_INTENT =
  /\b(exclude|excluding|without|except|leave\s+out|rest|bench|drop)\b/i;
const SUGGEST_INTENT =
  /\b(suggest|recommend|best\s+(lineup|xi|eleven|11)|strongest\s+(lineup|xi)|starting\s+(xi|eleven|lineup)|pick\s+(my|a)\s+(lineup|team|xi)|improve\s+(my\s+|this\s+)?(lineup|xi)|generate\s+(a\s+|my\s+)?lineup)\b/i;

function describeAthlete(athlete: LineupRosterAthlete): string {
  return (
    `${athlete.firstName} ${athlete.lastName} (${athlete.position ?? 'no position set'}, ${athlete.status}) — ` +
    `${athlete.appearances ?? 0} appearances, ${athlete.goals ?? 0} goals, ${athlete.assists ?? 0} assists`
  );
}

@Injectable()
export class LineupAssistant {
  constructor(
    private readonly athletesService: AthletesService,
    private readonly gamePlansService: GamePlansService,
  ) {}

  async handleMessage(
    state: AssistantConversationState,
    message: string,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    const roster = (await this.athletesService.findAll(
      teamId,
    )) as LineupRosterAthlete[];
    const trimmed = message.trim();
    const lower = trimmed.toLowerCase();

    if (state.collectedFields.awaitingFormation) {
      const formationId = parseFormationId(trimmed);
      if (formationId) {
        state.collectedFields.formationId = formationId;
        state.collectedFields.awaitingFormation = false;
        return this.buildSuggestion(state, teamId, roster);
      }
    }

    if (COMPARE_INTENT.test(lower))
      return this.handleCompare(roster, trimmed, state);
    if (WHY_INTENT.test(lower)) return this.handleWhy(roster, trimmed, state);
    if (SWAP_PATTERN.test(trimmed)) {
      return this.handleSwap(roster, trimmed, state, teamId);
    }
    if (PREFER_PATTERN.test(trimmed)) {
      return this.handlePrefer(roster, trimmed, state, teamId);
    }
    if (EXCLUDE_INTENT.test(lower)) {
      return this.handleExclude(roster, trimmed, state, teamId);
    }

    const formationFromMessage = parseFormationId(trimmed);
    if (SUGGEST_INTENT.test(lower) || formationFromMessage) {
      if (formationFromMessage)
        state.collectedFields.formationId = formationFromMessage;
      if (!state.collectedFields.formationId) return this.askFormation(state);
      return this.buildSuggestion(state, teamId, roster);
    }

    return this.fallback(state);
  }

  async execute(
    teamId: string,
    payload: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const formationId = payload.formationId as string;
    const assignments = (payload.assignments ?? {}) as Record<
      string,
      string | null
    >;
    const substituteIds = (payload.substituteIds ?? []) as string[];

    const roster = await this.athletesService.findAll(teamId);
    const rosterById = new Map(roster.map((athlete) => [athlete.id, athlete]));

    const starterIds = Object.values(assignments).filter(
      (id): id is string => !!id,
    );
    for (const id of [...starterIds, ...substituteIds]) {
      if (!rosterById.has(id)) {
        throw new BadRequestException(
          'One of the suggested players is no longer on your squad — ask me to suggest again.',
        );
      }
    }
    const injuredStarter = starterIds.find(
      (id) => rosterById.get(id)?.status === 'injured',
    );
    if (injuredStarter) {
      throw new BadRequestException(
        'One of the suggested starters is now injured — ask me to suggest again.',
      );
    }

    return {
      reply: `The ${formationId} lineup has been loaded onto the tactical board — review it and save when you're happy.`,
      entityType: 'lineup',
      entityId: formationId,
      entityLabel: `${formationId} lineup`,
      appliedLineup: { formationId, assignments, substituteIds },
    };
  }

  private askFormation(state: AssistantConversationState): AssistantTurnResult {
    state.collectedFields.awaitingFormation = true;
    const hasProposal = Boolean(state.collectedFields.lastProposal);
    return {
      reply: 'Which formation would you like to use?',
      requiresConfirmation: hasProposal,
      proposedAction: this.reattach(state),
      formationOptions: FORMATION_OPTIONS,
    };
  }

  private reattach(
    state: AssistantConversationState,
  ): ProposedAction | undefined {
    const proposal = state.collectedFields.lastProposal as
      LineupProposalRecord | undefined;
    if (!proposal) return undefined;
    return {
      type: 'APPLY_LINEUP_SUGGESTION',
      payload: {
        formationId: proposal.formationId,
        assignments: proposal.assignments,
        substituteIds: proposal.substituteIds,
      },
      displaySummary: proposal.displaySummary,
    };
  }

  private async buildSuggestion(
    state: AssistantConversationState,
    teamId: string,
    roster: LineupRosterAthlete[],
  ): Promise<AssistantTurnResult> {
    const formationId = state.collectedFields.formationId as string;

    let gamePlanAssignments: PitchAssignments | undefined;
    let gamePlanSubstituteIds: string[] | undefined;
    try {
      const plans = await this.gamePlansService.findAll(teamId);
      const latest = plans[0];
      if (latest) {
        gamePlanAssignments = latest.assignments;
        gamePlanSubstituteIds = latest.substituteIds;
      }
    } catch {
      // Continuity with a saved plan is a nice-to-have; ignore failures.
    }

    const result = suggestStartingXi({
      formationId,
      athletes: roster,
      gamePlanAssignments,
      gamePlanSubstituteIds,
      excludeAthleteIds: state.collectedFields.excludeAthleteIds as
        string[] | undefined,
      preferredAthleteIdBySlotLabel: state.collectedFields
        .preferredAthleteIdBySlotLabel as Record<string, string> | undefined,
    });

    const formation = FORMATIONS[result.formationId];
    const displaySummary = formation.positions.map((slot) => {
      const athleteId = result.assignments[slot.id];
      const athlete = athleteId
        ? roster.find((candidate) => candidate.id === athleteId)
        : undefined;
      const reason = athleteId ? result.reasons[athleteId] : undefined;
      const value = athlete
        ? `${athlete.firstName} ${athlete.lastName}${reason ? ` — ${reason}` : ''}`
        : 'Unfilled';
      return { label: slot.label, value };
    });

    state.collectedFields.lastProposal = {
      formationId: result.formationId,
      assignments: result.assignments,
      substituteIds: result.substituteIds,
      displaySummary,
    } satisfies LineupProposalRecord;
    state.collectedFields.lastReasons = result.reasons;

    const warningText = result.warnings.length
      ? `\n\n${result.warnings.join('\n')}`
      : '';

    return {
      reply:
        `Here's a suggested ${result.formationId} lineup based on your current squad.${warningText}\n\n` +
        'Tap "Confirm" to load it onto the pitch, or tell me to exclude someone, put a player in a slot, swap two players, or ask "why <player>?" / "compare <A> and <B>".',
      requiresConfirmation: true,
      proposedAction: {
        type: 'APPLY_LINEUP_SUGGESTION',
        payload: {
          formationId: result.formationId,
          assignments: result.assignments,
          substituteIds: result.substituteIds,
        },
        displaySummary,
      },
    };
  }

  private async handleExclude(
    roster: LineupRosterAthlete[],
    message: string,
    state: AssistantConversationState,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    const matches = findMentionedAthletesOrdered(roster, message);
    if (matches.length === 0) {
      return {
        reply:
          "I couldn't find that player on your squad. Who would you like to exclude?",
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    const current = new Set(
      (state.collectedFields.excludeAthleteIds as string[] | undefined) ?? [],
    );
    for (const athlete of matches) current.add(athlete.id);
    state.collectedFields.excludeAthleteIds = [...current];

    if (!state.collectedFields.formationId) return this.askFormation(state);
    return this.buildSuggestion(state, teamId, roster);
  }

  private async handlePrefer(
    roster: LineupRosterAthlete[],
    message: string,
    state: AssistantConversationState,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    const match = PREFER_PATTERN.exec(message);
    if (!match) return this.fallback(state);
    const [, nameSpan, slotSpan] = match;

    const candidates = findMentionedAthletesOrdered(roster, nameSpan);
    if (candidates.length === 0) {
      return {
        reply: "I couldn't find that player on your squad.",
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    if (!state.collectedFields.formationId) return this.askFormation(state);
    const formationId = state.collectedFields.formationId as string;
    const slotLabel = resolveSlotLabel(formationId, slotSpan);
    if (!slotLabel) {
      return {
        reply: `I don't recognize "${slotSpan.trim().replace(/[.?!]+$/, '')}" as a position in the ${formationId} formation.`,
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    const athlete = candidates[0];
    const preferred = {
      ...((state.collectedFields.preferredAthleteIdBySlotLabel as
        Record<string, string> | undefined) ?? {}),
    };
    preferred[slotLabel] = athlete.id;
    state.collectedFields.preferredAthleteIdBySlotLabel = preferred;

    const excluded = new Set(
      (state.collectedFields.excludeAthleteIds as string[] | undefined) ?? [],
    );
    excluded.delete(athlete.id);
    state.collectedFields.excludeAthleteIds = [...excluded];

    return this.buildSuggestion(state, teamId, roster);
  }

  private async handleSwap(
    roster: LineupRosterAthlete[],
    message: string,
    state: AssistantConversationState,
    teamId: string,
  ): Promise<AssistantTurnResult> {
    const match = SWAP_PATTERN.exec(message);
    if (!match) return this.fallback(state);
    const [, outSpan, inSpan] = match;

    const outMatches = findMentionedAthletesOrdered(roster, outSpan);
    const inMatches = findMentionedAthletesOrdered(roster, inSpan);
    if (outMatches.length === 0 || inMatches.length === 0) {
      return {
        reply:
          'I couldn\'t find both players on your squad. Try "swap <player> for <player>".',
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    const playerOut = outMatches[0];
    const playerIn = inMatches[0];
    const lastProposal = state.collectedFields.lastProposal as
      LineupProposalRecord | undefined;
    if (!lastProposal) return this.askFormation(state);

    const formation = FORMATIONS[lastProposal.formationId];
    const slot = formation?.positions.find(
      (candidate) => lastProposal.assignments[candidate.id] === playerOut.id,
    );
    if (!slot) {
      return {
        reply: `${playerOut.firstName} ${playerOut.lastName} isn't currently in the suggested lineup, so there's nothing to swap out.`,
        requiresConfirmation: true,
        proposedAction: this.reattach(state),
      };
    }

    state.collectedFields.formationId = lastProposal.formationId;

    const excluded = new Set(
      (state.collectedFields.excludeAthleteIds as string[] | undefined) ?? [],
    );
    excluded.add(playerOut.id);
    excluded.delete(playerIn.id);
    state.collectedFields.excludeAthleteIds = [...excluded];

    const preferred = {
      ...((state.collectedFields.preferredAthleteIdBySlotLabel as
        Record<string, string> | undefined) ?? {}),
    };
    preferred[slot.label] = playerIn.id;
    state.collectedFields.preferredAthleteIdBySlotLabel = preferred;

    return this.buildSuggestion(state, teamId, roster);
  }

  private handleWhy(
    roster: LineupRosterAthlete[],
    message: string,
    state: AssistantConversationState,
  ): AssistantTurnResult {
    const matches = findMentionedAthletesOrdered(roster, message);
    const reasons = state.collectedFields.lastReasons as
      Record<string, string> | undefined;

    if (matches.length === 0) {
      return {
        reply: 'Which player would you like me to explain?',
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    const athlete = matches[0];
    if (!reasons || !reasons[athlete.id]) {
      return {
        reply: `${athlete.firstName} ${athlete.lastName} isn't part of the current suggested lineup.`,
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    return {
      reply: `${athlete.firstName} ${athlete.lastName} was selected because: ${reasons[athlete.id]}.`,
      requiresConfirmation: Boolean(state.collectedFields.lastProposal),
      proposedAction: this.reattach(state),
    };
  }

  private handleCompare(
    roster: LineupRosterAthlete[],
    message: string,
    state: AssistantConversationState,
  ): AssistantTurnResult {
    const matches = findMentionedAthletesOrdered(roster, message);
    if (matches.length < 2) {
      return {
        reply: 'Which two players would you like to compare?',
        requiresConfirmation: Boolean(state.collectedFields.lastProposal),
        proposedAction: this.reattach(state),
      };
    }

    const [first, second] = matches;
    return {
      reply: `${describeAthlete(first)}\n${describeAthlete(second)}`,
      requiresConfirmation: Boolean(state.collectedFields.lastProposal),
      proposedAction: this.reattach(state),
    };
  }

  private fallback(state: AssistantConversationState): AssistantTurnResult {
    return {
      reply:
        'I can suggest a starting XI, compare two players, explain a selection, or adjust one — try "suggest my best lineup", "compare Smith and Jones", "why Daniels?", "exclude Smith", or "put Daniels at striker".',
      requiresConfirmation: Boolean(state.collectedFields.lastProposal),
      proposedAction: this.reattach(state),
    };
  }
}
