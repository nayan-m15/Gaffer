import { Test, TestingModule } from '@nestjs/testing';
import { AthletesService } from '../athletes/athletes.service';
import { GeminiClient } from '../insights/gemini-client';
import { InjuriesService } from '../injuries/injuries.service';
import type { AssistantConversationState } from './conversation-store';
import { InjuriesAssistant } from './injuries-assistant';

function freshState(): AssistantConversationState {
  return {
    context: 'injuries',
    intent: null,
    collectedFields: {},
    askedOptionalGroup: false,
    status: 'collecting',
    proposedAction: null,
    resolvedPlayerName: null,
    updatedAt: Date.now(),
  };
}

function extractionResponse(fields: Record<string, unknown>) {
  return { text: JSON.stringify({ extracted: fields }), model: 'test-model' };
}

const DANIEL_ID = 'a1111111-1111-4111-8111-111111111111';
const DANIEL_2_ID = 'a2222222-2222-4222-8222-222222222222';

const DANIEL = {
  id: DANIEL_ID,
  firstName: 'Daniel',
  lastName: 'Nkosi',
  squadNumber: 5,
  position: 'CB',
  archivedAt: null,
};
const DANIEL_2 = {
  id: DANIEL_2_ID,
  firstName: 'Daniel',
  lastName: 'Smith',
  squadNumber: 8,
  position: 'ST',
  archivedAt: null,
};

describe('InjuriesAssistant', () => {
  let assistant: InjuriesAssistant;
  let athletesService: { findAll: jest.Mock };
  let injuriesService: { findAll: jest.Mock; create: jest.Mock };
  let geminiClient: { generateNarrative: jest.Mock };

  beforeEach(async () => {
    athletesService = { findAll: jest.fn().mockResolvedValue([DANIEL]) };
    injuriesService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
    };
    geminiClient = { generateNarrative: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InjuriesAssistant,
        { provide: AthletesService, useValue: athletesService },
        { provide: InjuriesService, useValue: injuriesService },
        { provide: GeminiClient, useValue: geminiClient },
      ],
    }).compile();

    assistant = module.get(InjuriesAssistant);
  });

  it('asks which workflow the coach wants when the opening message is ambiguous', async () => {
    const state = freshState();
    const result = await assistant.handleMessage(state, 'hello', 'team-1');

    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/record a new injury, or ask about/i);
    expect(state.intent).toBeNull();
  });

  it.each(["Ask about a player's injury", "Check a player's recovery status"])(
    'treats the page\'s own suggested action "%s" as a question, not an ambiguous opener',
    async (suggestedAction) => {
      // Regression: neither of the injuries page's own suggested-action
      // buttons is phrased as a question, so it must not fall through to
      // the ambiguous-opener reply that just echoes the request back. It's
      // also not phrased with a specific player, so it should ask who
      // rather than guess (see the "asks who instead of guessing" tests in
      // the Q&A describe block below) — this test only checks routing.
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        suggestedAction,
        'team-1',
      );

      expect(result.reply).not.toMatch(/record a new injury, or ask about/i);
    },
  );

  it('resolves a named player from a combined message and asks the next missing field', async () => {
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Daniel hurt his hamstring yesterday, record it',
      'team-1',
    );

    expect(state.collectedFields.athleteId).toBe(DANIEL_ID);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/what area is injured/i);
  });

  it('asks the coach to disambiguate when multiple players share a name', async () => {
    athletesService.findAll.mockResolvedValue([DANIEL, DANIEL_2]);
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'record an injury for Daniel',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.playerOptions).toHaveLength(2);
    expect(state.collectedFields.__pendingPlayerOptionIds).toEqual([
      DANIEL_ID,
      DANIEL_2_ID,
    ]);
  });

  it('always asks who the injury is for when the message names nobody', async () => {
    // Regression: whatever the injuries page currently has focused is often
    // just a display default (the most-urgent existing injury), not a
    // deliberate choice for a *new* record — and even the normal Log Injury
    // form always asks explicitly. Recording against the wrong player
    // silently would be far worse than asking one extra question.
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'log a new injury',
      'team-1',
    );

    expect(state.collectedFields.athleteId).toBeUndefined();
    expect(result.reply).toMatch(/which player is this injury for/i);
    expect(geminiClient.generateNarrative).not.toHaveBeenCalled();
  });

  it('proposes a CREATE_INJURY action once all required fields are collected', async () => {
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({
        bodyRegion: 'hamstring_left',
        injuryType: 'strain',
        severity: 'minor',
        occurredOn: '2026-09-25',
      }),
    );
    const state = freshState();
    state.intent = 'CREATE_INJURY';
    state.collectedFields.athleteId = DANIEL_ID;
    state.resolvedPlayerName = 'Daniel Nkosi';
    state.askedOptionalGroup = true;

    const result = await assistant.handleMessage(
      state,
      'grade 1 left hamstring strain yesterday',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedAction?.type).toBe('CREATE_INJURY');
    expect(result.proposedAction?.payload).toMatchObject({
      athleteId: DANIEL_ID,
      bodyRegion: 'hamstring_left',
      injuryType: 'strain',
      severity: 'minor',
      occurredOn: '2026-09-25',
    });
  });

  it('rejects a future injury date and re-asks instead of failing silently', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({
        bodyRegion: 'hamstring_left',
        injuryType: 'strain',
        severity: 'minor',
        occurredOn: future,
      }),
    );
    const state = freshState();
    state.intent = 'CREATE_INJURY';
    state.collectedFields.athleteId = DANIEL_ID;
    state.askedOptionalGroup = true;

    const result = await assistant.handleMessage(
      state,
      'happened next week',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(state.collectedFields.occurredOn).toBeUndefined();
  });

  describe('execute', () => {
    it('creates the injury via InjuriesService and returns a success message using the joined athlete name', async () => {
      injuriesService.create.mockResolvedValue({
        id: 'injury-1',
        athleteFirstName: 'Daniel',
        athleteLastName: 'Nkosi',
      });

      const result = await assistant.execute('team-1', 'user-1', {
        athleteId: DANIEL_ID,
        bodyRegion: 'hamstring_left',
        injuryType: 'strain',
        severity: 'minor',
        occurredOn: '2026-09-25',
      });

      expect(injuriesService.create).toHaveBeenCalledWith('team-1', 'user-1', {
        athleteId: DANIEL_ID,
        bodyRegion: 'hamstring_left',
        injuryType: 'strain',
        severity: 'minor',
        occurredOn: '2026-09-25',
      });
      expect(result.entityLabel).toBe('Daniel Nkosi');
      expect(result.entityType).toBe('injury');
    });
  });

  describe('Q&A', () => {
    it('answers a grounded question about a resolved player using only recorded data', async () => {
      injuriesService.findAll.mockResolvedValue([
        {
          athleteFirstName: 'Daniel',
          athleteLastName: 'Nkosi',
          bodyRegion: 'hamstring_left',
          injuryType: 'strain',
          severity: 'minor',
          status: 'reported',
          occurredOn: '2026-09-25',
          estimatedReturnFrom: '2026-09-30',
          estimatedReturnTo: '2026-10-05',
          actualReturnOn: null,
          diagnosedBy: null,
          notes: null,
        },
      ]);
      geminiClient.generateNarrative.mockResolvedValue({
        text: 'Daniel is recorded with a minor left hamstring strain from 25 September.',
        model: 'test-model',
      });
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'What injury does Daniel have?',
        'team-1',
      );

      expect(result.requiresConfirmation).toBe(false);
      expect(result.reply).toContain(
        'Daniel is recorded with a minor left hamstring strain',
      );
      expect(injuriesService.findAll).toHaveBeenCalledWith('team-1', {
        athleteId: DANIEL_ID,
      });
    });

    it('asks for disambiguation instead of guessing when a question names an ambiguous player', async () => {
      athletesService.findAll.mockResolvedValue([DANIEL, DANIEL_2]);
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'How long has Daniel been injured?',
        'team-1',
      );

      expect(result.playerOptions).toHaveLength(2);
      expect(geminiClient.generateNarrative).not.toHaveBeenCalled();
    });

    it('asks who to ask about instead of guessing when a pronoun-only question names nobody', async () => {
      // Regression: whatever the page currently has focused must never be
      // silently substituted for an unnamed player — that's exactly how a
      // generic opener like "Ask about a player's injury" ended up getting
      // answered about an arbitrary, unrelated player.
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'How long has he been out?',
        'team-1',
      );

      expect(result.reply).toMatch(/which player would you like to ask about/i);
      expect(geminiClient.generateNarrative).not.toHaveBeenCalled();
    });

    it('resolves a name explicitly mentioned in the question, even among same-first-name players', async () => {
      athletesService.findAll.mockResolvedValue([DANIEL, DANIEL_2]);
      injuriesService.findAll.mockResolvedValue([]);
      geminiClient.generateNarrative.mockResolvedValue({
        text: 'No open injuries are currently recorded for Smith.',
        model: 'test-model',
      });
      const state = freshState();

      await assistant.handleMessage(state, 'How is Smith doing?', 'team-1');

      expect(injuriesService.findAll).toHaveBeenCalledWith('team-1', {
        athleteId: DANIEL_2_ID,
      });
    });

    it.each([
      "Ask about a player's injury",
      "Check a player's recovery status",
    ])(
      'asks who instead of guessing for the generic suggested action "%s"',
      async (suggestedAction) => {
        const state = freshState();

        const result = await assistant.handleMessage(
          state,
          suggestedAction,
          'team-1',
        );

        expect(result.reply).toMatch(
          /which player would you like to ask about/i,
        );
        expect(geminiClient.generateNarrative).not.toHaveBeenCalled();
      },
    );

    it("answers with just the player's name on the next turn, without re-asking or repeating the ambiguous-opener reply", async () => {
      // Regression: the "which player would you like to ask about?" prompt
      // must be remembered as part of the SAME conversation. A reply of
      // just a name must not be re-classified from scratch (which
      // previously fell through to "would you like to record a new injury,
      // or ask about...", asking the coach to repeat themselves).
      injuriesService.findAll.mockResolvedValue([
        {
          athleteFirstName: 'Cole',
          athleteLastName: 'Palmer',
          bodyRegion: 'hamstring_left',
          injuryType: 'strain',
          severity: 'minor',
          status: 'reported',
          occurredOn: '2026-09-25',
          estimatedReturnFrom: '2026-09-30',
          estimatedReturnTo: '2026-10-05',
          actualReturnOn: null,
          diagnosedBy: null,
          notes: null,
        },
      ]);
      geminiClient.generateNarrative.mockResolvedValue({
        text: 'Cole is recorded with a minor left hamstring strain from 25 September.',
        model: 'test-model',
      });
      athletesService.findAll.mockResolvedValue([
        { ...DANIEL, id: 'cole-id', firstName: 'Cole', lastName: 'Palmer' },
      ]);
      const state = freshState();

      const first = await assistant.handleMessage(
        state,
        "Ask about a player's injury",
        'team-1',
      );
      expect(first.reply).toMatch(/which player would you like to ask about/i);

      const second = await assistant.handleMessage(
        state,
        'Cole palmer',
        'team-1',
      );

      expect(second.reply).not.toMatch(/record a new injury, or ask about/i);
      expect(second.reply).toContain(
        'Cole is recorded with a minor left hamstring strain',
      );
      expect(injuriesService.findAll).toHaveBeenCalledWith('team-1', {
        athleteId: 'cole-id',
      });
      // The Gemini prompt should carry the *original* question, not "Cole palmer".
      expect(geminiClient.generateNarrative).toHaveBeenCalledWith(
        expect.stringContaining("Question: Ask about a player's injury"),
      );
      // Ready for a completely fresh request next, not stuck waiting.
      expect(state.intent).toBeNull();
    });

    it('answers a team-wide question without needing a specific player', async () => {
      injuriesService.findAll.mockResolvedValue([]);
      geminiClient.generateNarrative.mockResolvedValue({
        text: 'No players are currently unavailable.',
        model: 'test-model',
      });
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'Which players are currently unavailable?',
        'team-1',
      );

      expect(result.requiresConfirmation).toBe(false);
      expect(injuriesService.findAll).toHaveBeenCalledWith('team-1', {
        status: 'open',
      });
    });
  });
});
