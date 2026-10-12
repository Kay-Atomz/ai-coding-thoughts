import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startHostedServer } from '../src/http-server.mjs';
import { widgetUri } from '../src/hosted-tools.mjs';
import http from 'node:http';

test('hosted MCP works over HTTP and reports missing speech setup without simulating audio', { timeout: 20000 }, async () => {
  const instance = await startHostedServer({ local: true, voiceProvider: { available: false } });
  const client = new Client({ name: 'hosted-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(instance.url)));
    const tools = await client.listTools();
    assert.ok(tools.tools.some(value => value.name === 'speak_update'));
    const status = await client.callTool({ name: 'narrator_status', arguments: {} });
    assert.equal(status.structuredContent.naturalVoiceAvailable, false);
    const style = await client.callTool({ name: 'narrator_settings', arguments: { style: 'caveman' } });
    assert.equal(style.structuredContent.narrationStyle.id, 'caveman');
    const resources = await client.readResource({ uri: widgetUri });
    assert.ok(resources.contents[0].text.includes('ui/initialize'));
    assert.ok(!resources.contents[0].text.includes('INLINE_SCRIPT'));
    const missing = await client.callTool({ name: 'speak_update', arguments: { text: 'Sample.' } });
    assert.equal(missing.isError, true);
    assert.equal(missing.content.some(value => value.type === 'audio'), false);
    const response = await fetch(instance.url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' });
    assert.equal(response.status, 415);
  } finally { await client.close(); await instance.close(); }
  assert.equal(instance.metrics().inFlight, 0);
});

test('hosted generated audio uses MCP audio content and private player metadata', { timeout: 20000 }, async () => {
  let called;
  const instance = await startHostedServer({ local: true, voiceProvider: {
    available: true,
    // Protocol fixture only; never wired into production.
    generate: async request => { called = request; return { audio: Buffer.from('test-only-audio-fixture'), mimeType: 'audio/wav', durationMs: 100 }; },
  } });
  const client = new Client({ name: 'hosted-audio-test', version: '1.0.0' });
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(instance.url)));
    const result = await client.callTool({ name: 'speak_update', arguments: { text: 'Sample progress.' } });
    assert.equal(result.structuredContent.generated, true);
    assert.equal(called.text, 'Sample progress.');
    assert.equal(called.volume, 100);
    assert.equal(result.content.find(value => value.type === 'audio').data, result._meta.audio);
    assert.equal('audio' in result.structuredContent, false);
  } finally { await client.close(); await instance.close(); }
});

test('hosted HTTP denies unauthenticated access and advertises OAuth discovery', { timeout: 10000 }, async () => {
  const origin = 'https://narrator.test';
  // HTTP authorization seam fixture; signature/claims validation has a separate JWT test.
  const instance = await startHostedServer({ local: true, voiceProvider: { available: false }, auth: {
    origin,
    metadata: { resource: `${origin}/mcp`, authorization_servers: ['https://issuer.test/'], scopes_supported: ['narrate'] },
    authorize: async req => { if (req.headers.authorization !== 'Bearer test-only-fixture') throw new Error('Denied'); return 'test-owner'; },
  } });
  const send = (path, { method = 'GET', headers = {}, body = '' } = {}) => new Promise((resolve, reject) => {
    const req = http.request(new URL(path, instance.url), { method, headers: { Host: 'narrator.test', ...headers } }, res => {
      const chunks = []; res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    req.on('error', reject); req.end(body);
  });
  try {
    const denied = await send('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 401);
    assert.ok(denied.headers['www-authenticate'].includes(`${origin}/.well-known/oauth-protected-resource`));
    const metadata = await send('/.well-known/oauth-protected-resource');
    assert.equal(metadata.status, 200);
    assert.equal(metadata.body.resource, `${origin}/mcp`);
    const accepted = await send('/mcp', { method: 'POST', headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer test-only-fixture',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'auth-test', version: '1.0' } } }) });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.result.serverInfo.name, 'coding-narrator');
    const foreign = await send('/mcp', { method: 'POST', headers: { Origin: 'https://foreign.test' }, body: '{}' });
    assert.equal(foreign.status, 403);
    assert.equal(instance.metrics().inFlight, 0);
  } finally { await instance.close(); }
});
