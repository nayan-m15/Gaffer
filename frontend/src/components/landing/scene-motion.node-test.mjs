import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceSceneProgress } from './scene-motion.ts';

test('camera catches up in the same elapsed time at different refresh rates', () => {
  for (const lowPower of [false, true]) {
    const advance = hz => {
      let progress = 0;
      for (let frame = 0; frame < hz; frame++) {
        progress = advanceSceneProgress(progress, 1, 1000 / hz, lowPower);
      }
      return progress;
    };
    assert.ok(Math.abs(advance(30) - advance(60)) < 1e-10);
    assert.ok(Math.abs(advance(120) - advance(60)) < 1e-10);
  }
});

test('fast scroll reversals converge without overshooting and eventually stop', () => {
  let progress = advanceSceneProgress(0, 1, 1000 / 30, false);
  assert.ok(progress > 0 && progress < 1);
  for (let frame = 0; frame < 120; frame++) {
    progress = advanceSceneProgress(progress, 0, 1000 / 30, false);
    assert.ok(progress >= 0 && progress < 1);
  }
  assert.equal(progress, 0);
});

test('stall gaps are bounded and zero elapsed time does not move the camera', () => {
  assert.equal(advanceSceneProgress(0, 1, 0, false), 0);
  assert.equal(advanceSceneProgress(0, 1, 5000, false), advanceSceneProgress(0, 1, 100, false));
});
