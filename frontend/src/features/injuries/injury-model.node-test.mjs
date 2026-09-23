import assert from "node:assert/strict";
import {
  BODY_REGIONS,
  bodyRegionSide,
  injuryTitle,
  injuryTypesForRegion,
  INJURY_TYPES,
} from "./body-regions.ts";
import {
  activePhase,
  daysBetween,
  daysUntilProjectedReturn,
  injurySummary,
  recoveryProgress,
  recoveryTone,
  returnWindowLabel,
  sortForAttention,
  varianceLabel,
} from "./injury-model.ts";

function injury(overrides = {}) {
  return {
    id: "injury-1",
    athleteId: "athlete-1",
    bodyRegion: "hamstring_right",
    injuryType: "strain",
    severity: "moderate",
    status: "rehab",
    occurredOn: "2026-09-12",
    estimatedReturnFrom: "2026-10-03",
    estimatedReturnTo: "2026-10-24",
    actualReturnOn: null,
    daysOut: 8,
    returnVarianceDays: null,
    isOpen: true,
    isRecurrence: false,
    athleteFirstName: "Alex",
    athleteLastName: "Morgan",
    ...overrides,
  };
}

/* ── returnWindowLabel ──────────────────────────────────────────────────── */

assert.equal(returnWindowLabel(3, 7), "3–7 days");
assert.equal(returnWindowLabel(7, 7), "7 days");
assert.equal(returnWindowLabel(1, 1), "1 day");
assert.equal(returnWindowLabel(21, 42), "3–6 weeks");
// A window whose bounds round to the same week must not read "3–3 weeks".
assert.equal(returnWindowLabel(20, 22), "3 weeks");
assert.equal(returnWindowLabel(7, 14), "1–2 weeks");
assert.equal(returnWindowLabel(210, 300), "A season or more");

/* ── daysBetween ────────────────────────────────────────────────────────── */

assert.equal(daysBetween("2026-09-12", "2026-09-19"), 7);
assert.equal(daysBetween("2026-09-19", "2026-09-12"), -7);
// UTC parsing, so a daylight-saving boundary cannot return 6 or 8.
assert.equal(daysBetween("2026-03-27", "2026-04-03"), 7);

/* ── recoveryProgress ───────────────────────────────────────────────────── */

assert.equal(recoveryProgress(injury(), "2026-09-12"), 0);
assert.equal(recoveryProgress(injury(), "2026-10-24"), 1);
// Never runs past the end of the window.
assert.equal(recoveryProgress(injury(), "2026-12-01"), 1);
// Or before the start of it.
assert.equal(recoveryProgress(injury(), "2026-09-01"), 0);
assert.equal(
  recoveryProgress(injury({ actualReturnOn: "2026-10-01" }), "2026-10-02"),
  1,
);
// A same-day window must not divide by zero.
assert.equal(
  recoveryProgress(injury({ estimatedReturnTo: "2026-09-12" }), "2026-09-12"),
  1,
);

/* ── daysUntilProjectedReturn ───────────────────────────────────────────── */

assert.equal(daysUntilProjectedReturn(injury(), "2026-10-17"), 7);
assert.equal(daysUntilProjectedReturn(injury(), "2026-10-31"), -7);
assert.equal(
  daysUntilProjectedReturn(injury({ actualReturnOn: "2026-10-20" }), "2026-10-21"),
  null,
);

/* ── injuryTitle ────────────────────────────────────────────────────────── */

assert.equal(injuryTitle(injury()), "Right hamstring strain");
assert.equal(
  injuryTitle(injury({ bodyRegion: "head", injuryType: "concussion" })),
  "Head concussion",
);

/* ── varianceLabel ──────────────────────────────────────────────────────── */

assert.equal(varianceLabel(null), "—");
assert.equal(varianceLabel(0), "On projection");
assert.equal(varianceLabel(1), "1 day late");
assert.equal(varianceLabel(5), "5 days late");
assert.equal(varianceLabel(-1), "1 day early");
assert.equal(varianceLabel(-5), "5 days early");

/* ── recoveryTone ───────────────────────────────────────────────────────── */

assert.equal(recoveryTone(100).label, "Ready");
assert.equal(recoveryTone(90).label, "Ready");
assert.equal(recoveryTone(89).label, "Manage load");
assert.equal(recoveryTone(70).label, "Manage load");
assert.equal(recoveryTone(61).label, "Restricted");

/* ── activePhase ────────────────────────────────────────────────────────── */

const phases = [
  { name: "Acute protection", fromDay: 0, toDay: 6, focus: "", completedOn: null },
  { name: "Early loading", fromDay: 6, toDay: 19, focus: "", completedOn: null },
  { name: "Return to play", fromDay: 19, toDay: 42, focus: "", completedOn: null },
];

assert.equal(activePhase(phases, 0).name, "Acute protection");
assert.equal(activePhase(phases, 5).name, "Acute protection");
assert.equal(activePhase(phases, 6).name, "Early loading");
assert.equal(activePhase(phases, 41).name, "Return to play");
// Past the plan, the last phase is the honest answer.
assert.equal(activePhase(phases, 90).name, "Return to play");
assert.equal(activePhase(null, 3), null);
assert.equal(activePhase([], 3), null);

/* ── sortForAttention ───────────────────────────────────────────────────── */

const sorted = sortForAttention([
  injury({ id: "closed", isOpen: false, severity: "severe" }),
  injury({ id: "minor-open", severity: "minor", occurredOn: "2026-09-01" }),
  injury({ id: "severe-open", severity: "severe", occurredOn: "2026-08-01" }),
  injury({ id: "moderate-recent", severity: "moderate", occurredOn: "2026-09-20" }),
]);

// Open before closed, then worst severity, then most recent.
assert.deepEqual(
  sorted.map((row) => row.id),
  ["severe-open", "moderate-recent", "minor-open", "closed"],
);

/* ── injurySummary ──────────────────────────────────────────────────────── */

const summary = injurySummary(
  [
    injury({ id: "a", severity: "severe", daysOut: 30 }),
    injury({ id: "b", severity: "minor", daysOut: 5, isRecurrence: true }),
    injury({
      id: "c",
      isOpen: false,
      actualReturnOn: "2026-09-20",
      daysOut: 8,
    }),
  ],
  "2026-10-20",
);

assert.equal(summary.openCount, 2);
assert.equal(summary.severeOpenCount, 1);
assert.equal(summary.recurrenceCount, 1);
assert.equal(summary.daysLostThisSeason, 43);
// Both open injuries project a return on 2026-10-24, four days out.
assert.equal(summary.dueBackWithinAWeek, 2);

assert.deepEqual(injurySummary([], "2026-10-20"), {
  openCount: 0,
  severeOpenCount: 0,
  recurrenceCount: 0,
  daysLostThisSeason: 0,
  dueBackWithinAWeek: 0,
});

/* ── body regions ───────────────────────────────────────────────────────── */

assert.equal(BODY_REGIONS.length, 31);
assert.equal(bodyRegionSide("hamstring_left"), "left");
assert.equal(bodyRegionSide("hamstring_right"), "right");
assert.equal(bodyRegionSide("groin"), "central");
assert.equal(bodyRegionSide("back_upper"), "central");

// Every region must offer every injury type, with the plausible ones first
// and no duplicates.
for (const region of BODY_REGIONS) {
  const types = injuryTypesForRegion(region);
  assert.equal(types.length, INJURY_TYPES.length, `types for ${region}`);
  assert.equal(new Set(types).size, types.length, `duplicate for ${region}`);
}
assert.equal(injuryTypesForRegion("head")[0], "concussion");
assert.equal(injuryTypesForRegion("hamstring_left")[0], "strain");
assert.equal(injuryTypesForRegion("ankle_right")[0], "sprain");

console.log("injury-model: all assertions passed");
