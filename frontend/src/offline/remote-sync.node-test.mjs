import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RemoteSyncLifecycle } from './remote-sync.ts';

function harness(fetchToken = async () => ({ endpoint: 'https://sync.test', token: 'token' })) {
  const connections = [];
  let disconnects = 0, tokens = 0, signal, unauthorized;
  const lifecycle = new RemoteSyncLifecycle((abortSignal, expire) => {
    signal = abortSignal; unauthorized = expire;
    return { fetchCredentials: () => { tokens++; return fetchToken(); }, uploadData: async () => {} };
  });
  const db = { connect: connector => { connections.push(connector); return new Promise(() => {}); }, disconnect: async () => { disconnects++; } };
  return { lifecycle, db, connections, get tokens() { return tokens; }, get disconnects() { return disconnects; }, get signal() { return signal; }, expire: () => unauthorized() };
}

test('opening local storage while signed out does not connect; confirmed login connects once', async () => {
  const h = harness();
  await h.lifecycle.attach(h.db);
  assert.equal(h.connections.length, 0);
  await h.lifecycle.setAuthenticated(true);
  await h.lifecycle.setAuthenticated(true);
  assert.equal(h.connections.length, 1);
  assert.equal((await h.connections[0].fetchCredentials()).token, 'token');
  await h.lifecycle.setAuthenticated(false);
  assert.equal(h.disconnects, 1);
  assert.equal(h.signal.aborted, true);
  for (let i = 0; i < 4; i++) assert.equal(await h.connections[0].fetchCredentials(), null);
  assert.equal(h.tokens, 1);
});

test('late credentials cannot reconnect after logout; reauthentication gets a fresh connector', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  await h.lifecycle.setAuthenticated(true);
  await h.lifecycle.attach(h.db);
  const pending = h.connections[0].fetchCredentials();
  await h.lifecycle.setAuthenticated(false);
  resolve({ endpoint: 'https://sync.test', token: 'stale' });
  assert.equal(await pending, null);
  await h.lifecycle.setAuthenticated(true);
  assert.equal(h.connections.length, 2);
  assert.equal(await h.connections[0].fetchCredentials(), null);
});

test('expired token stops remote sync and latches retries until authentication is confirmed again', async () => {
  const h = harness();
  await h.lifecycle.attach(h.db);
  await h.lifecycle.setAuthenticated(true);
  h.expire();
  await h.lifecycle.setAuthenticated(false);
  assert.equal(await h.connections[0].fetchCredentials(), null);
  assert.equal(h.tokens, 0);
  await h.lifecycle.detach();
  await h.lifecycle.attach(h.db);
  assert.equal(h.connections.length, 1, 'local storage can reopen offline without starting remote sync');
});

test('overlapping confirmation, logout and login cannot start duplicate connections', async () => {
  const h = harness();
  await h.lifecycle.attach(h.db);
  await Promise.all([h.lifecycle.setAuthenticated(true), h.lifecycle.setAuthenticated(false), h.lifecycle.setAuthenticated(true)]);
  assert.equal(h.connections.length, 1);
  await Promise.all([h.lifecycle.attach(h.db), h.lifecycle.setAuthenticated(true)]);
  assert.equal(h.connections.length, 1);
});
