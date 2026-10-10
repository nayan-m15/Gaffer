import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supportsLandingScene } from './scene-capability.ts';

globalThis.window = { setTimeout, clearTimeout };
let latestWorker;
class ProbeWorker {
  terminated = false;
  constructor() { latestWorker = this; }
  terminate() { this.terminated = true; }
}

test('browsers without worker canvas keep the normal scene path', async () => {
  assert.equal(await supportsLandingScene(new AbortController().signal), true);
});

test('software GPU results choose fallback and release the probe worker', async () => {
  globalThis.OffscreenCanvas = class {};
  globalThis.Worker = ProbeWorker;
  const result = supportsLandingScene(new AbortController().signal);
  latestWorker.onmessage({ data: false });
  assert.equal(await result, false);
  assert.equal(latestWorker.terminated, true);
});

test('worker failure retains the regular WebGL failure recovery', async () => {
  const result = supportsLandingScene(new AbortController().signal);
  latestWorker.onerror({ preventDefault() {} });
  assert.equal(await result, true);
  assert.equal(latestWorker.terminated, true);
});

test('navigation cancels the probe and releases its worker', async () => {
  const controller = new AbortController();
  const result = supportsLandingScene(controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(latestWorker.terminated, true);
});
