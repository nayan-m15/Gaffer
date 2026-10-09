import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TeamsService } from '../teams/teams.service';
import { AiAssistantService } from './ai-assistant.service';
import { CompetitionsAssistant } from './competitions-assistant';
import { ConversationStore } from './conversation-store';
import { InjuriesAssistant } from './injuries-assistant';
import { LineupAssistant } from './lineup-assistant';
import { RosterAssistant } from './roster-assistant';

const conversationId = '11111111-1111-1111-1111-111111111111';

/**
 * The confirm/cancel state machine is the safety-critical part of the
 * assistant: a chat message must never trigger a write, and only an
 * explicit `confirm` call may. Uses a real `ConversationStore` (it's a
 * simple in-memory map) so these tests exercise actual state persistence
 * across calls, with the per-context assistants mocked since they have
 * their own dedicated spec files.
 */
describe('AiAssistantService', () => {
  let service: AiAssistantService;
  let teamsService: { findTeamForUser: jest.Mock; requireCoachTeam: jest.Mock };
  let rosterAssistant: {
    handleMessage: jest.Mock;
    execute: jest.Mock;
    executeUpdate: jest.Mock;
  };
  let injuriesAssistant: { handleMessage: jest.Mock; execute: jest.Mock };
  let competitionsAssistant: {
    handleMessage: jest.Mock;
    execute: jest.Mock;
    executeAddTeam: jest.Mock;
  };
  let lineupAssistant: { handleMessage: jest.Mock; execute: jest.Mock };

  beforeEach(async () => {
    teamsService = {
      findTeamForUser: jest
        .fn()
        .mockResolvedValue({ id: 'team-1', role: 'coach' }),
      requireCoachTeam: jest
        .fn()
        .mockResolvedValue({ id: 'team-1', role: 'coach' }),
    };
    rosterAssistant = {
      handleMessage: jest.fn(),
      execute: jest.fn(),
      executeUpdate: jest.fn(),
    };
    injuriesAssistant = { handleMessage: jest.fn(), execute: jest.fn() };
    competitionsAssistant = {
      handleMessage: jest.fn(),
      execute: jest.fn(),
      executeAddTeam: jest.fn(),
    };
    lineupAssistant = { handleMessage: jest.fn(), execute: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiAssistantService,
        ConversationStore,
        { provide: TeamsService, useValue: teamsService },
        { provide: RosterAssistant, useValue: rosterAssistant },
        { provide: InjuriesAssistant, useValue: injuriesAssistant },
        { provide: CompetitionsAssistant, useValue: competitionsAssistant },
        { provide: LineupAssistant, useValue: lineupAssistant },
      ],
    }).compile();

    service = module.get(AiAssistantService);
  });

  it('rejects confirm when nothing has been proposed yet', async () => {
    await expect(
      service.confirm('user-1', { conversationId, context: 'roster' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('never writes anything from a chat message alone, even one requiring confirmation', async () => {
    rosterAssistant.handleMessage.mockResolvedValue({
      reply: 'Please confirm...',
      requiresConfirmation: true,
      proposedAction: {
        type: 'CREATE_PLAYER',
        payload: { firstName: 'Daniel', lastName: 'Nkosi' },
        displaySummary: [],
      },
    });

    const response = await service.handleMessage('user-1', {
      conversationId,
      context: 'roster',
      message: 'Daniel Nkosi',
    });

    expect(response.requiresConfirmation).toBe(true);
    expect(response.status).toBe('review');
    expect(rosterAssistant.execute).not.toHaveBeenCalled();
  });

  it('executes the proposed action only once confirm is called, resolving a coach-only team', async () => {
    rosterAssistant.handleMessage.mockResolvedValue({
      reply: 'Please confirm...',
      requiresConfirmation: true,
      proposedAction: {
        type: 'CREATE_PLAYER',
        payload: { firstName: 'Daniel', lastName: 'Nkosi' },
        displaySummary: [],
      },
    });
    rosterAssistant.execute.mockResolvedValue({
      reply: 'Daniel Nkosi has been added.',
      entityType: 'player',
      entityId: 'athlete-1',
      entityLabel: 'Daniel Nkosi',
    });

    await service.handleMessage('user-1', {
      conversationId,
      context: 'roster',
      message: 'Daniel Nkosi',
    });
    const response = await service.confirm('user-1', {
      conversationId,
      context: 'roster',
    });

    expect(teamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
    expect(rosterAssistant.execute).toHaveBeenCalledWith('team-1', {
      firstName: 'Daniel',
      lastName: 'Nkosi',
    });
    expect(response.status).toBe('completed');
    expect(response.createdEntity).toEqual({
      type: 'player',
      id: 'athlete-1',
      label: 'Daniel Nkosi',
    });

    // The proposal was consumed — confirming again has nothing to act on.
    await expect(
      service.confirm('user-1', { conversationId, context: 'roster' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps the draft alive and returns a friendly message when confirm fails', async () => {
    rosterAssistant.handleMessage.mockResolvedValue({
      reply: 'Please confirm...',
      requiresConfirmation: true,
      proposedAction: {
        type: 'CREATE_PLAYER',
        payload: { firstName: 'Daniel', lastName: 'Nkosi' },
        displaySummary: [],
      },
    });
    teamsService.requireCoachTeam.mockRejectedValue(
      new ForbiddenException('Only coaches can perform this action.'),
    );

    await service.handleMessage('user-1', {
      conversationId,
      context: 'roster',
      message: 'Daniel Nkosi',
    });
    const response = await service.confirm('user-1', {
      conversationId,
      context: 'roster',
    });

    expect(response.status).toBe('collecting');
    expect(response.message).toMatch(/only coaches can perform this action/i);
    expect(rosterAssistant.execute).not.toHaveBeenCalled();
  });

  it('cancel clears the draft so a later confirm has nothing to act on', async () => {
    rosterAssistant.handleMessage.mockResolvedValue({
      reply: 'Please confirm...',
      requiresConfirmation: true,
      proposedAction: {
        type: 'CREATE_PLAYER',
        payload: {},
        displaySummary: [],
      },
    });

    await service.handleMessage('user-1', {
      conversationId,
      context: 'roster',
      message: 'Daniel Nkosi',
    });
    const cancelResponse = service.cancel('user-1', {
      conversationId,
      context: 'roster',
    });

    expect(cancelResponse.status).toBe('collecting');
    expect(cancelResponse.message).toMatch(/cancelled/i);
    await expect(
      service.confirm('user-1', { conversationId, context: 'roster' }),
    ).rejects.toThrow(BadRequestException);
    expect(rosterAssistant.execute).not.toHaveBeenCalled();
  });

  it('dispatches the lineup context to LineupAssistant and applies it only on confirm', async () => {
    lineupAssistant.handleMessage.mockResolvedValue({
      reply: 'Here is a suggested 4-3-3 lineup...',
      requiresConfirmation: true,
      proposedAction: {
        type: 'APPLY_LINEUP_SUGGESTION',
        payload: {
          formationId: '4-3-3',
          assignments: { '433-gk': 'athlete-1' },
          substituteIds: [],
        },
        displaySummary: [{ label: 'GK', value: 'Alex Keeper' }],
      },
    });
    lineupAssistant.execute.mockResolvedValue({
      reply: 'The 4-3-3 lineup has been loaded onto the tactical board.',
      entityType: 'lineup',
      entityId: '4-3-3',
      entityLabel: '4-3-3 lineup',
      appliedLineup: {
        formationId: '4-3-3',
        assignments: { '433-gk': 'athlete-1' },
        substituteIds: [],
      },
    });

    const messageResponse = await service.handleMessage('user-1', {
      conversationId,
      context: 'lineup',
      message: 'Suggest my best lineup in a 4-3-3',
    });
    expect(messageResponse.requiresConfirmation).toBe(true);
    expect(lineupAssistant.execute).not.toHaveBeenCalled();

    const confirmResponse = await service.confirm('user-1', {
      conversationId,
      context: 'lineup',
    });

    expect(teamsService.requireCoachTeam).toHaveBeenCalledWith('user-1');
    expect(lineupAssistant.execute).toHaveBeenCalledWith('team-1', {
      formationId: '4-3-3',
      assignments: { '433-gk': 'athlete-1' },
      substituteIds: [],
    });
    expect(confirmResponse.appliedLineup).toEqual({
      formationId: '4-3-3',
      assignments: { '433-gk': 'athlete-1' },
      substituteIds: [],
    });
  });

  describe('routing a chat message', () => {
    const reply = {
      reply: 'ok',
      requiresConfirmation: false,
      proposedAction: undefined,
    };

    it.each([
      ['roster', () => rosterAssistant],
      ['injuries', () => injuriesAssistant],
      ['lineup', () => lineupAssistant],
    ])('sends a %s message to its own assistant', async (context, get) => {
      get().handleMessage.mockResolvedValue(reply);

      await service.handleMessage('user-1', {
        conversationId,
        context: context as never,
        message: 'hello',
      });

      expect(get().handleMessage).toHaveBeenCalledWith(
        expect.anything(),
        'hello',
        'team-1',
      );
    });

    it('sends a competitions message with the competition id, not the team', async () => {
      competitionsAssistant.handleMessage.mockResolvedValue(reply);

      await service.handleMessage('user-1', {
        conversationId,
        context: 'competitions',
        message: 'add a team',
        competitionId: 'competition-1',
      });

      expect(competitionsAssistant.handleMessage).toHaveBeenCalledWith(
        expect.anything(),
        'add a team',
        'competition-1',
      );
    });

    it('starts a fresh draft once a conversation has completed', async () => {
      rosterAssistant.handleMessage.mockResolvedValue({
        reply: 'Ready?',
        requiresConfirmation: true,
        proposedAction: { type: 'CREATE_PLAYER', payload: {} },
      });
      rosterAssistant.execute.mockResolvedValue({
        reply: 'Added.',
        entityType: 'athlete',
        entityId: 'athlete-1',
        entityLabel: 'Sam',
      });

      await service.handleMessage('user-1', {
        conversationId,
        context: 'roster',
        message: 'add Sam',
      });
      await service.confirm('user-1', { conversationId, context: 'roster' });

      // The completed state must not leak into the next message.
      rosterAssistant.handleMessage.mockResolvedValue({
        reply: 'What is the name?',
        requiresConfirmation: false,
      });
      const next = await service.handleMessage('user-1', {
        conversationId,
        context: 'roster',
        message: 'add another',
      });

      expect(next.status).toBe('collecting');
      expect(next.requiresConfirmation).toBe(false);
    });
  });

  describe('confirming each action type', () => {
    const propose = async (type: string, context = 'roster') => {
      const assistant =
        context === 'roster'
          ? rosterAssistant
          : context === 'injuries'
            ? injuriesAssistant
            : competitionsAssistant;
      assistant.handleMessage.mockResolvedValue({
        reply: 'Ready?',
        requiresConfirmation: true,
        proposedAction: { type, payload: { some: 'payload' } },
      });
      await service.handleMessage('user-1', {
        conversationId,
        context: context as never,
        message: 'go',
      });
    };

    const execResult = (entityType: string) => ({
      reply: 'Done.',
      entityType,
      entityId: 'entity-1',
      entityLabel: 'Entity',
    });

    it('routes UPDATE_PLAYER to the roster assistant update path', async () => {
      rosterAssistant.executeUpdate.mockResolvedValue(execResult('athlete'));
      await propose('UPDATE_PLAYER');

      const result = await service.confirm('user-1', {
        conversationId,
        context: 'roster',
      });

      expect(rosterAssistant.executeUpdate).toHaveBeenCalledWith('team-1', {
        some: 'payload',
      });
      expect(result.status).toBe('completed');
    });

    it('routes CREATE_INJURY with the acting user', async () => {
      injuriesAssistant.execute.mockResolvedValue(execResult('injury'));
      await propose('CREATE_INJURY', 'injuries');

      await service.confirm('user-1', {
        conversationId,
        context: 'injuries',
      });

      expect(injuriesAssistant.execute).toHaveBeenCalledWith(
        'team-1',
        'user-1',
        { some: 'payload' },
      );
    });

    it.each(['CREATE_LEAGUE', 'CREATE_COMPETITION'])(
      'routes %s to the competitions assistant',
      async (type) => {
        competitionsAssistant.execute.mockResolvedValue(
          execResult('competition'),
        );
        await propose(type, 'competitions');

        await service.confirm('user-1', {
          conversationId,
          context: 'competitions',
        });

        expect(competitionsAssistant.execute).toHaveBeenCalledWith('user-1', {
          some: 'payload',
        });
      },
    );

    it('routes ADD_COMPETITION_TEAM to its own executor', async () => {
      competitionsAssistant.executeAddTeam.mockResolvedValue(
        execResult('competitionTeam'),
      );
      await propose('ADD_COMPETITION_TEAM', 'competitions');

      await service.confirm('user-1', {
        conversationId,
        context: 'competitions',
      });

      expect(competitionsAssistant.executeAddTeam).toHaveBeenCalledWith(
        'user-1',
        { some: 'payload' },
      );
    });

    it('returns a friendly message for an unsupported action type', async () => {
      await propose('DELETE_EVERYTHING');

      const result = await service.confirm('user-1', {
        conversationId,
        context: 'roster',
      });

      expect(result.message).toBe('Unsupported action type.');
      expect(result.status).toBe('collecting');
    });
  });

  describe('reporting a failed write', () => {
    const proposeAndFail = async (failure: unknown) => {
      rosterAssistant.handleMessage.mockResolvedValue({
        reply: 'Ready?',
        requiresConfirmation: true,
        proposedAction: { type: 'CREATE_PLAYER', payload: {} },
      });
      rosterAssistant.execute.mockRejectedValue(failure);
      await service.handleMessage('user-1', {
        conversationId,
        context: 'roster',
        message: 'add Sam',
      });
      return service.confirm('user-1', { conversationId, context: 'roster' });
    };

    it('surfaces a plain string response from an HTTP error', async () => {
      const result = await proposeAndFail(
        new BadRequestException('Squad number already taken.'),
      );

      expect(result.message).toBe('Squad number already taken.');
    });

    it('surfaces the first message of a validation error array', async () => {
      const result = await proposeAndFail(
        new BadRequestException({
          message: ['First name is required.', 'Last name is required.'],
          statusCode: 400,
        }),
      );

      expect(result.message).toBe('First name is required.');
    });

    it('surfaces a forbidden error message', async () => {
      const result = await proposeAndFail(
        new ForbiddenException('Only coaches can add players.'),
      );

      expect(result.message).toBe('Only coaches can add players.');
    });

    it('falls back to a generic message for a non-HTTP failure', async () => {
      const result = await proposeAndFail(new Error('socket hang up'));

      expect(result.message).toContain('kept so you can try again');
    });

    it('keeps the draft collecting so the coach can retry', async () => {
      const result = await proposeAndFail(new Error('socket hang up'));

      expect(result.status).toBe('collecting');
      expect(result.requiresConfirmation).toBe(false);
    });
  });
});
