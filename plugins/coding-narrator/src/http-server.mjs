import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createHostedMcp } from './hosted-tools.mjs';
import { HostedState } from './hosted-state.mjs';
import { RealtimeVoice } from './realtime-voice.mjs';
import { createHostedAuth } from './auth.mjs';

export async function startHostedServer({ local = false, port = 0, auth, voiceProvider = new RealtimeVoice(), stateStore = new HostedState() } = {}) {
  if (!local && !auth) auth = createHostedAuth();
  const expectedHost = auth ? new URL(auth.origin).host : null;
  let boundHost;
  let inFlight = 0;
  let failures = 0;
  const active = new Set();
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const json = (code, value) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(value)); };
    if (req.headers.host !== (expectedHost ?? boundHost)) return json(403, { error: 'Invalid host.' });
    const pathname = req.url?.split('?')[0];
    if (req.method === 'GET' && pathname === '/health') return json(200, { status: 'ok', version: '0.2.4', naturalVoiceConfigured: voiceProvider.available });
    if (req.method === 'GET' && pathname === '/.well-known/oauth-protected-resource' && auth) return json(200, auth.metadata);
    if (pathname !== '/mcp') return json(404, { error: 'Not found.' });
    if (req.method !== 'POST') return json(405, { error: 'Use MCP POST requests.' });
    if (req.headers.origin && req.headers.origin !== (auth?.origin ?? `http://${boundHost}`)) return json(403, { error: 'Cross-origin access denied.' });
    let subject = 'local-development';
    if (auth) {
      try { subject = await auth.authorize(req); }
      catch {
        res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${auth.origin}/.well-known/oauth-protected-resource", scope="narrate"`);
        return json(401, { error: 'Authentication and narration access required.' });
      }
    }
    if (inFlight >= 8) return json(429, { error: 'Narrator capacity reached. Try later.' });
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(415, { error: 'JSON requests required.' });
    inFlight++;
    let mcp;
    let transport;
    const cleanup = async () => {
      if (!active.has(cleanup)) return;
      active.delete(cleanup); inFlight--;
      await transport?.close(); await mcp?.close();
    };
    active.add(cleanup);
    res.once('close', cleanup);
    try {
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) { json(413, { error: 'Request too large.' }); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      mcp = await createHostedMcp({ subject, stateStore, voiceProvider });
      if (res.destroyed) { await mcp.close(); return; }
      transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      await mcp.connect(transport);
      if (res.destroyed) { await transport.close(); await mcp.close(); return; }
      await transport.handleRequest(req, res, body);
    } catch {
      failures++;
      if (!res.headersSent) json(400, { error: 'Invalid MCP request.' }); else res.end();
    } finally { if (res.writableEnded) await cleanup(); }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, local ? '127.0.0.1' : '0.0.0.0', resolve); });
  boundHost = `127.0.0.1:${server.address().port}`;
  return {
    url: `http://${boundHost}/mcp`, metrics: () => ({ inFlight, failures }),
    close: async () => { await Promise.all([...active].map(cleanup => cleanup())); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const local = process.argv.includes('--local-http');
    const instance = await startHostedServer({ local, port: Number(process.env.PORT ?? 8787) });
    process.stdout.write(local ? `Local development MCP: ${instance.url}\n` : 'Hosted Coding Narrator ready.\n');
    let closing = false;
    const stop = async () => { if (closing) return; closing = true; await instance.close(); };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
  } catch { process.stderr.write('Hosted narrator could not start. Configure HTTPS origin, OAuth issuer/JWKS/audience, and allowed user subjects; see deployment docs.\n'); process.exitCode = 1; }
}
