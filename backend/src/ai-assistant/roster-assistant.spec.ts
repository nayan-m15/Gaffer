import { Test, TestingModule } from '@nestjs/testing';
import { AthletesService } from '../athletes/athletes.service';
import {
  GeminiClient,
  GeminiNotConfiguredError,
} from '../insights/gemini-client';
import type { AssistantConversationState } from './conversation-store';
import { RosterAssistant } from './roster-assistant';

function freshState(): AssistantConversationState {
  return {
    context: 'roster',
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

describe('RosterAssistant', () => {
  let assistant: RosterAssistant;
  let athletesService: {
    findAll: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  let geminiClient: { generateNarrative: jest.Mock };

  beforeEach(async () => {
    athletesService = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    };
    geminiClient = { generateNarrative: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RosterAssistant,
        { provide: AthletesService, useValue: athletesService },
        { provide: GeminiClient, useValue: geminiClient },
      ],
    }).compile();

    assistant = module.get(RosterAssistant);
  });

  it('re-asks for name and position while first/last name are missing', async () => {
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'add a player',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/first name, surname and primary position/i);
  });

  it('asks the optional group exactly once after the hard-required fields are known', async () => {
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({ firstName: 'Daniel', lastName: 'Nkosi' }),
    );
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Daniel Nkosi, centre back',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(state.askedOptionalGroup).toBe(true);
    expect(result.reply).toMatch(/date of birth and squad number/i);
  });

  it('still asks for DOB and squad number even when position was already given in the first message', async () => {
    // Regression: position is answered in the *first* question alongside
    // the name, so its presence must not be mistaken for the coach having
    // already answered the second (DOB/squad number) question too.
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({
        firstName: 'Erling',
        lastName: 'Haaland',
        position: 'ST',
      }),
    );
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Erling Haaland and he plays striker',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(state.askedOptionalGroup).toBe(true);
    expect(result.reply).toMatch(/date of birth and squad number/i);
  });

  it.each([
    ['striker', 'ST'],
    ['right wing', 'RW'],
    ['centre back', 'CB'],
    ['centre-back', 'CB'],
    ['Centre Back', 'CB'],
    ['goalkeeper', 'GK'],
    ['st', 'ST'],
  ])(
    'normalizes a spelled-out position ("%s") to the standard abbreviation ("%s") even if the model does not comply',
    async (spokenPosition, abbreviation) => {
      geminiClient.generateNarrative.mockResolvedValue(
        extractionResponse({
          firstName: 'Erling',
          lastName: 'Haaland',
          position: spokenPosition,
        }),
      );
      const state = freshState();

      await assistant.handleMessage(
        state,
        `Erling Haaland, ${spokenPosition}`,
        'team-1',
      );

      expect(state.collectedFields.position).toBe(abbreviation);
    },
  );

  it('proposes a CREATE_PLAYER action once required fields are present and the optional group has been asked', async () => {
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();
    state.collectedFields = {
      firstName: 'Daniel',
      lastName: 'Nkosi',
      position: 'Centre Back',
    };
    state.askedOptionalGroup = true;

    const result = await assistant.handleMessage(state, 'skip', 'team-1');

    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedAction).toEqual({
      type: 'CREATE_PLAYER',
      payload: {
        firstName: 'Daniel',
        lastName: 'Nkosi',
        position: 'CB',
      },
      displaySummary: [
        { label: 'Name', value: 'Daniel Nkosi' },
        { label: 'Position', value: 'CB' },
      ],
    });
  });

  it('warns about a likely duplicate by name but still proposes the action', async () => {
    athletesService.findAll.mockResolvedValue([
      { firstName: 'Daniel', lastName: 'Nkosi', squadNumber: 5 },
    ]);
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();
    state.collectedFields = { firstName: 'Daniel', lastName: 'Nkosi' };
    state.askedOptionalGroup = true;

    const result = await assistant.handleMessage(state, 'skip', 'team-1');

    expect(result.requiresConfirmation).toBe(true);
    expect(result.reply).toMatch(/already exists on your roster/i);
  });

  it('degrades gracefully when Gemini is not configured', async () => {
    geminiClient.generateNarrative.mockRejectedValue(
      new GeminiNotConfiguredError(),
    );
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'add a player',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/isn't configured yet/i);
  });

  it('drops an invalid field and asks the coach to clarify instead of failing silently', async () => {
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({
        firstName: 'Daniel',
        lastName: 'Nkosi',
        squadNumber: 500,
      }),
    );
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Daniel Nkosi, #500',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(state.collectedFields.squadNumber).toBeUndefined();
  });

  describe('execute', () => {
    it('creates the athlete via AthletesService and returns a success message', async () => {
      athletesService.create.mockResolvedValue({ id: 'athlete-1' });

      const result = await assistant.execute('team-1', {
        firstName: 'Daniel',
        lastName: 'Nkosi',
      });

      expect(athletesService.create).toHaveBeenCalledWith('team-1', {
        firstName: 'Daniel',
        lastName: 'Nkosi',
      });
      expect(result).toEqual({
        reply:
          'Daniel Nkosi has been added to the roster. You can open their profile now or add another player.',
        entityType: 'player',
        entityId: 'athlete-1',
        entityLabel: 'Daniel Nkosi',
      });
    });
  });

  describe('"complete a player profile" (UPDATE_PLAYER)', () => {
    const INCOMPLETE_DANIEL = {
      id: 'athlete-1',
      firstName: 'Daniel',
      lastName: 'Nkosi',
      dateOfBirth: null,
      squadNumber: null,
      position: null,
      archivedAt: null,
    };

    it('is routed to the update flow instead of asking for a new player name', async () => {
      athletesService.findAll.mockResolvedValue([INCOMPLETE_DANIEL]);
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'Help me complete a player profile',
        'team-1',
      );

      expect(state.intent).toBe('UPDATE_PLAYER');
      expect(result.requiresConfirmation).toBe(false);
      expect(result.reply).toMatch(/which player's profile/i);
      // Must not ask for a first/last name the way CREATE_PLAYER would.
      expect(result.reply).not.toMatch(/first name, surname/i);
    });

    it('asks only for whichever fields the existing record is missing', async () => {
      athletesService.findAll.mockResolvedValue([INCOMPLETE_DANIEL]);
      geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
      const state = freshState();
      state.intent = 'UPDATE_PLAYER';

      const result = await assistant.handleMessage(
        state,
        "Complete Daniel's profile",
        'team-1',
      );

      expect(state.collectedFields.athleteId).toBe('athlete-1');
      expect(result.requiresConfirmation).toBe(false);
      expect(result.reply).toMatch(/position, date of birth and squad number/i);
    });

    it('disambiguates when multiple players share a name', async () => {
      athletesService.findAll.mockResolvedValue([
        INCOMPLETE_DANIEL,
        { ...INCOMPLETE_DANIEL, id: 'athlete-2', lastName: 'Smith' },
      ]);
      const state = freshState();
      state.intent = 'UPDATE_PLAYER';

      const result = await assistant.handleMessage(
        state,
        "Complete Daniel's profile",
        'team-1',
      );

      expect(result.playerOptions).toHaveLength(2);
      expect(state.collectedFields.__pendingPlayerOptionIds).toEqual([
        'athlete-1',
        'athlete-2',
      ]);
    });

    it('reports the profile as already complete instead of proposing an empty update', async () => {
      athletesService.findAll.mockResolvedValue([
        {
          ...INCOMPLETE_DANIEL,
          position: 'CB',
          dateOfBirth: '2004-03-04',
          squadNumber: 5,
        },
      ]);
      geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
      const state = freshState();
      state.intent = 'UPDATE_PLAYER';
      state.collectedFields.athleteId = 'athlete-1';
      state.resolvedPlayerName = 'Daniel Nkosi';

      const result = await assistant.handleMessage(
        state,
        "Complete Daniel's profile",
        'team-1',
      );

      expect(result.requiresConfirmation).toBe(false);
      expect(result.reply).toMatch(/already complete/i);
    });

    it('proposes an UPDATE_PLAYER action once the missing fields are supplied', async () => {
      athletesService.findAll.mockResolvedValue([INCOMPLETE_DANIEL]);
      geminiClient.generateNarrative.mockResolvedValue(
        extractionResponse({
          position: 'CB',
          dateOfBirth: '2004-03-04',
          squadNumber: 5,
        }),
      );
      const state = freshState();
      state.intent = 'UPDATE_PLAYER';
      state.collectedFields.athleteId = 'athlete-1';
      state.resolvedPlayerName = 'Daniel Nkosi';
      state.askedOptionalGroup = true;

      const result = await assistant.handleMessage(
        state,
        'centre back, 4 March 2004, number 5',
        'team-1',
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(result.proposedAction).toEqual({
        type: 'UPDATE_PLAYER',
        payload: {
          athleteId: 'athlete-1',
          position: 'CB',
          dateOfBirth: '2004-03-04',
          squadNumber: 5,
        },
        displaySummary: [
          { label: 'Player', value: 'Daniel Nkosi' },
          { label: 'Position', value: 'CB' },
          { label: 'Date of birth', value: '2004-03-04' },
          { label: 'Squad number', value: '5' },
        ],
      });
    });

    describe('executeUpdate', () => {
      it('updates the athlete via AthletesService and returns a success message', async () => {
        athletesService.update.mockResolvedValue({
          id: 'athlete-1',
          firstName: 'Daniel',
          lastName: 'Nkosi',
        });

        const result = await assistant.executeUpdate('team-1', {
          athleteId: 'athlete-1',
          position: 'CB',
          squadNumber: 5,
        });

        expect(athletesService.update).toHaveBeenCalledWith(
          'team-1',
          'athlete-1',
          {
            position: 'CB',
            squadNumber: 5,
          },
        );
        expect(result).toEqual({
          reply: "Daniel Nkosi's profile has been updated.",
          entityType: 'player',
          entityId: 'athlete-1',
          entityLabel: 'Daniel Nkosi',
        });
      });
    });
  });
});
