import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startDashboard } from '../src/dashboard.mjs';
import { Narrator } from '../src/narrator.mjs';

test('dashboard serves controls, validates input, and blocks foreign browser commands', async () => {
  const narrator = new Narrator({ voices: [], run: () => { throw new Error('Unexpected speech'); } });
  const dashboard = await startDashboard(narrator);
  const origin = new URL(dashboard.url).origin;
  const post = (path, body, headers = {}) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
  try {
    assert.equal((await fetch(dashboard.url)).status, 200);
    assert.equal((await fetch(`${origin}/controls.js`)).status, 200);
    const changed = await post('/settings', { muted: true, volume: 45 });
    assert.equal(changed.status, 200);
    assert.equal((await changed.json()).settings.volume, 45);
    assert.equal((await post('/settings', { volume: -1 })).status, 400);
    assert.equal((await post('/settings', { muted: false }, { Origin: 'https://example.org' })).status, 403);
    assert.equal((await post('/settings', { muted: false }, { 'Content-Type': 'text/plain' })).status, 403);
    assert.equal((await post('/speak', { text: 'a'.repeat(11000) })).status, 413);
    const wrongHostStatus = await new Promise((resolve, reject) => {
      const request = http.get(`${origin}/status`, { headers: { Host: 'example.org' } }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
    });
    assert.equal(wrongHostStatus, 403);
    assert.equal((await fetch(`${origin}/missing`)).status, 404);
    const state = await (await fetch(`${origin}/status`)).json();
    assert.equal(state.settings.muted, true);
    assert.equal(state.settings.volume, 45);
  } finally { narrator.close(); await dashboard.close(); }
});

test('dashboard pushes state changes and disposes event listeners on shutdown', { timeout: 10000 }, async () => {
  const narrator = new Narrator({ voices: [], run: () => { throw new Error('Unexpected speech'); } });
  const dashboard = await startDashboard(narrator);
  let reader;
  try {
    const response = await fetch(new URL('/events', dashboard.url), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.headers.get('content-type'), 'text/event-stream');
    reader = response.body.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    assert.equal(JSON.parse(initial.split('data: ')[1].trim()).settings.volume, 80);
    narrator.configure({ volume: 37 });
    const changed = new TextDecoder().decode((await reader.read()).value);
    assert.equal(JSON.parse(changed.split('data: ')[1].trim()).settings.volume, 37);
    assert.equal(narrator.listenerCount('change'), 1);
  } finally {
    await reader?.cancel();
    await dashboard.close();
    assert.equal(narrator.listenerCount('change'), 0);
    narrator.close();
  }
});
