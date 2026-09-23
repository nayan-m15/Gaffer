const assert = require("node:assert/strict");
const test = require("node:test");
const { reconcileMatch } = require("./index.cjs");

const observations = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    matchId: "20000000-0000-4000-8000-000000000001",
    period: "first_half",
    matchElapsedMs: 100000,
    eventType: "goal",
    team: "own",
    athleteId: "30000000-0000-4000-8000-000000000001",
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    matchId: "20000000-0000-4000-8000-000000000001",
    period: "first_half",
    matchElapsedMs: 103000,
    eventType: "goal",
    team: "own",
    athleteId: "30000000-0000-4000-8000-000000000001",
  },
];

function permutations(items) {
  if (items.length < 2) return [items];
  return items.flatMap((item, index) =>
    permutations(items.filter((_, candidate) => candidate !== index)).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

test("candidate observations remain separate and require review", () => {
  const result = reconcileMatch({ observations });
  assert.equal(result.events.length, 2);
  assert.equal(result.events.every((event) => event.lifecycleStatus === "needs_review"), true);
  assert.equal(result.projection.provisionalTeamScore, 2);
  assert.equal(result.projection.confirmedTeamScore, 0);
});

test("explicit merge converges for every observation arrival order", () => {
  const operation = {
    id: "40000000-0000-4000-8000-000000000001",
    operationType: "merge",
    targetObservationIds: observations.map((item) => item.id),
  };
  const snapshots = permutations(observations).map((arrivalOrder) =>
    reconcileMatch({ observations: arrivalOrder, operations: [operation] }),
  );
  assert.equal(new Set(snapshots.map((result) => result.digestInput)).size, 1);
  assert.equal(snapshots[0].events.length, 1);
  assert.equal(snapshots[0].projection.confirmedTeamScore, 1);
});

test("missing causal parents remain pending", () => {
  const result = reconcileMatch({
    observations,
    operations: [
      {
        id: "40000000-0000-4000-8000-000000000002",
        operationType: "void",
        targetObservationIds: [observations[0].id],
        causalParentIds: ["40000000-0000-4000-8000-000000000099"],
      },
    ],
  });
  assert.deepEqual(result.pendingOperationIds, ["40000000-0000-4000-8000-000000000002"]);
  assert.equal(result.events.some((event) => event.lifecycleStatus === "voided"), false);
});

test("concurrent incompatible operations produce the same conflict set", () => {
  const operations = [
    {
      id: "40000000-0000-4000-8000-000000000003",
      operationType: "void",
      targetObservationIds: [observations[0].id],
    },
    {
      id: "40000000-0000-4000-8000-000000000004",
      operationType: "correct",
      targetObservationIds: [observations[0].id],
      decision: { replacement: { athleteId: "30000000-0000-4000-8000-000000000002" } },
    },
  ];
  const results = permutations(operations).map((arrivalOrder) =>
    reconcileMatch({ observations, operations: arrivalOrder }),
  );
  assert.deepEqual(results[0].conflicts, results[1].conflicts);
  assert.equal(results[0].events[0].lifecycleStatus, "needs_review");
});

test("a causal conflict resolution supersedes both incompatible decisions", () => {
  const conflicting = [
    {
      id: "40000000-0000-4000-8000-000000000005",
      operationType: "void",
      targetObservationIds: [observations[0].id],
    },
    {
      id: "40000000-0000-4000-8000-000000000006",
      operationType: "correct",
      targetObservationIds: [observations[0].id],
      decision: { replacement: { matchElapsedMs: 110000 } },
    },
  ];
  const resolution = {
    id: "40000000-0000-4000-8000-000000000007",
    operationType: "resolve_conflict",
    targetObservationIds: [observations[0].id],
    causalParentIds: conflicting.map((operation) => operation.id),
    decision: { supersedes: conflicting.map((operation) => operation.id) },
  };
  const snapshots = permutations([...conflicting, resolution]).map((arrivalOrder) =>
    reconcileMatch({ observations, operations: arrivalOrder }),
  );
  assert.equal(new Set(snapshots.map((result) => result.digestInput)).size, 1);
  assert.deepEqual(snapshots[0].conflicts, []);
});

test("time-window chains are review edges and never an automatic merge", () => {
  const chained = [
    observations[0],
    { ...observations[0], id: "10000000-0000-4000-8000-000000000003", matchElapsedMs: 104000 },
    { ...observations[0], id: "10000000-0000-4000-8000-000000000004", matchElapsedMs: 108000 },
  ];
  const snapshots = permutations(chained).map((arrivalOrder) =>
    reconcileMatch({ observations: arrivalOrder }),
  );
  assert.equal(new Set(snapshots.map((result) => result.digestInput)).size, 1);
  assert.equal(snapshots[0].events.length, 3);
  assert.deepEqual(snapshots[0].candidateGroups, [
    [chained[0].id, chained[1].id],
    [chained[1].id, chained[2].id],
  ]);
});

test("a complete match fixture has identical projections for every arrival order", () => {
  const fixture = [
    { ...observations[0], id: "50000000-0000-4000-8000-000000000001", matchElapsedMs: 60000 },
    { ...observations[0], id: "50000000-0000-4000-8000-000000000002", matchElapsedMs: 180000, eventType: "goal", payload: { goalKind: "penalty", outcome: "scored" } },
    { ...observations[0], id: "50000000-0000-4000-8000-000000000003", matchElapsedMs: 300000, eventType: "penalty", payload: { outcome: "missed" } },
    { ...observations[0], id: "50000000-0000-4000-8000-000000000004", matchElapsedMs: 420000, eventType: "yellow_card" },
    { ...observations[0], id: "50000000-0000-4000-8000-000000000005", matchElapsedMs: 540000, eventType: "substitution", payload: { incomingPlayerId: "30000000-0000-4000-8000-000000000009" } },
  ];
  const snapshots = permutations(fixture).map((arrivalOrder) =>
    reconcileMatch({ observations: arrivalOrder }),
  );
  assert.equal(snapshots.length, 120);
  assert.equal(new Set(snapshots.map((result) => result.digestInput)).size, 1);
  assert.equal(snapshots[0].projection.provisionalTeamScore, 2);
  assert.equal(snapshots[0].projection.disciplinaryProjection.ownYellowCards, 1);
});
