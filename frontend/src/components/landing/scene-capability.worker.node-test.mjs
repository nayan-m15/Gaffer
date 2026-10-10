import { test } from 'node:test';
import assert from 'node:assert/strict';
let sequence = 0;
async function probe(gl) {
  let result;
  globalThis.self = { postMessage(value) { result = value; } };
  globalThis.OffscreenCanvas = class { getContext() { return gl; } };
  const specifier = `./scene-capability.worker.ts?test=${sequence}`;
  sequence += 1;
  await import(specifier);
  return result;
}
test('unsupported worker WebGL keeps main-thread compatibility', async () => {
  assert.equal(await probe(null), true);
});
test('probe rejects software GPUs while retaining hardware GPUs', async () => {
  const gl = name => ({ RENDERER: 1, getParameter() { return name; }, getExtension() { return null; } });
  assert.equal(await probe(gl('ANGLE SwiftShader')), false);
  assert.equal(await probe(gl('Hardware GPU')), true);
});
