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
});
