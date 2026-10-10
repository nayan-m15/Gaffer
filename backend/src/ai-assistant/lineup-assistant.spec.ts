import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AthletesService } from '../athletes/athletes.service';
import { GamePlansService } from '../game-plans/game-plans.service';
import type { AssistantConversationState } from './conversation-store';
import { LineupAssistant } from './lineup-assistant';

function freshState(): AssistantConversationState {
  return {
    context: 'lineup',
    intent: null,
    collectedFields: {},
    askedOptionalGroup: false,
    status: 'collecting',
    proposedAction: null,
    resolvedPlayerName: null,
    updatedAt: Date.now(),
  };
}

interface Fixture {
  id: string;
  firstName: string;
  lastName: string;
  position: string | null;
  status: string;
  squadNumber: number | null;
  appearances: number;
  goals: number;
  assists: number;
}

function makeAthlete(overrides: Partial<Fixture> & { id: string }): Fixture {
  return {
    firstName: overrides.id,
    lastName: 'Player',
    position: null,
    status: 'available',
    squadNumber: null,
    appearances: 0,
    goals: 0,
    assists: 0,
    ...overrides,
  };
}

/** A full 4-3-3 squad, one athlete exactly matching each slot. */
function fourThreeThreeSquad(): Fixture[] {
  return [
    makeAthlete({
      id: 'gk',
      firstName: 'Alex',
      lastName: 'Keeper',
      position: 'GK',
    }),
    makeAthlete({
      id: 'lb',
      firstName: 'Lee',
      lastName: 'Back',
      position: 'LB',
    }),
    makeAthlete({
      id: 'cb1',
      firstName: 'Cam',
      lastName: 'Bailey',
      position: 'CB',
    }),
    makeAthlete({
      id: 'cb2',
      firstName: 'Chris',
      lastName: 'Baker',
      position: 'CB',
    }),
    makeAthlete({
      id: 'rb',
      firstName: 'Ray',
      lastName: 'Bryant',
      position: 'RB',
    }),
    makeAthlete({
      id: 'cm1',
      firstName: 'Cody',
      lastName: 'Mills',
      position: 'CM',
    }),
    makeAthlete({
      id: 'cm2',
      firstName: 'Carl',
      lastName: 'Moss',
      position: 'CM',
    }),
    makeAthlete({
      id: 'cm3',
      firstName: 'Cole',
      lastName: 'Munro',
      position: 'CM',
    }),
    makeAthlete({
      id: 'lw',
      firstName: 'Liam',
      lastName: 'Wing',
      position: 'LW',
    }),
    makeAthlete({
      id: 'st',
      firstName: 'Sam',
      lastName: 'Daniels',
      position: 'ST',
      goals: 12,
      assists: 4,
      appearances: 20,
    }),
    makeAthlete({
      id: 'rw',
      firstName: 'Rio',
      lastName: 'Wells',
      position: 'RW',
    }),
  ];
}

describe('LineupAssistant', () => {
  let assistant: LineupAssistant;
  let athletesService: { findAll: jest.Mock };
  let gamePlansService: { findAll: jest.Mock };

  beforeEach(async () => {
    athletesService = {
      findAll: jest.fn().mockResolvedValue(fourThreeThreeSquad()),
    };
    gamePlansService = { findAll: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LineupAssistant,
        { provide: AthletesService, useValue: athletesService },
        { provide: GamePlansService, useValue: gamePlansService },
      ],
    }).compile();

    assistant = module.get(LineupAssistant);
  });

  it('asks which formation to use when none is given, offering formation options', async () => {
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Suggest my best lineup',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/which formation/i);
    expect(result.formationOptions?.map((f) => f.id)).toContain('4-3-3');
  });

  it('builds a full, real-data suggestion once a formation is named', async () => {
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Suggest my best lineup in a 4-3-3',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedAction?.type).toBe('APPLY_LINEUP_SUGGESTION');
    expect(result.proposedAction?.displaySummary).toHaveLength(11);
    const striker = result.proposedAction?.displaySummary.find(
      (row) => row.label === 'ST',
    );
    expect(striker?.value).toMatch(/Sam Daniels/);
  });

  it('resolves a bare formation reply after being asked', async () => {
    const state = freshState();
    await assistant.handleMessage(state, 'suggest a lineup', 'team-1');
    expect(state.collectedFields.awaitingFormation).toBe(true);

    const result = await assistant.handleMessage(state, '4-3-3', 'team-1');

    expect(result.requiresConfirmation).toBe(true);
    expect(state.collectedFields.formationId).toBe('4-3-3');
  });

  it('explains a selection using only the stored reason, and keeps the proposal attached', async () => {
    const state = freshState();
    await assistant.handleMessage(state, 'Suggest a 4-3-3', 'team-1');

    const result = await assistant.handleMessage(
      state,
      'why Daniels?',
      'team-1',
    );

    expect(result.reply).toMatch(/Sam Daniels was selected because/i);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedAction?.type).toBe('APPLY_LINEUP_SUGGESTION');
  });

  it('excludes a named player and regenerates without them', async () => {
    const state = freshState();
    await assistant.handleMessage(state, 'Suggest a 4-3-3', 'team-1');

    const result = await assistant.handleMessage(
      state,
      'exclude Daniels',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(true);
    const assignments = result.proposedAction?.payload.assignments as Record<
      string,
      string | null
    >;
    expect(Object.values(assignments)).not.toContain('st');
  });

  it('compares two named players using only their real recorded stats', async () => {
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'Compare Daniels and Wells',
      'team-1',
    );

    expect(result.reply).toMatch(/Sam Daniels/);
    expect(result.reply).toMatch(/Rio Wells/);
    expect(result.reply).toMatch(/12 goals/);
  });

  it('falls back with a helpful message for an unrecognized request', async () => {
    const state = freshState();

    const result = await assistant.handleMessage(
      state,
      'draft a press release',
      'team-1',
    );

    expect(result.requiresConfirmation).toBe(false);
    expect(result.reply).toMatch(/i can suggest a starting xi/i);
  });

  describe('execute', () => {
    it('rejects a lineup referencing a player no longer on the squad', async () => {
      await expect(
        assistant.execute('team-1', {
          formationId: '4-3-3',
          assignments: { '433-gk': 'not-on-squad' },
          substituteIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a lineup starting a now-injured player', async () => {
      athletesService.findAll.mockResolvedValue([
        makeAthlete({ id: 'gk', position: 'GK', status: 'injured' }),
      ]);

      await expect(
        assistant.execute('team-1', {
          formationId: '4-3-3',
          assignments: { '433-gk': 'gk' },
          substituteIds: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns the applied lineup unchanged for a valid squad, without writing anything', async () => {
      const result = await assistant.execute('team-1', {
        formationId: '4-3-3',
        assignments: { '433-gk': 'gk' },
        substituteIds: ['lw'],
      });

      expect(result.appliedLineup).toEqual({
        formationId: '4-3-3',
        assignments: { '433-gk': 'gk' },
        substituteIds: ['lw'],
      });
      expect(result.entityType).toBe('lineup');
    });
  });

  describe('adjusting a proposal', () => {
    /** Produces a state that already holds a 4-3-3 proposal. */
    const withProposal = async () => {
      const state = freshState();
      await assistant.handleMessage(state, 'suggest a 4-3-3 lineup', 'team-1');
      return state;
    };

    it('swaps a starter out for a named replacement', async () => {
      const state = await withProposal();

      const result = await assistant.handleMessage(
        state,
        'swap Sam Daniels for Rio Wells',
        'team-1',
      );

      expect(state.collectedFields.excludeAthleteIds).toContain('st');
      expect(state.collectedFields.preferredAthleteIdBySlotLabel).toMatchObject(
        { ST: 'rw' },
      );
      expect(result.requiresConfirmation).toBe(true);
    });

    it('explains that a player outside the lineup cannot be swapped out', async () => {
      athletesService.findAll.mockResolvedValue([
        ...fourThreeThreeSquad(),
        makeAthlete({ id: 'sub', firstName: 'Benny', lastName: 'Bench' }),
      ]);
      const state = await withProposal();

      const result = await assistant.handleMessage(
        state,
        'swap Benny Bench for Rio Wells',
        'team-1',
      );

      expect(result.reply).toContain('currently in the suggested lineup');
    });

    it('asks for a formation when a swap arrives with no proposal yet', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'swap Sam Daniels for Rio Wells',
        'team-1',
      );

      expect(result.reply).toBe('Which formation would you like to use?');
      expect(result.formationOptions?.length).toBeGreaterThan(0);
    });

    it('reports when neither side of a swap is on the squad', async () => {
      const state = await withProposal();

      const result = await assistant.handleMessage(
        state,
        'swap Nobody Here for Someone Else',
        'team-1',
      );

      expect(result.reply).toContain('find both players');
    });

    it('pins a player to a named slot', async () => {
      const state = await withProposal();

      await assistant.handleMessage(
        state,
        'put Rio Wells at striker',
        'team-1',
      );

      expect(state.collectedFields.preferredAthleteIdBySlotLabel).toMatchObject(
        { ST: 'rw' },
      );
    });

    it('clears an earlier exclusion when the same player is pinned to a slot', async () => {
      const state = await withProposal();
      await assistant.handleMessage(state, 'exclude Rio Wells', 'team-1');
      expect(state.collectedFields.excludeAthleteIds).toContain('rw');

      await assistant.handleMessage(state, 'play Rio Wells as ST', 'team-1');

      expect(state.collectedFields.excludeAthleteIds).not.toContain('rw');
    });

    it('rejects a slot label the formation does not have', async () => {
      const state = await withProposal();

      const result = await assistant.handleMessage(
        state,
        'put Rio Wells at sweeper',
        'team-1',
      );

      expect(result.reply).toContain('recognize');
    });

    it('reports an unknown player in a pin request', async () => {
      const state = await withProposal();

      const result = await assistant.handleMessage(
        state,
        'put Nobody Here at striker',
        'team-1',
      );

      expect(result.reply).toContain('find that player on your squad');
    });

    it('asks for a formation before pinning when none is chosen', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'put Rio Wells at striker',
        'team-1',
      );

      expect(result.reply).toBe('Which formation would you like to use?');
    });

    it('asks who to exclude when no squad member is named', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'exclude Nobody Here',
        'team-1',
      );

      expect(result.reply).toContain('like to exclude');
    });

    it('accumulates exclusions across turns', async () => {
      const state = await withProposal();

      await assistant.handleMessage(state, 'exclude Rio Wells', 'team-1');
      await assistant.handleMessage(state, 'rest Liam Wing', 'team-1');

      expect(state.collectedFields.excludeAthleteIds).toEqual(
        expect.arrayContaining(['rw', 'lw']),
      );
    });

    it('asks for a formation when excluding before one is chosen', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'exclude Rio Wells',
        'team-1',
      );

      expect(result.reply).toBe('Which formation would you like to use?');
    });
  });

  describe('understanding the request', () => {
    it.each([
      ['433', '4-3-3'],
      ['four three three', '4-3-3'],
      ['442', '4-4-2'],
      ['4231', '4-2-3-1'],
      ['3-5-2', '3-5-2'],
      ['five four one', '5-4-1'],
    ])('reads %p as the %s formation', async (text, expected) => {
      const state = freshState();

      const result = await assistant.handleMessage(
        state,
        `set up a ${text}`,
        'team-1',
      );

      expect(state.collectedFields.formationId).toBe(expected);
      expect(result.reply).toContain(expected);
    });

    it.each([
      'suggest my best lineup',
      'recommend a starting XI',
      'pick my team',
      'generate a lineup',
    ])('treats %p as a suggestion request', async (message) => {
      const result = await assistant.handleMessage(
        freshState(),
        message,
        'team-1',
      );

      expect(result.reply).toBe('Which formation would you like to use?');
    });

    it('asks which player to explain when none is named', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'why?',
        'team-1',
      );

      expect(result.reply).toBe('Which player would you like me to explain?');
    });

    it('says a player is not in the lineup when asked why without a proposal', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'why Sam Daniels?',
        'team-1',
      );

      expect(result.reply).toContain('part of the current suggested lineup');
    });

    it('asks for two names when a comparison mentions only one', async () => {
      const result = await assistant.handleMessage(
        freshState(),
        'compare Sam Daniels',
        'team-1',
      );

      expect(result.reply).toBe('Which two players would you like to compare?');
    });

    it('keeps the live proposal attached to an off-topic reply', async () => {
      const state = freshState();
      await assistant.handleMessage(state, 'suggest a 4-3-3 lineup', 'team-1');

      const result = await assistant.handleMessage(
        state,
        'what is the weather like',
        'team-1',
      );

      expect(result.requiresConfirmation).toBe(true);
      expect(result.proposedAction?.type).toBe('APPLY_LINEUP_SUGGESTION');
    });

    it('still suggests when the saved game plan cannot be read', async () => {
      gamePlansService.findAll.mockRejectedValue(new Error('unavailable'));

      const result = await assistant.handleMessage(
        freshState(),
        'suggest a 4-3-3 lineup',
        'team-1',
      );

      expect(result.proposedAction?.type).toBe('APPLY_LINEUP_SUGGESTION');
    });

    it('carries a saved game plan into the suggestion', async () => {
      gamePlansService.findAll.mockResolvedValue([
        { assignments: { '433-gk': 'gk' }, substituteIds: ['lw'] },
      ]);

      const result = await assistant.handleMessage(
        freshState(),
        'suggest a 4-3-3 lineup',
        'team-1',
      );

      expect(result.proposedAction?.type).toBe('APPLY_LINEUP_SUGGESTION');
      expect(gamePlansService.findAll).toHaveBeenCalledWith('team-1');
    });
  });
});
