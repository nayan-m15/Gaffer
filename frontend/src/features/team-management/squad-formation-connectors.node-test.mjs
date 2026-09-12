import assert from "node:assert/strict";
import { FORMATIONS } from "./formations.ts";
import {
  CONNECTOR_MAX_DX,
  connectorSegments,
  groupPositionsIntoRows,
  hasSegmentBetween,
} from "./squad-formation-connectors.ts";

{
  const formation = FORMATIONS["4-2-3-1"];
  const rows = groupPositionsIntoRows(formation.positions);
  const segments = connectorSegments(rows);
  const leftCb = formation.positions.find(
    (pos) => pos.label === "CB" && pos.x === 32,
  );
  const farCdm = formation.positions.find(
    (pos) => pos.label === "CDM" && pos.x === 68,
  );
  assert.ok(leftCb && farCdm);
  assert.equal(Math.abs(leftCb.x - farCdm.x), 36);
  assert.ok(36 <= CONNECTOR_MAX_DX);
  assert.equal(
    hasSegmentBetween(segments, leftCb, farCdm),
    true,
    "4-2-3-1 left CB must connect to the far CDM",
  );
  assert.ok(segments.length < 45, "4-2-3-1 should not be overly cluttered");
}

{
  const formation = FORMATIONS["4-3-3"];
  const rows = groupPositionsIntoRows(formation.positions);
  const segments = connectorSegments(rows);
  const leftCb = formation.positions.find(
    (pos) => pos.label === "CB" && pos.x === 32,
  );
  const centreCm = formation.positions.find(
    (pos) => pos.label === "CM" && pos.x === 50,
  );
  const farCm = formation.positions.find(
    (pos) => pos.label === "CM" && pos.x === 76,
  );
  assert.ok(leftCb && centreCm && farCm);
  assert.equal(
    hasSegmentBetween(segments, leftCb, centreCm),
    true,
    "4-3-3 left CB must connect to the central CM",
  );
  assert.equal(
    hasSegmentBetween(segments, leftCb, farCm),
    false,
    "4-3-3 left CB should not span to the far-side CM",
  );
  assert.ok(segments.length < 40, "4-3-3 should not be overly cluttered");
}

console.log("[squad-formation-connectors] passed", {
  maxDx: CONNECTOR_MAX_DX,
  links433: connectorSegments(
    groupPositionsIntoRows(FORMATIONS["4-3-3"].positions),
  ).length,
  links4231: connectorSegments(
    groupPositionsIntoRows(FORMATIONS["4-2-3-1"].positions),
  ).length,
});
