import assert from "node:assert/strict";
import test from "node:test";

import { getPositionGroup, getPositionGroupLabel } from "./position.ts";

const cases = {
  goalkeeper: ["GK", "Goalkeeper", "Keeper"],
  defender: [
    "CB", "LCB", "RCB", "LB", "RB", "LWB", "RWB", "SW", "DF", "DEF",
    "Centre Back", "Center Back", "Left Back", "Right Back", "Wing Back",
  ],
  midfielder: [
    "CM", "LCM", "RCM", "CDM", "LDM", "RDM", "DM", "CAM", "LAM", "RAM",
    "AM", "LM", "RM", "MF", "MID", "Central Midfielder", "Defensive Midfielder",
    "Attacking Midfielder", "Left Midfielder", "Right Midfielder",
  ],
  forward: [
    "ST", "CF", "LW", "RW", "LF", "RF", "FW", "FWD", "SS", "ATT",
    "Striker", "Centre Forward", "Center Forward", "Left Wing", "Right Wing",
    "Forward", "Winger",
  ],
};

for (const [group, positions] of Object.entries(cases)) {
  test(`${group} position variants map to their broad group`, () => {
    for (const position of positions) {
      assert.equal(getPositionGroup(position), group, position);
      assert.equal(getPositionGroup(` ${position.toLowerCase()} `), group, position);
    }
  });
}

test("unknown positions stay in All without being assigned a false group", () => {
  assert.equal(getPositionGroup(null), null);
  assert.equal(getPositionGroup("UN"), null);
  assert.equal(getPositionGroup(""), null);
  assert.equal(getPositionGroupLabel("UN"), "Squad");
});
