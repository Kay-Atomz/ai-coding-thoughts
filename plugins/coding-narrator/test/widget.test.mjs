import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

test('player bridge initializes, plays policy-compatible media, sends context requests and disposes resources', async () => {
  // Isolated browser/host protocol fixture; not evidence of actual ChatGPT rendering.
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', hidden: true, handlers: new Map(),
      addEventListener(type, fn) { this.handlers.set(type, fn); }, replaceChildren() {},
      setAttribute(name, value) { this[name] = value; },
    });
    return elements.get(id);
  };
  const listeners = new Map();
  const messages = [];
  const classes = new Set();
  const timers = new Set();
  const settings = { style: 'clear', voice: 'marin', volume: 80 };
  const status = () => ({ structuredContent: {
    naturalVoiceAvailable: true, styles: [{ id: 'clear', name: 'Clear' }, { id: 'caveman', name: 'Caveman' }],
    settings: { ...settings }, narrationStyle: { id: settings.style, instructions: 'Keep facts accurate.' },
  } });
  const parent = { postMessage(message) {
    messages.push(message);
    if (message.method === 'tools/call' && message.params.name === 'narrator_settings') Object.assign(settings, message.params.arguments);
    if (message.id !== undefined) queueMicrotask(() => listeners.get('message')({ source: parent, data: {
      jsonrpc: '2.0', id: message.id, result: message.method === 'tools/call' ? status() : {},
    } }));
  } };
  let audio;
  let resize;
  class AudioFixture {
    constructor() { audio = this; this.src = ''; this.handlers = new Map(); }
    addEventListener(type, fn) { this.handlers.set(type, fn); }
    pause() { this.paused = true; }
    async play() { this.played = true; }
    removeAttribute(name) { if (name === 'src') this.src = ''; }
    load() { this.released = true; }
  }
  const sandbox = {
    window: { parent, addEventListener: (type, fn) => listeners.set(type, fn) },
    document: { getElementById: element, createElement: () => ({}), body: {
      scrollHeight: 650, classList: { add: value => classes.add(value), remove: value => classes.delete(value) },
    } },
    Audio: AudioFixture,
    ResizeObserver: class { constructor() { resize = this; } observe() {} disconnect() { this.closed = true; } },
    setTimeout(fn, ms) { const id = setTimeout(fn, ms); timers.add(id); return id; },
    clearTimeout(id) { timers.delete(id); clearTimeout(id); },
  };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  try {
    runInNewContext(await readFile(new URL('../web/widget.js', import.meta.url), 'utf8'), sandbox);
    await flush();
    assert.equal(messages[0].method, 'ui/initialize');
    assert.equal(messages[0].params.appCapabilities.availableDisplayModes[0], 'inline');
    assert.equal(element('state').textContent, 'Ready for an update');
    element('preferences').handlers.get('click')();
    assert.equal(element('preferences-panel').hidden, false);
    assert.equal(element('preferences')['aria-expanded'], 'true');
    element('preferences').handlers.get('click')();
    assert.equal(element('preferences-panel').hidden, true);
    listeners.get('message')({ source: parent, data: { jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: {
      _meta: { audio: Buffer.from('test-only-media-fixture').toString('base64') },
    } } });
    assert.ok(audio.src.startsWith('data:audio/wav;base64,'));
    await element('play').handlers.get('click')();
    assert.equal(audio.played, true);
    assert.ok(classes.has('speaking'));
    element('volume').value = '20';
    element('volume').handlers.get('input')();
    assert.equal(audio.volume, 0.2);
    await element('volume').handlers.get('change')();
    assert.ok(messages.some(message => message.method === 'tools/call' && message.params.name === 'narrator_settings' && message.params.arguments.volume === 20));
    element('style').value = 'caveman';
    await element('style').handlers.get('change')();
    assert.equal(Number(element('volume').value), 20);
    assert.equal(audio.volume, 0.2);
    const update = messages.find(message => message.method === 'ui/update-model-context' && message.params.content[0].text.includes('caveman'));
    assert.equal(typeof update.id, 'number');
    assert.ok(update.params.content[0].text.includes('caveman'));
    assert.equal(timers.size, 0);
  } finally {
    listeners.get('pagehide')?.();
    for (const timer of timers) clearTimeout(timer);
  }
  assert.equal(audio.src, '');
  assert.equal(audio.released, true);
  assert.equal(resize.closed, true);
  assert.equal(classes.has('speaking'), false);
});
