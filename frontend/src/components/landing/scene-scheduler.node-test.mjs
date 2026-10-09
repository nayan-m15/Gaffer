import { test } from 'node:test';
import assert from 'node:assert/strict';
import { yieldSceneTask } from './scene-scheduler.ts';

globalThis.window = { setTimeout, clearTimeout };
globalThis.document = new EventTarget();
document.hidden = false;

test('construction yields so pending input can run before the next batch', async () => {
  const order = [];
  queueMicrotask(() => order.push('input'));
  await yieldSceneTask(new AbortController().signal);
  order.push('construction');
  assert.deepEqual(order, ['input', 'construction']);
});

test('hidden-tab work resumes after visibility returns', async () => {
  document.hidden = true;
  let resumed = false;
  const work = yieldSceneTask(new AbortController().signal).then(() => { resumed = true; });
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(resumed, false);
  document.hidden = false;
  document.dispatchEvent(new Event('visibilitychange'));
  await work;
  assert.equal(resumed, true);
});

test('navigation can cancel initialization even in a hidden tab', async () => {
  document.hidden = true;
  const controller = new AbortController();
  const work = yieldSceneTask(controller.signal);
  controller.abort();
  await assert.rejects(work, { name: 'AbortError' });
  document.hidden = false;
});
