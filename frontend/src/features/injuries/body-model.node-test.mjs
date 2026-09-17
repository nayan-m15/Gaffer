import assert from "node:assert/strict";
import {
  BODY_PART_IDS,
  BODY_PARTS,
  BODY_VIEWS,
  REGION_PLACEMENTS,
  VIEW_AZIMUTHS,
  clampPolar,
  clampRadius,
  nearestView,
  orbitPosition,
  ORBIT_TARGET,
  regionsForPart,
  shortestAngleTo,
  MAX_ORBIT_RADIUS,
  MIN_ORBIT_RADIUS,
} from "./body-model.ts";
import { BODY_REGIONS } from "./body-regions.ts";

/* ── Part definitions ───────────────────────────────────────────────────── */

// Every part id is unique; a duplicate would silently drop a mesh.
assert.equal(new Set(BODY_PART_IDS).size, BODY_PART_IDS.length);

// Every part has at least one shape, and every shape is well formed.
for (const part of BODY_PARTS) {
  assert.ok(part.shapes.length > 0, `${part.id} has no shapes`);
  for (const shape of part.shapes) {
    if (shape.kind === "ellipsoid") {
      assert.equal(shape.center.length, 3, `${part.id} center`);
      assert.equal(shape.radii.length, 3, `${part.id} radii`);
      assert.ok(
        shape.radii.every((radius) => radius > 0),
        `${part.id} has a non-positive radius`,
      );
    } else {
      assert.ok(shape.radiusFrom > 0 && shape.radiusTo > 0, `${part.id} radii`);
      // A zero-length segment cannot be oriented — the direction vector
      // would not normalise.
      const length = Math.hypot(
        shape.to[0] - shape.from[0],
        shape.to[1] - shape.from[1],
        shape.to[2] - shape.from[2],
      );
      assert.ok(length > 0.001, `${part.id} segment is degenerate`);
    }
  }
}

/** Every vertex-ish extreme of a part, for bounds checks. */
function partPoints(part) {
  return part.shapes.flatMap((shape) =>
    shape.kind === "ellipsoid" ? [shape.center] : [shape.from, shape.to],
  );
}

// The figure stands on the ground and is roughly human-sized.
const allPoints = BODY_PARTS.flatMap(partPoints);
const minY = Math.min(...allPoints.map((point) => point[1]));
const maxY = Math.max(...allPoints.map((point) => point[1]));
assert.ok(minY >= 0, `model sinks below the ground plane (${minY})`);
assert.ok(maxY > 1.6 && maxY < 1.85, `model height looks wrong (${maxY})`);

// Sided parts mirror exactly across the sagittal plane.
for (const part of BODY_PARTS) {
  if (!part.id.endsWith("_left")) {
    continue;
  }
  const rightId = part.id.replace(/_left$/, "_right");
  const right = BODY_PARTS.find((candidate) => candidate.id === rightId);
  assert.ok(right, `${part.id} has no mirrored counterpart`);

  const leftPoints = partPoints(part);
  const rightPoints = partPoints(right);
  assert.equal(leftPoints.length, rightPoints.length, `${part.id} shape count`);
  leftPoints.forEach((point, index) => {
    assert.ok(
      Math.abs(point[0] + rightPoints[index][0]) < 1e-9,
      `${part.id} is not mirrored in x`,
    );
    assert.equal(point[1], rightPoints[index][1], `${part.id} y differs`);
    assert.equal(point[2], rightPoints[index][2], `${part.id} z differs`);
  });
}

// The subject faces +Z, so their own left is +X.
const leftShoulder = BODY_PARTS.find((part) => part.id === "shoulder_left");
assert.ok(leftShoulder.shapes[0].center[0] > 0, "subject's left must be +X");

/* ── Region placements ──────────────────────────────────────────────────── */

// Every injury region the backend can store must be placeable on the model,
// or it would be invisible on the page.
assert.equal(Object.keys(REGION_PLACEMENTS).length, BODY_REGIONS.length);
for (const region of BODY_REGIONS) {
  const placement = REGION_PLACEMENTS[region];
  assert.ok(placement, `no placement for ${region}`);
  assert.ok(
    BODY_PART_IDS.includes(placement.part),
    `${region} points at unknown part ${placement.part}`,
  );
  assert.equal(placement.hotspot.length, 3, `${region} hotspot`);
  assert.ok(placement.hotspot[1] >= 0, `${region} hotspot is underground`);
}

// The quad and the hamstring share one thigh volume but sit on opposite
// faces of it — front is +Z, back is -Z.
assert.equal(REGION_PLACEMENTS.quad_left.part, "thigh_left");
assert.equal(REGION_PLACEMENTS.hamstring_left.part, "thigh_left");
assert.ok(REGION_PLACEMENTS.quad_left.hotspot[2] > 0);
assert.ok(REGION_PLACEMENTS.hamstring_left.hotspot[2] < 0);
assert.ok(REGION_PLACEMENTS.chest.hotspot[2] > 0);
assert.ok(REGION_PLACEMENTS.back_upper.hotspot[2] < 0);

// Sided regions land on the matching side of the body.
for (const region of BODY_REGIONS) {
  const { hotspot } = REGION_PLACEMENTS[region];
  if (region.endsWith("_left")) {
    assert.ok(hotspot[0] > 0, `${region} hotspot is on the wrong side`);
  } else if (region.endsWith("_right")) {
    assert.ok(hotspot[0] < 0, `${region} hotspot is on the wrong side`);
  }
}

assert.deepEqual(regionsForPart("thigh_right").sort(), [
  "hamstring_right",
  "quad_right",
]);
assert.deepEqual(regionsForPart("pelvis").sort(), [
  "glute_left",
  "glute_right",
  "groin",
]);
assert.deepEqual(regionsForPart("head"), ["head"]);

/* ── Camera ─────────────────────────────────────────────────────────────── */

assert.equal(clampPolar(0), 0);
assert.equal(clampPolar(9), 0.55);
assert.equal(clampPolar(-9), -0.55);
assert.equal(clampRadius(100), MAX_ORBIT_RADIUS);
assert.equal(clampRadius(0), MIN_ORBIT_RADIUS);
assert.equal(clampRadius(2.5), 2.5);

// The front view looks along -Z from in front of the figure.
const front = orbitPosition(VIEW_AZIMUTHS.front, 0, 3);
assert.ok(Math.abs(front[0]) < 1e-9);
assert.ok(front[2] > 0);
assert.equal(front[1], ORBIT_TARGET[1]);

// The back view is directly opposite.
const back = orbitPosition(VIEW_AZIMUTHS.back, 0, 3);
assert.ok(back[2] < 0);

// The subject's left side is viewed from +X.
const left = orbitPosition(VIEW_AZIMUTHS.left, 0, 3);
assert.ok(left[0] > 0);
assert.ok(Math.abs(left[2]) < 1e-9);

// Orbiting never changes the distance to the target.
for (const view of BODY_VIEWS) {
  for (const polar of [-0.5, 0, 0.5]) {
    const position = orbitPosition(VIEW_AZIMUTHS[view], polar, 3);
    const distance = Math.hypot(
      position[0] - ORBIT_TARGET[0],
      position[1] - ORBIT_TARGET[1],
      position[2] - ORBIT_TARGET[2],
    );
    assert.ok(Math.abs(distance - 3) < 1e-9, `radius drifted for ${view}`);
  }
}

// Tweening always takes the short way round, so switching from `right` to
// `front` cannot spin the figure three-quarters of the way about.
assert.ok(Math.abs(shortestAngleTo(-Math.PI / 2, 0) - Math.PI / 2) < 1e-9);
assert.ok(Math.abs(shortestAngleTo(0, -Math.PI / 2) + Math.PI / 2) < 1e-9);
// Crossing the ±π seam.
assert.ok(Math.abs(shortestAngleTo(Math.PI - 0.1, -Math.PI + 0.1) - 0.2) < 1e-9);
for (const from of [-3, -1, 0, 1, 3]) {
  for (const to of [-3, -1, 0, 1, 3]) {
    assert.ok(
      Math.abs(shortestAngleTo(from, to)) <= Math.PI + 1e-9,
      `long way round from ${from} to ${to}`,
    );
  }
}

assert.equal(nearestView(0), "front");
assert.equal(nearestView(0.2), "front");
assert.equal(nearestView(Math.PI / 2 - 0.1), "left");
assert.equal(nearestView(-Math.PI / 2 + 0.1), "right");
assert.equal(nearestView(Math.PI - 0.1), "back");
// A full turn past the front is still the front.
assert.equal(nearestView(Math.PI * 2), "front");

console.log("body-model: all assertions passed");
