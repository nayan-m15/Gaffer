import assert from "node:assert/strict";
import test from "node:test";
import { suggestStartingXi } from "./suggestions.ts";

function athlete(id, position, overrides = {}) {
  return {
    id,
    firstName: `First_${id}`,
    lastName: `Last_${id}`,
    position,
    status: "available",
    squadNumber: null,
    appearances: 0,
    goals: 0,
    assists: 0,
    ...overrides,
  };
}

/** A roster that exactly fills every 4-3-3 slot. */
function base433() {
  return [
    athlete("gk", "GK"),
    athlete("lb", "LB"),
    athlete("cb1", "CB"),
    athlete("cb2", "CB"),
    athlete("rb", "RB"),
    athlete("cm1", "CM"),
    athlete("cm2", "CM"),
    athlete("cm3", "CM"),
    athlete("lw", "LW"),
    athlete("st", "ST"),
    athlete("rw", "RW"),
  ];
}

test("exact position fit wins over a better RSVP", () => {
  const squad = [...base433(), athlete("lwb", "LWB")];
  const result = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId: { lwb: "going" },
  });

  assert.equal(result.startingIds.length, 11);
  assert.equal(new Set(result.startingIds).size, 11);
  assert.ok(result.startingIds.includes("lb"), "natural LB keeps the LB slot");
  assert.ok(!result.startingIds.includes("lwb"), "going LWB does not outrank fit");
  assert.equal(result.reasons.lb, "Natural LB · No RSVP");
});

test("among equal-fit candidates, going is preferred, then no response, then maybe", () => {
  const squad = [
    ...base433().filter((a) => a.id !== "st"),
    athlete("st-going", "ST"),
    athlete("st-none", "ST"),
    athlete("st-maybe", "ST"),
  ];
  const result = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId: { "st-going": "going", "st-maybe": "maybe" },
  });

  assert.ok(result.startingIds.includes("st-going"));
  assert.ok(!result.startingIds.includes("st-none"));
  assert.ok(!result.startingIds.includes("st-maybe"));
  assert.ok(result.reasons["st-going"].includes("Going"));
});

test("no response outranks maybe for the same slot", () => {
  const squad = [
    ...base433().filter((a) => a.id !== "st"),
    athlete("st-none", "ST"),
    athlete("st-maybe", "ST"),
  ];
  const result = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId: { "st-maybe": "maybe" },
  });

  assert.ok(result.startingIds.includes("st-none"));
  assert.ok(!result.startingIds.includes("st-maybe"));
});

test("game-plan continuity breaks ties between identical candidates", () => {
  const squad = [
    ...base433().filter((a) => a.id !== "st"),
    athlete("sta", "ST", { squadNumber: 9 }),
    athlete("stb", "ST", { squadNumber: 10 }),
  ];
  const rsvpByAthleteId = { sta: "going", stb: "going" };

  const withoutPlan = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId,
  });
  assert.ok(withoutPlan.startingIds.includes("sta"), "squad number breaks the tie");

  const withPlan = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId,
    gamePlanAssignments: { "433-st": "stb" },
  });
  assert.ok(withPlan.startingIds.includes("stb"), "plan assignment wins the slot");
  assert.ok(!withPlan.startingIds.includes("sta"));
});

test("not_going players are not suggested while others can cover the XI", () => {
  const squad = [
    ...base433().filter((a) => a.id !== "st"),
    athlete("st-none", "ST"),
    athlete("st-out", "ST"),
  ];
  const result = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId: { "st-out": "not_going" },
  });

  assert.equal(result.startingIds.length, 11);
  assert.ok(result.startingIds.includes("st-none"));
  assert.ok(!result.startingIds.includes("st-out"));
});

test("not_going is only used as a last resort and is labelled", () => {
  const squad = [
    ...base433().filter((a) => a.id !== "gk"),
    athlete("gk-out", "GK"),
  ];
  const result = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId: { "gk-out": "not_going" },
  });

  assert.equal(result.startingIds.length, 11);
  assert.equal(result.startingIds[0], "gk-out");
  assert.equal(result.reasons["gk-out"], "Natural GK · Not going");
});

test("injured and suspended players are excluded and never steal a slot", () => {
  const squad = [
    ...base433().filter((a) => a.id !== "gk"),
    athlete("gk-injured", "GK", { status: "injured" }),
    athlete("gk-suspended", "GK", { status: "suspended" }),
    athlete("lwb", "LWB"),
  ];
  const result = suggestStartingXi({ formationId: "4-3-3", athletes: squad });

  assert.equal(result.startingIds.length, 11);
  assert.equal(new Set(result.startingIds).size, 11);
  assert.ok(!result.startingIds.includes("gk-injured"));
  assert.ok(!result.startingIds.includes("gk-suspended"));
  assert.equal(result.startingIds[0], "lwb", "fallback keeps defenders in defence");
  assert.ok(result.startingIds.includes("cb1"));
  assert.ok(result.startingIds.includes("cb2"));
  assert.equal(result.reasons.cb1, "Natural CB");
  assert.ok(result.reasons.lwb.startsWith("Fills in at GK"));
});

test("reason lines show fit, RSVP and supporting stats only when they exist", () => {
  const squad = base433().map((a) => {
    if (a.id === "cb1") return { ...a, appearances: 12 };
    if (a.id === "st") return { ...a, goals: 6, assists: 3 };
    return a;
  });
  const result = suggestStartingXi({
    formationId: "4-3-3",
    athletes: squad,
    rsvpByAthleteId: { cb1: "going", st: "going" },
  });

  assert.equal(result.reasons.cb1, "Natural CB · Going · 12 appearances");
  assert.equal(result.reasons.st, "Natural ST · Going · 6 goals · 3 assists");
});

test("role fills and singular stats are labelled", () => {
  const squad = [
    athlete("gk", "GK"),
    athlete("lb", "LB"),
    athlete("cb", "CB", { appearances: 1 }),
    athlete("lwb", "LWB"),
    athlete("rb", "RB"),
    athlete("cm1", "CM"),
    athlete("cm2", "CM"),
    athlete("cm3", "CM"),
    athlete("lw", "LW"),
    athlete("st", "ST"),
    athlete("rw", "RW", { goals: 1, assists: 1 }),
  ];
  const result = suggestStartingXi({ formationId: "4-3-3", athletes: squad });

  assert.equal(result.startingIds.length, 11);
  assert.equal(result.reasons.lwb, "Fits CB");
  assert.equal(result.reasons.cb, "Natural CB · 1 appearance");
  assert.equal(result.reasons.rw, "Natural RW · 1 goal · 1 assist");
});

test("unknown formation ids fall back to the default formation", () => {
  const result = suggestStartingXi({
    formationId: "9-9-9",
    athletes: base433(),
  });

  assert.equal(result.startingIds.length, 11);
  assert.equal(result.startingIds[0], "gk");
});

test("squads smaller than the XI fill only what they can", () => {
  const squad = [athlete("gk", "GK"), athlete("cb", "CB"), athlete("st", "ST")];
  const result = suggestStartingXi({ formationId: "4-3-3", athletes: squad });

  assert.deepEqual(result.startingIds, ["gk", "cb", "st"]);
  assert.equal(new Set(result.startingIds).size, 3);
  assert.equal(result.reasons.cb, "Natural CB");
});

test("the RSVP part is omitted entirely when no RSVP data is available", () => {
  const squad = base433().map((a) =>
    a.id === "cb2" ? { ...a, appearances: 3 } : a,
  );
  const result = suggestStartingXi({ formationId: "4-3-3", athletes: squad });

  assert.equal(result.reasons.cb2, "Natural CB · 3 appearances");
  assert.ok(!result.reasons.gk.includes("RSVP"));
});

console.log("[suggestions] passed", { cases: 12 });
