import {
  canPublishSessionFixtureResult,
  fixtureResultSourceMatches,
  reopenSessionConfirmations,
  shouldFinaliseSession,
  sessionHasTimedOutConfirmation,
} from './session-finalisation';

describe('two-sided result confirmation', () => {
  const now = new Date('2026-10-02T12:00:00.000Z');

  it('finalises when both sides confirm', () => {
    expect(
      shouldFinaliseSession(
        {
          homeConfirmedAt: new Date(now.getTime() - 1000),
          awayConfirmedAt: now,
          finalisedAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it('finalises one confirmation after the 24-hour response window', () => {
    const state = {
      homeConfirmedAt: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      awayConfirmedAt: null,
      finalisedAt: null,
    };
    expect(shouldFinaliseSession(state, now)).toBe(true);
    expect(sessionHasTimedOutConfirmation(state, now)).toBe(true);
    expect(
      sessionHasTimedOutConfirmation(
        { ...state, homeConfirmedAt: new Date(now.getTime() - 1) },
        now,
      ),
    ).toBe(false);
  });

  it('does not finalise early and permits reopening before finalisation', () => {
    expect(
      shouldFinaliseSession(
        {
          homeConfirmedAt: new Date(now.getTime() - 23 * 60 * 60 * 1000),
          awayConfirmedAt: null,
          finalisedAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      reopenSessionConfirmations({
        homeConfirmedAt: new Date(now.getTime() - 1000),
        awayConfirmedAt: null,
        finalisedAt: null,
      }),
    ).toEqual({
      homeConfirmedAt: null,
      awayConfirmedAt: null,
      finalisedAt: null,
    });
    expect(
      shouldFinaliseSession(
        {
          homeConfirmedAt: null,
          awayConfirmedAt: null,
          finalisedAt: null,
        },
        now,
      ),
    ).toBe(false);
  });

  it('does not publish a final result more than once', () => {
    expect(
      shouldFinaliseSession(
        {
          homeConfirmedAt: now,
          awayConfirmedAt: now,
          finalisedAt: now,
        },
        now,
      ),
    ).toBe(false);
  });

  it('publishes generated competition fixtures only, never friendlies', () => {
    expect(
      canPublishSessionFixtureResult({
        stage: 'generated',
        competitionId: 'cup',
      }),
    ).toBe(true);
    expect(
      canPublishSessionFixtureResult({
        stage: 'friendly',
        competitionId: null,
      }),
    ).toBe(false);
  });

  it('matches live result retries to the fixture session identity', () => {
    const fixture = {
      linkedMatchId: 'home-sheet',
      sharedSessionId: 'session-1',
    };
    expect(
      fixtureResultSourceMatches(fixture, {
        kind: 'live',
        id: 'away-sheet',
        sessionId: 'session-1',
      }),
    ).toBe(true);
    expect(
      fixtureResultSourceMatches(fixture, {
        kind: 'live',
        id: 'away-sheet',
        sessionId: 'session-2',
      }),
    ).toBe(false);
  });
});
