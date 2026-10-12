import test from 'node:test';
import assert from 'node:assert/strict';
import { hookSummary, panelOrigin, triggerLocal } from '../src/local-trigger.mjs';
import { Narrator } from '../src/narrator.mjs';
import { startDashboard } from '../src/dashboard.mjs';

test('local trigger queues immediately through the real dashboard and respects mute', async () => {
  let finish;
  const narrator = new Narrator({ voices: [{ name: 'fixture' }], run: () => ({ done: new Promise(resolve => { finish = resolve; }), cancel: () => finish({ cancelled: true }) }) });
  const dashboard = await startDashboard(narrator);
  try {
    const queued = await triggerLocal({ url: dashboard.url, text: 'A safe test summary.' });
    assert.equal(queued.accepted, true);
    assert.equal(narrator.status().state, 'speaking');
    narrator.configure({ muted: true });
    assert.equal((await triggerLocal({ url: dashboard.url, text: 'Muted sample.' })).reason, 'muted');
  } finally { narrator.close(); await dashboard.close(); }
});

test('background events use metadata only, reject foreign destinations and never forward to cloud speech', async () => {
  const payload = { hook_event_name: 'Stop' };
  Object.defineProperty(payload, 'last_assistant_message', { get() { throw new Error('Must not read output'); } });
  Object.defineProperty(payload, 'transcript_path', { get() { throw new Error('Must not read transcript'); } });
  assert.ok(hookSummary(payload).startsWith('Claude finished'));
  assert.equal(hookSummary({ hook_event_name: 'PreToolUse' }), null);
  assert.equal(hookSummary({ hook_event_name: 'Notification', notification_type: 'permission_prompt' }), 'Claude needs your attention. Please check your chat.');
  for (const url of ['https://example.com/', 'http://localhost:8787/', 'http://127.0.0.1:8787/private']) assert.throws(() => panelOrigin(url));
  let calls = 0;
  await assert.rejects(triggerLocal({ url: 'http://127.0.0.1:8787/', text: 'Safe sample.', fetchImpl: async () => {
    calls++; return { ok: true, json: async () => ({ settings: { provider: 'natural' } }) };
  } }), /offline voice/);
  assert.equal(calls, 1);
});

test('installed model triggers pin their offline provider and reject a provider-switch race', async () => {
  const voices = [{ name: 'fixture' }];
  let played = 0;
  const run = () => { played++; return { done: Promise.resolve({ completed: true }), cancel() {} }; };
  const narrator = new Narrator({ voices, providers: {
    windows: { available: true, name: 'Windows', voices, run },
    local: { available: true, name: 'Local models', voices, run },
  } });
  const dashboard = await startDashboard(narrator);
  try {
    narrator.configure({ provider: 'local' });
    assert.equal((await triggerLocal({ url: dashboard.url, text: 'Offline model update.' })).accepted, true);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(played, 1);
    await assert.rejects(triggerLocal({ url: dashboard.url, text: 'Pinned update.', fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith('/status')) {
        const snapshot = await response.json();
        narrator.configure({ provider: 'windows' });
        return { ok: response.ok, json: async () => snapshot };
      }
      return response;
    } }), /could not queue/);
    assert.equal(played, 1);
  } finally { narrator.close(); await dashboard.close(); }
});

test('offline policy is enforced by the server and when a pending update reaches playback', async () => {
  let finish;
  let cloudCalls = 0;
  const voices = [{ name: 'fixture' }];
  const narrator = new Narrator({ voices, providers: {
    windows: { available: true, name: 'Windows', voices, run: () => ({ done: new Promise(resolve => { finish = resolve; }), cancel: () => finish({ cancelled: true }) }) },
    natural: { available: true, name: 'Cloud fixture', voices, run: () => { cloudCalls++; throw new Error('Must not call cloud'); } },
  } });
  const dashboard = await startDashboard(narrator);
  try {
    await assert.rejects(triggerLocal({ url: dashboard.url, text: 'Safe notification.', fetchImpl: async (url, options) => {
      const response = await fetch(url, options);
      if (url.endsWith('/status')) {
        const snapshot = await response.json();
        narrator.configure({ provider: 'natural' });
        return { ok: response.ok, json: async () => snapshot };
      }
      return response;
    } }), /could not queue/);
    assert.equal(cloudCalls, 0);
    narrator.configure({ provider: 'windows' });
    narrator.speak('First fixture job.');
    narrator.speak('Offline queued notification.', { expectedProvider: 'windows' });
    narrator.configure({ provider: 'natural' });
    finish({ completed: true });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(cloudCalls, 0);
    assert.equal(narrator.status().queued, 0);
    assert.equal(narrator.status().cancelled, 1);
  } finally { narrator.close(); await dashboard.close(); }
});
