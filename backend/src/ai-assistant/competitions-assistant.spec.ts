import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CompetitionsService } from '../competitions/competitions.service';
import { GeminiClient } from '../insights/gemini-client';
import { CompetitionsAssistant } from './competitions-assistant';
import type { AssistantConversationState } from './conversation-store';

function freshState(): AssistantConversationState {
  return {
    context: 'competitions',
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

describe('CompetitionsAssistant', () => {
  let assistant: CompetitionsAssistant;
  let competitionsService: { create: jest.Mock; addParticipant: jest.Mock };
  let geminiClient: { generateNarrative: jest.Mock };

  beforeEach(async () => {
    competitionsService = { create: jest.fn(), addParticipant: jest.fn() };
    geminiClient = { generateNarrative: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompetitionsAssistant,
        { provide: CompetitionsService, useValue: competitionsService },
        { provide: GeminiClient, useValue: geminiClient },
      ],
    }).compile();

    assistant = module.get(CompetitionsAssistant);
  });

  it('asks for both name and type when the message specifies neither', async () => {
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();

    const result = await assistant.handleMessage(state, 'Create a competition');

    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/league or a cup/i);
  });

  it.each([
    ['Create a league', 'league', /what would you like to call this league\?/i],
    [
      'Create a competition / tournament',
      'cup',
      /what would you like to call this competition\?/i,
    ],
  ])(
    'deterministically sets the type from "%s" and only asks for the name — never re-asks league vs cup',
    async (suggestedAction, expectedType, questionPattern) => {
      // Regression: clicking a suggested action must not re-ask something
      // the coach already specified by clicking it. This must not depend on
      // the model complying with the extraction hint — it's a plain keyword
      // check so it's guaranteed correct regardless of Gemini's answer.
      geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
      const state = freshState();

      const result = await assistant.handleMessage(state, suggestedAction);

      expect(state.collectedFields.type).toBe(expectedType);
      expect(result.reply).not.toMatch(/is it a league or a cup/i);
      expect(result.reply).toMatch(questionPattern);
    },
  );

  it('asks for the type only when the name is already known', async () => {
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();
    state.collectedFields = { name: 'Gauteng Development League' };

    const result = await assistant.handleMessage(state, 'skip');

    expect(result.reply).toMatch(/is this a league or a cup/i);
  });

  it("keeps the already-established type even if the name given afterwards contains the other type's word", async () => {
    // Regression: after clicking "Create a competition / tournament" (type
    // already set to "cup"), typing a name like "Sunday League" must not
    // flip the type to "league" — whether that flip is attempted by a
    // literal keyword match or (as simulated here) by the model incorrectly
    // treating the name as a correction to the type field.
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({ name: 'Sunday League', type: 'league' }),
    );
    const state = freshState();
    state.collectedFields = { type: 'cup' };

    const result = await assistant.handleMessage(state, 'Sunday League');

    expect(state.collectedFields.type).toBe('cup');
    expect(state.collectedFields.name).toBe('Sunday League');
    expect(result.reply).not.toMatch(/is it a league or a cup/i);
  });

  it('asks the optional season/start-date group exactly once', async () => {
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({
        name: 'Gauteng Development League',
        type: 'league',
      }),
    );
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Gauteng Development League, a league',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(state.askedOptionalGroup).toBe(true);
    expect(result.reply).toMatch(/which season/i);
  });

  it('proposes CREATE_LEAGUE for a league and includes the optional fields once supplied', async () => {
    geminiClient.generateNarrative.mockResolvedValue(
      extractionResponse({ season: '2027', startDate: '2027-02-10' }),
    );
    const state = freshState();
    state.collectedFields = {
      name: 'Gauteng Development League',
      type: 'league',
    };
    state.askedOptionalGroup = true;

    const result = await assistant.handleMessage(
      state,
      '2027, starting 10 Feb 2027',
    );

    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedAction).toEqual({
      type: 'CREATE_LEAGUE',
      payload: {
        name: 'Gauteng Development League',
        type: 'league',
        season: '2027',
        startDate: '2027-02-10',
      },
      displaySummary: [
        { label: 'Name', value: 'Gauteng Development League' },
        { label: 'Type', value: 'League' },
        { label: 'Season', value: '2027' },
        { label: 'Start date', value: '2027-02-10' },
      ],
    });
  });

  it('proposes CREATE_COMPETITION for a cup', async () => {
    geminiClient.generateNarrative.mockResolvedValue(extractionResponse({}));
    const state = freshState();
    state.collectedFields = { name: 'Founders Cup', type: 'cup' };
    state.askedOptionalGroup = true;

    const result = await assistant.handleMessage(state, 'skip');

    expect(result.proposedAction?.type).toBe('CREATE_COMPETITION');
  });

  describe('execute', () => {
    it('creates the competition and returns a success message', async () => {
      competitionsService.create.mockResolvedValue({ id: 'comp-1' });

      const result = await assistant.execute('user-1', {
        name: 'Gauteng Development League',
        type: 'league',
      });

      expect(competitionsService.create).toHaveBeenCalledWith('user-1', {
        name: 'Gauteng Development League',
        type: 'league',
      });
      expect(result.entityType).toBe('league');
      expect(result.entityId).toBe('comp-1');
    });

    it('wraps a name-conflict error in a friendly, retryable message rather than a raw 400', async () => {
      competitionsService.create.mockRejectedValue(
        new BadRequestException('A competition with this name already exists.'),
      );

      await expect(
        assistant.execute('user-1', {
          name: 'Gauteng Development League',
          type: 'league',
        }),
      ).rejects.toThrow(/Couldn't create "Gauteng Development League"/);
    });
  });

  describe('adding a team to an existing competition (competitionId present)', () => {
    const competitionId = 'competition-1';

    it('never enters the create-league/competition flow when a competitionId is given', async () => {
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'Add a team',
        competitionId,
      );

      expect(result.reply).toMatch(/what is the name of the team/i);
      expect(result.reply).not.toMatch(/league or a cup/i);
      expect(state.intent).toBe('ADD_COMPETITION_TEAM');
    });

    it('proposes ADD_COMPETITION_TEAM once a single team name is given', async () => {
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'Arsenal FC',
        competitionId,
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(result.proposedAction).toEqual({
        type: 'ADD_COMPETITION_TEAM',
        payload: { competitionId, displayNames: ['Arsenal FC'] },
        displaySummary: [{ label: 'Team name', value: 'Arsenal FC' }],
      });
    });

    it('adds every team in a comma-separated list, not one team with the whole list as its name', async () => {
      // Regression: "add Real Madrid, Barcelona, Bayern Munich, Borussia
      // Dortmund" must become four teams, not one team literally named
      // "Real Madrid, Barcelona, Bayern Munich, Borussia Dortmund".
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'add Real Madrid, Barcelona, Bayern Munich, Borussia Dortmund',
        competitionId,
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(result.proposedAction?.payload).toEqual({
        competitionId,
        displayNames: [
          'Real Madrid',
          'Barcelona',
          'Bayern Munich',
          'Borussia Dortmund',
        ],
      });
      expect(result.proposedAction?.displaySummary).toEqual([
        { label: 'Team 1', value: 'Real Madrid' },
        { label: 'Team 2', value: 'Barcelona' },
        { label: 'Team 3', value: 'Bayern Munich' },
        { label: 'Team 4', value: 'Borussia Dortmund' },
      ]);
    });

    it('also splits an "and"-separated list', async () => {
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        'Real Madrid and Barcelona and Bayern Munich',
        competitionId,
      );

      expect(result.proposedAction?.payload).toEqual({
        competitionId,
        displayNames: ['Real Madrid', 'Barcelona', 'Bayern Munich'],
      });
    });

    describe('executeAddTeam', () => {
      it('adds a single team via CompetitionsService and returns a success message', async () => {
        competitionsService.addParticipant.mockResolvedValue({ id: 'team-1' });

        const result = await assistant.executeAddTeam('user-1', {
          competitionId,
          displayNames: ['Arsenal FC'],
        });

        expect(competitionsService.addParticipant).toHaveBeenCalledWith(
          'user-1',
          competitionId,
          { displayName: 'Arsenal FC' },
        );
        expect(result.entityId).toBe('team-1');
        expect(result.entityLabel).toBe('Arsenal FC');
      });

      it('adds every team in the list, one call per team', async () => {
        competitionsService.addParticipant
          .mockResolvedValueOnce({ id: 'team-1' })
          .mockResolvedValueOnce({ id: 'team-2' })
          .mockResolvedValueOnce({ id: 'team-3' })
          .mockResolvedValueOnce({ id: 'team-4' });

        const result = await assistant.executeAddTeam('user-1', {
          competitionId,
          displayNames: [
            'Real Madrid',
            'Barcelona',
            'Bayern Munich',
            'Borussia Dortmund',
          ],
        });

        expect(competitionsService.addParticipant).toHaveBeenCalledTimes(4);
        expect(result.reply).toContain(
          '4 teams have been added: Real Madrid, Barcelona, Bayern Munich, Borussia Dortmund.',
        );
        expect(result.entityLabel).toBe(
          'Real Madrid, Barcelona, Bayern Munich, Borussia Dortmund',
        );
      });

      it('reports which teams failed but still succeeds for the rest', async () => {
        competitionsService.addParticipant
          .mockResolvedValueOnce({ id: 'team-1' })
          .mockRejectedValueOnce(
            new BadRequestException('A team with this name already exists.'),
          );

        const result = await assistant.executeAddTeam('user-1', {
          competitionId,
          displayNames: ['Real Madrid', 'Barcelona'],
        });

        expect(result.reply).toContain('Real Madrid has been added');
        expect(result.reply).toContain(
          "Couldn't add Barcelona (A team with this name already exists.)",
        );
      });

      it('wraps a duplicate-name error in a friendly, retryable message when every team fails', async () => {
        competitionsService.addParticipant.mockRejectedValue(
          new BadRequestException('A team with this name already exists.'),
        );

        await expect(
          assistant.executeAddTeam('user-1', {
            competitionId,
            displayNames: ['Arsenal FC'],
          }),
        ).rejects.toThrow(/Couldn't add "Arsenal FC"/);
      });
    });
  });
});
