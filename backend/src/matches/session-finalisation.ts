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
  if (state.finalisedAt) return false;
  if (state.homeConfirmedAt && state.awayConfirmedAt) return true;
  const firstConfirmation = state.homeConfirmedAt ?? state.awayConfirmedAt;
  return Boolean(
    firstConfirmation &&
    now.getTime() - firstConfirmation.getTime() >= 24 * 60 * 60 * 1000,
  );
}

export function sessionHasTimedOutConfirmation(
  state: SessionConfirmations,
  now: Date,
): boolean {
  if (
    state.finalisedAt ||
    Boolean(state.homeConfirmedAt) === Boolean(state.awayConfirmedAt)
  )
    return false;
  const confirmedAt = state.homeConfirmedAt ?? state.awayConfirmedAt;
  return Boolean(
    confirmedAt && now.getTime() - confirmedAt.getTime() >= 24 * 60 * 60 * 1000,
  );
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
