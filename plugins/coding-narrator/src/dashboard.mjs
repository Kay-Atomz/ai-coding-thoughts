import http from 'node:http';
import { readFile } from 'node:fs/promises';

export async function startDashboard(narrator) {
  const html = await readFile(new URL('../web/index.html', import.meta.url));
  const script = await readFile(new URL('../web/controls.js', import.meta.url));
  const css = await readFile(new URL('../web/styles.css', import.meta.url));
  let origin;
  const streams = new Set();
  const broadcast = state => {
    for (const response of streams) {
      if (!response.write(`data: ${JSON.stringify(state)}\n\n`)) response.destroy();
    }
  };
  narrator.on('change', broadcast);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const reply = (code, value) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(value));
    };
    // Bind only loopback and validate Host to prevent DNS rebinding.
    if (req.headers.host !== new URL(origin).host) return reply(403, { error: 'Invalid host.' });
    if (req.headers.origin && req.headers.origin !== origin) return reply(403, { error: 'Use the local control panel.' });
    if (req.headers['sec-fetch-site'] === 'cross-site') return reply(403, { error: 'Cross-site access is not allowed.' });
    if (req.method === 'GET') {
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (req.url === '/controls.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8' });
        return res.end(script);
      }
      if (req.url === '/styles.css') {
        res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
        return res.end(css);
      }
      if (req.url === '/status') return reply(200, narrator.status());
      if (req.url === '/events') {
        if (streams.size >= 8) return reply(429, { error: 'Too many control panels.' });
        res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive' });
        res.write(`data: ${JSON.stringify(narrator.status())}\n\n`);
        streams.add(res);
        const heartbeat = setInterval(() => { if (!res.write(': heartbeat\n\n')) res.destroy(); }, 25000);
        res.on('close', () => { clearInterval(heartbeat); streams.delete(res); });
        return;
      }
      return reply(404, { error: 'Not found.' });
    }
    if (req.method !== 'POST') return reply(405, { error: 'Method not allowed.' });
    // Browser commands require a same-origin JSON request; no CORS or cross-site forms.
    if (req.headers.origin !== origin || req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
      return reply(403, { error: 'Use the local control panel.' });
    }
    if (!['/speak', '/settings', '/stop', '/styles', '/import-style'].includes(req.url)) return reply(404, { error: 'Not found.' });
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 10000) { reply(413, { error: 'Request too large.' }); return; }
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (req.url === '/speak') return reply(200, narrator.speak(body.text, { expectedProvider: body.expectedProvider }));
      if (req.url === '/settings') return reply(200, narrator.configure(body));
      if (req.url === '/styles') return reply(200, narrator.addStyle(body));
      if (req.url === '/import-style') return reply(200, narrator.importStyle(body.markdown));
      return reply(200, narrator.stop());
    } catch {
      reply(400, { error: 'Invalid request. Check text, voice, volume, and speed.' });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${server.address().port}`;
  return {
    url: `${origin}/`,
    close: () => new Promise(resolve => {
      narrator.off('change', broadcast);
      for (const response of streams) response.end();
      server.close(resolve); server.closeAllConnections();
    }),
  };
}
