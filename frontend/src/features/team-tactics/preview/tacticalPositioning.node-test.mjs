import assert from "node:assert/strict";

import { FORMATIONS } from "../../team-management/formations.ts";
import { DEFAULT_GAME_PLAN_TACTICS } from "../tactics-options.ts";
import {
  calculateCornerShape,
  calculateDefensiveShape,
  calculateFreeKickShape,
  calculateTacticalShape,
  clampPitchCoordinate,
  commitmentToBoxCount,
  outfieldDepthBounds,
  pivotLerp,
  playersInBoxCount,
  scenarioForSetting,
  tacticPercent,
  transformDepth,
  transformGoalkeeperDepth,
  transformWidth,
} from "./tacticalPositioning.ts";

const formation = FORMATIONS["4-2-3-1"];
const base = DEFAULT_GAME_PLAN_TACTICS;

const tactics = (overrides) => ({ ...base, ...overrides });

const outfield = (shape) => shape.filter((player) => player.label !== "GK");
const spread = (shape) => {
  const xs = outfield(shape).map((player) => player.x);
  return Math.max(...xs) - Math.min(...xs);
};
const deepest = (shape) => Math.max(...outfield(shape).map((p) => p.y));
const highest = (shape) => Math.min(...outfield(shape).map((p) => p.y));
const byLabel = (shape, label) => shape.find((player) => player.label === label);

/* ─── Slider normalisation ───────────────────────────────────────────────── */

// The stored scale is the backend's 1–10 / 0–10; the preview works in 0–100 with
// each slider's own default landing exactly on 50.
assert.equal(tacticPercent(tactics({ defensiveWidth: 1 }), "defensiveWidth"), 0);
assert.equal(tacticPercent(tactics({ defensiveWidth: 5 }), "defensiveWidth"), 50);
assert.equal(
  tacticPercent(tactics({ defensiveWidth: 10 }), "defensiveWidth"),
  100,
);
assert.equal(tacticPercent(tactics({ defensiveWidth: 3 }), "defensiveWidth"), 25);

// Corners default to 3 of 0–10, so its halves are normalised independently.
assert.equal(
  tacticPercent(tactics({ cornersCommitment: 3 }), "cornersCommitment"),
  50,
  "the stored default is always the neutral reading",
);
assert.equal(
  tacticPercent(tactics({ cornersCommitment: 0 }), "cornersCommitment"),
  0,
);
assert.equal(
  tacticPercent(tactics({ cornersCommitment: 10 }), "cornersCommitment"),
  100,
);

// Out-of-range values clamp rather than extrapolating off the slider.
assert.equal(tacticPercent(tactics({ defensiveWidth: 99 }), "defensiveWidth"), 100);
assert.equal(tacticPercent(tactics({ defensiveWidth: -4 }), "defensiveWidth"), 0);

/* ─── pivotLerp ──────────────────────────────────────────────────────────── */

const range = { low: 10, neutral: 0, high: -20 };
assert.equal(pivotLerp(0, range), 10);
assert.equal(pivotLerp(50, range), 0);
assert.equal(pivotLerp(100, range), -20);
assert.equal(pivotLerp(25, range), 5);
assert.equal(pivotLerp(75, range), -10);

/* ─── Width ──────────────────────────────────────────────────────────────── */

assert.equal(
  transformWidth(50, 0),
  50,
  "a player on the centre line never moves sideways",
);
assert.equal(transformWidth(80, 50), 80, "the neutral reading is the base shape");
assert.ok(transformWidth(80, 0) < 80, "narrow pulls a right-sided player in");
assert.ok(transformWidth(80, 100) > 80, "wide pushes a right-sided player out");
assert.ok(transformWidth(20, 0) > 20, "narrow pulls a left-sided player in");

// Width compresses the whole shape, not just the widest players: a half-space
// player moves too.
const narrow = calculateDefensiveShape(formation, tactics({ defensiveWidth: 1 }));
const neutralWidth = calculateDefensiveShape(formation, base);
const wide = calculateDefensiveShape(formation, tactics({ defensiveWidth: 10 }));

assert.ok(
  spread(narrow) < spread(neutralWidth) - 10,
  "narrow is visibly more compact than the default",
);
assert.ok(
  spread(wide) > spread(neutralWidth) + 5,
  "wide is visibly broader than the default",
);
assert.ok(
  byLabel(narrow, "CDM").x > byLabel(neutralWidth, "CDM").x,
  "an inside midfielder is drawn toward the centre too",
);

/* ─── Depth ──────────────────────────────────────────────────────────────── */

const bounds = outfieldDepthBounds(formation.positions);
assert.deepEqual(bounds, { deepest: 78, highest: 14 });

assert.equal(transformDepth(72, 50, bounds), 72, "the neutral reading holds shape");
assert.ok(
  transformDepth(78, 100, bounds) < 78 - 10,
  "a high line pushes the deepest defender a long way up",
);
assert.ok(
  transformDepth(78, 0, bounds) > 78,
  "a deep setting drops the back line toward our own goal",
);
assert.ok(
  transformDepth(14, 0, bounds) > 14 + 15,
  "dropping off pulls the striker back the furthest",
);

// Our own goal is at y = 100, so "higher" must mean a smaller y for everyone.
const deep = calculateDefensiveShape(formation, tactics({ defensiveDepth: 1 }));
const high = calculateDefensiveShape(formation, tactics({ defensiveDepth: 10 }));

for (const player of outfield(formation.positions.map((p) => ({ ...p })))) {
  const low = byLabel(deep, player.label);
  const up = byLabel(high, player.label);
  assert.ok(
    up.y < low.y,
    `${player.label} must sit higher at depth 10 than at depth 1`,
  );
}
assert.ok(deepest(high) < deepest(deep), "the whole block moves up");

// Both ends of the slider tighten the block vertically — a low block has to
// bring the forwards back, a high line is squeezed against the opponent's box.
const blockHeight = (shape) => deepest(shape) - highest(shape);
const neutralDepth = calculateDefensiveShape(formation, base);
assert.ok(
  blockHeight(deep) < blockHeight(neutralDepth),
  "dropping off compresses the lines",
);
assert.ok(
  blockHeight(high) < blockHeight(neutralDepth),
  "pushing up compresses the lines",
);

/* ─── Goalkeeper ─────────────────────────────────────────────────────────── */

assert.equal(transformGoalkeeperDepth(94, 50), 94);
assert.ok(transformGoalkeeperDepth(94, 100) >= 84, "the keeper stays in range");
assert.ok(transformGoalkeeperDepth(94, 0) <= 96, "the keeper stays in range");

const keeperTravel =
  byLabel(deep, "GK").y - byLabel(high, "GK").y;
const defenderTravel =
  byLabel(deep, "LB").y - byLabel(high, "LB").y;
assert.ok(
  keeperTravel < defenderTravel,
  "the keeper moves far less than the back line",
);

/* ─── Width and depth combine, and stay on the pitch ─────────────────────── */

const combinations = [
  { defensiveWidth: 1, defensiveDepth: 1 },
  { defensiveWidth: 10, defensiveDepth: 1 },
  { defensiveWidth: 1, defensiveDepth: 10 },
  { defensiveWidth: 10, defensiveDepth: 10 },
];

const fingerprints = new Set();
for (const combination of combinations) {
  const shape = calculateDefensiveShape(formation, tactics(combination));
  assert.equal(shape.length, formation.positions.length);
  for (const player of shape) {
    assert.ok(
      player.x >= 6 && player.x <= 94,
      `${player.label} stays between the touchlines`,
    );
    assert.ok(
      player.y >= 6 && player.y <= 94,
      `${player.label} stays between the goal lines`,
    );
  }
  fingerprints.add(
    shape.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("|"),
  );
}
assert.equal(
  fingerprints.size,
  combinations.length,
  "all four extreme combinations draw a different shape",
);

assert.equal(clampPitchCoordinate(-20), 6);
assert.equal(clampPitchCoordinate(120), 94);
assert.equal(clampPitchCoordinate(42), 42);

/* ─── Defensive style ────────────────────────────────────────────────────── */

const dropBack = calculateDefensiveShape(
  formation,
  tactics({ defensiveStyle: "drop_back" }),
);
const pressing = calculateDefensiveShape(
  formation,
  tactics({ defensiveStyle: "constant_pressure" }),
);
assert.ok(
  deepest(pressing) < deepest(dropBack),
  "constant pressure defends higher than dropping back at the same depth",
);

/* ─── Scenarios ──────────────────────────────────────────────────────────── */

assert.equal(scenarioForSetting("defensiveWidth"), "defensive");
assert.equal(scenarioForSetting("defensiveStyle"), "defensive");
assert.equal(scenarioForSetting("offensiveWidth"), "attacking");
assert.equal(scenarioForSetting("playersInBox"), "attacking");
assert.equal(scenarioForSetting("cornersCommitment"), "corner");
assert.equal(scenarioForSetting("freeKicksCommitment"), "freeKick");

// Width and depth previews stay uncluttered; the pressing styles earn opponents.
const widthPreview = calculateTacticalShape(formation, base, "defensiveWidth");
assert.deepEqual(widthPreview.opponents, []);
assert.equal(widthPreview.ball, null);

const balancedStyle = calculateTacticalShape(formation, base, "defensiveStyle");
assert.deepEqual(balancedStyle.opponents, [], "balanced needs no opponents");

const pressPreview = calculateTacticalShape(
  formation,
  tactics({ defensiveStyle: "press_after_possession_loss" }),
  "defensiveStyle",
);
assert.ok(pressPreview.opponents.length > 0);
assert.ok(pressPreview.ball);
assert.equal(
  pressPreview.players.filter((player) => player.highlighted).length,
  4,
  "a counter-press highlights four players closing the ball down",
);

// Only players genuinely near the ball are shown pressing, whatever the style.
for (const [style, expected] of [
  ["pressure_on_heavy_touch", 2],
  ["press_after_possession_loss", 4],
  ["constant_pressure", 3],
]) {
  const preview = calculateTacticalShape(
    formation,
    tactics({ defensiveStyle: style }),
    "defensiveStyle",
  );
  const pressers = preview.players.filter((player) => player.highlighted);
  assert.ok(
    pressers.length > 0 && pressers.length <= expected,
    `${style} highlights at most ${expected} pressers`,
  );
  for (const presser of pressers) {
    assert.ok(
      Math.hypot(presser.x - preview.ball.x, presser.y - preview.ball.y) <= 32,
      `${style}: ${presser.label} is close enough to the ball to be pressing`,
    );
  }
}

/* ─── Players in box ─────────────────────────────────────────────────────── */

assert.equal(playersInBoxCount(tactics({ playersInBox: 0 })), 1);
assert.equal(playersInBoxCount(tactics({ playersInBox: 10 })), 6);
assert.ok(
  playersInBoxCount(tactics({ playersInBox: 10 })) >
    playersInBoxCount(tactics({ playersInBox: 2 })),
  "a higher setting commits more players",
);

const fewInBox = calculateTacticalShape(
  formation,
  tactics({ playersInBox: 0 }),
  "playersInBox",
);
const manyInBox = calculateTacticalShape(
  formation,
  tactics({ playersInBox: 10 }),
  "playersInBox",
);
const inBoxCount = (shape) =>
  shape.players.filter((player) => player.y <= 24 && player.label !== "GK")
    .length;
assert.ok(
  inBoxCount(manyInBox) > inBoxCount(fewInBox),
  "raising Players in box puts more players in advanced positions",
);

/* ─── Set pieces ─────────────────────────────────────────────────────────── */

assert.equal(commitmentToBoxCount(0), 2);
assert.equal(commitmentToBoxCount(100), 6);

for (const [name, build] of [
  ["corner", calculateCornerShape],
  ["free kick", calculateFreeKickShape],
]) {
  const field =
    name === "corner" ? "cornersCommitment" : "freeKicksCommitment";
  const low = build(formation, tactics({ [field]: 0 }));
  const highCommit = build(formation, tactics({ [field]: 10 }));

  assert.equal(low.length, formation.positions.length);
  assert.deepEqual(
    low.map((p) => p.id).sort(),
    formation.positions.map((p) => p.id).sort(),
    `${name} reuses the formation slot ids so markers animate across`,
  );
  assert.ok(
    highCommit.filter((p) => p.y <= 24).length >
      low.filter((p) => p.y <= 24).length,
    `${name}: a higher commitment sends more players into the box`,
  );
  for (const player of highCommit) {
    assert.ok(player.x >= 6 && player.x <= 94, `${name}: ${player.label} on pitch`);
    assert.ok(player.y >= 6 && player.y <= 94, `${name}: ${player.label} on pitch`);
  }
}

const cornerPreview = calculateTacticalShape(
  formation,
  base,
  "cornersCommitment",
);
assert.equal(cornerPreview.scenario, "corner");
assert.ok(cornerPreview.ball.x < 20, "the corner is taken from the flag");
assert.ok(cornerPreview.opponents.length > 0, "someone defends the corner");

/* ─── Works for every supported formation ────────────────────────────────── */

for (const candidate of Object.values(FORMATIONS)) {
  for (const setting of [
    "defensiveWidth",
    "defensiveDepth",
    "offensiveWidth",
    "playersInBox",
    "cornersCommitment",
    "freeKicksCommitment",
  ]) {
    const shape = calculateTacticalShape(candidate, base, setting);
    assert.equal(
      shape.players.length,
      candidate.positions.length,
      `${candidate.id} keeps every player for ${setting}`,
    );
    for (const player of shape.players) {
      assert.ok(
        Number.isFinite(player.x) && Number.isFinite(player.y),
        `${candidate.id}/${setting}: ${player.label} has a real position`,
      );
      assert.ok(
        player.x >= 6 && player.x <= 94 && player.y >= 6 && player.y <= 94,
        `${candidate.id}/${setting}: ${player.label} stays on the pitch`,
      );
    }
  }
}

console.log("tacticalPositioning: ok");
