"use strict";

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableValue(value));
}

function sameNullable(left, right) {
  return (left ?? null) === (right ?? null);
}

function areCandidateObservations(left, right, windowMs = 5000) {
  return (
    left.id !== right.id &&
    left.matchId === right.matchId &&
    left.period === right.period &&
    left.eventType === right.eventType &&
    left.team === right.team &&
    sameNullable(left.athleteId, right.athleteId) &&
    sameNullable(left.opponentPlayerId, right.opponentPlayerId) &&
    sameNullable(left.opponentLabel, right.opponentLabel) &&
    Math.abs(left.matchElapsedMs - right.matchElapsedMs) <= windowMs
  );
}

function projectCanonicalEvents(events) {
  const effective = events.filter((event) => event.lifecycleStatus !== "voided");
  const confirmed = effective.filter(
    (event) => event.lifecycleStatus === "confirmed",
  );
  const ambiguous = effective.filter(
    (event) => event.lifecycleStatus === "needs_review",
  );
  const count = (rows, team, eventType) =>
    rows.filter((event) => event.team === team && event.eventType === eventType)
      .length;
  return {
    confirmedTeamScore: count(confirmed, "own", "goal"),
    confirmedOpponentScore: count(confirmed, "opponent", "goal"),
    provisionalTeamScore: count(effective, "own", "goal"),
    provisionalOpponentScore: count(effective, "opponent", "goal"),
    possibleEffects: {
      teamGoals: count(ambiguous, "own", "goal"),
      opponentGoals: count(ambiguous, "opponent", "goal"),
      disciplinaryEvents: ambiguous.filter((event) =>
        ["yellow_card", "red_card"].includes(event.eventType),
      ).length,
    },
    disciplinaryProjection: {
      ownYellowCards: count(effective, "own", "yellow_card"),
      ownRedCards: count(effective, "own", "red_card"),
      opponentYellowCards: count(effective, "opponent", "yellow_card"),
      opponentRedCards: count(effective, "opponent", "red_card"),
    },
  };
}

function pairKey(left, right) {
  return [left, right].sort().join(":");
}

function reconcileMatch({ observations, operations = [], candidateWindowMs = 5000 }) {
  const orderedObservations = [...observations].sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const orderedOperations = [...operations].sort((a, b) => a.id.localeCompare(b.id));
  const observationIds = new Set(orderedObservations.map((item) => item.id));
  const operationById = new Map(orderedOperations.map((item) => [item.id, item]));
  const pendingOperationIds = orderedOperations
    .filter((operation) =>
      (operation.causalParentIds ?? []).some((id) => !operationById.has(id)),
    )
    .map((operation) => operation.id);
  const pending = new Set(pendingOperationIds);
  const ready = orderedOperations.filter((operation) => !pending.has(operation.id));

  const superseded = new Set();
  for (const operation of ready) {
    if (operation.operationType !== "resolve_conflict") continue;
    for (const id of operation.decision?.supersedes ?? []) superseded.add(id);
  }

  function isAncestor(possibleAncestorId, operation) {
    const stack = [...(operation.causalParentIds ?? [])];
    const visited = new Set();
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === possibleAncestorId) return true;
      if (!current || visited.has(current)) continue;
      visited.add(current);
      stack.push(...(operationById.get(current)?.causalParentIds ?? []));
    }
    return false;
  }

  const actionable = ready.filter(
    (operation) =>
      operation.operationType !== "resolve_conflict" && !superseded.has(operation.id),
  );
  const conflictSets = [];
  const conflicted = new Set();
  for (let leftIndex = 0; leftIndex < actionable.length; leftIndex += 1) {
    const left = actionable[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < actionable.length; rightIndex += 1) {
      const right = actionable[rightIndex];
      if (
        isAncestor(left.id, right) ||
        isAncestor(right.id, left) ||
        !left.targetObservationIds.some((id) => right.targetObservationIds.includes(id)) ||
        (left.operationType === right.operationType &&
          stableStringify(left.decision ?? {}) === stableStringify(right.decision ?? {}))
      ) {
        continue;
      }
      const ids = [left.id, right.id].sort();
      conflictSets.push(ids);
      ids.forEach((id) => conflicted.add(id));
    }
  }

  const parent = new Map(orderedObservations.map((item) => [item.id, item.id]));
  const find = (id) => {
    const current = parent.get(id);
    if (!current || current === id) return current;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (!leftRoot || !rightRoot || leftRoot === rightRoot) return;
    const [winner, loser] = [leftRoot, rightRoot].sort();
    parent.set(loser, winner);
  };

  const separated = new Set();
  for (const operation of actionable) {
    if (conflicted.has(operation.id) || operation.operationType !== "separate") continue;
    for (let index = 0; index < operation.targetObservationIds.length; index += 1) {
      for (let other = index + 1; other < operation.targetObservationIds.length; other += 1) {
        separated.add(
          pairKey(operation.targetObservationIds[index], operation.targetObservationIds[other]),
        );
      }
    }
  }

  const mergeAnchor = new Map();
  for (const operation of actionable) {
    if (conflicted.has(operation.id) || operation.operationType !== "merge") continue;
    const targets = operation.targetObservationIds.filter((id) => observationIds.has(id));
    if (
      targets.some((left) =>
        targets.some((right) => left !== right && separated.has(pairKey(left, right))),
      )
    ) {
      continue;
    }
    for (const target of targets.slice(1)) union(targets[0], target);
    for (const target of targets) mergeAnchor.set(target, operation.id);
  }

  const candidateEdges = [];
  for (let left = 0; left < orderedObservations.length; left += 1) {
    for (let right = left + 1; right < orderedObservations.length; right += 1) {
      const a = orderedObservations[left];
      const b = orderedObservations[right];
      if (areCandidateObservations(a, b, candidateWindowMs)) candidateEdges.push([a.id, b.id]);
    }
  }
  const candidateGroups = candidateEdges.map((edge) => [...edge].sort());

  const corrections = new Map();
  const voided = new Set();
  const appliedOperationIds = [];
  for (const operation of actionable) {
    if (conflicted.has(operation.id)) continue;
    appliedOperationIds.push(operation.id);
    if (operation.operationType === "correct") {
      for (const target of operation.targetObservationIds) {
        corrections.set(target, operation.decision?.replacement ?? operation.decision ?? {});
      }
    }
    if (operation.operationType === "void") {
      operation.targetObservationIds.forEach((id) => voided.add(id));
    }
  }

  const components = new Map();
  for (const observation of orderedObservations) {
    const root = find(observation.id);
    const rows = components.get(root) ?? [];
    rows.push(observation);
    components.set(root, rows);
  }
  const events = [...components.values()].map((rows) => {
    const observationIdsForEvent = rows.map((row) => row.id).sort();
    const anchor = observationIdsForEvent
      .map((id) => mergeAnchor.get(id))
      .filter(Boolean)
      .sort()[0];
    let event = { ...rows[0] };
    for (const id of observationIdsForEvent) {
      if (corrections.has(id)) event = { ...event, ...corrections.get(id) };
    }
    const unresolvedCandidate = candidateEdges.some(
      ([left, right]) =>
        observationIdsForEvent.includes(left) !== observationIdsForEvent.includes(right) &&
        !separated.has(pairKey(left, right)),
    );
    const hasConflict = conflictSets.some((ids) =>
      ids.some((operationId) =>
        operationById
          .get(operationId)
          ?.targetObservationIds.some((id) => observationIdsForEvent.includes(id)),
      ),
    );
    return {
      ...event,
      id: anchor ?? observationIdsForEvent[0],
      observationIds: observationIdsForEvent,
      lifecycleStatus: observationIdsForEvent.some((id) => voided.has(id))
        ? "voided"
        : unresolvedCandidate || hasConflict
          ? "needs_review"
          : anchor
            ? "confirmed"
            : "provisional",
    };
  });
  events.sort((a, b) => a.id.localeCompare(b.id));
  conflictSets.sort((a, b) => a.join(":").localeCompare(b.join(":")));
  const projection = projectCanonicalEvents(events);
  return {
    events,
    candidateGroups,
    conflicts: conflictSets,
    pendingOperationIds,
    appliedOperationIds: appliedOperationIds.sort(),
    projection,
    digestInput: stableStringify({
      observations: orderedObservations,
      operations: orderedOperations,
      candidateWindowMs,
      events,
      conflicts: conflictSets,
    }),
  };
}

module.exports = {
  areCandidateObservations,
  projectCanonicalEvents,
  reconcileMatch,
  stableStringify,
};
