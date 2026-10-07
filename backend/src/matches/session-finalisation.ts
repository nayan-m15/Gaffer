export interface SessionConfirmations {
  homeConfirmedAt: Date | null;
  awayConfirmedAt: Date | null;
  finalisedAt: Date | null;
}

export function reopenSessionConfirmations(
  state: SessionConfirmations,
): SessionConfirmations {
  if (state.finalisedAt)
    throw new Error('A final session result cannot be reopened.');
  return { homeConfirmedAt: null, awayConfirmedAt: null, finalisedAt: null };
}

export function shouldFinaliseSession(
  state: SessionConfirmations,
  now: Date,
): boolean {
  void now;
  return (
    !state.finalisedAt &&
    Boolean(state.homeConfirmedAt && state.awayConfirmedAt)
  );
}

export function sessionHasTimedOutConfirmation(
  state: SessionConfirmations,
  now: Date,
): boolean {
  // Silence never approves a shared report. Existing callers remain compatible.
  void state;
  void now;
  return false;
}

export function canPublishSessionFixtureResult(fixture: {
  stage: string;
  competitionId: string | null;
  friendlyFixtureId?: string | null;
}): boolean {
  return (
    fixture.stage === 'generated' &&
    fixture.competitionId !== null &&
    !fixture.friendlyFixtureId
  );
}

export function fixtureResultSourceMatches(
  fixture: { linkedMatchId: string | null; sharedSessionId: string | null },
  source:
    | { kind: 'manual'; id: string }
    | { kind: 'live'; id: string; sessionId?: string },
): boolean {
  return source.kind === 'manual'
    ? fixture.linkedMatchId === source.id
    : fixture.linkedMatchId === source.id ||
        Boolean(
          source.sessionId && fixture.sharedSessionId === source.sessionId,
        );
}
