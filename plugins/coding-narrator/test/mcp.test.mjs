import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('Windows MCP connection advertises tools and controls real narrator state', { skip: process.platform !== 'win32', timeout: 45000 }, async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], stderr: 'pipe',
  });
  const client = new Client({ name: 'narrator-test', version: '1.0.0' });
  let panel;
  const parse = result => JSON.parse(result.content[0].text);
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(t => t.name).sort(), ['add_narration_style', 'narrator_settings', 'narrator_status', 'speak_update', 'stop_narration']);
    const state = parse(await client.callTool({ name: 'narrator_status', arguments: {} }));
    assert.ok(state.voices.length > 0);
    assert.equal(state.providers.find(value => value.id === 'natural').available, false);
    const style = parse(await client.callTool({ name: 'narrator_settings', arguments: { style: 'caveman' } }));
    assert.equal(style.narrationStyle.id, 'caveman');
    panel = state.controlPanelUrl;
    assert.equal((await fetch(panel)).status, 200);
    await client.callTool({ name: 'narrator_settings', arguments: { muted: true } });
    const muted = parse(await client.callTool({ name: 'speak_update', arguments: { text: 'Muted test sample.' } }));
    assert.equal(muted.reason, 'muted');
    const invalid = await client.callTool({ name: 'narrator_settings', arguments: { volume: 101 } });
    assert.equal(invalid.isError, true);
    const stopped = parse(await client.callTool({ name: 'stop_narration', arguments: {} }));
    assert.equal(stopped.queued, 0);
  } finally { await client.close(); }
  await assert.rejects(fetch(panel, { signal: AbortSignal.timeout(2000) }));
});
