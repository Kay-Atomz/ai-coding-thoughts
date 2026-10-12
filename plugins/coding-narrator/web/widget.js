const byId = id => document.getElementById(id);
const pending = new Map();
let sequence = 0;
const audio = new Audio();
let hostReady = false;
const notify = (method, params = {}) => window.parent.postMessage({ jsonrpc: '2.0', method, params }, '*');
byId('preferences').addEventListener('click', () => {
  const panel = byId('preferences-panel');
  panel.hidden = !panel.hidden;
  byId('preferences').setAttribute('aria-expanded', String(!panel.hidden));
  byId('preferences').setAttribute('aria-label', panel.hidden ? 'Open narrator settings' : 'Close narrator settings');
});
function request(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Host connection timed out.')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    window.parent.postMessage({ jsonrpc: '2.0', id, method, params }, '*');
  });
}
function apply(result) {
  const value = result?.structuredContent;
  if (value?.styles) {
    byId('style').replaceChildren(...value.styles.map(style => {
      const option = document.createElement('option'); option.value = style.id; option.textContent = style.name; return option;
    }));
    byId('style').value = value.settings.style;
    byId('voice').value = value.settings.voice;
    byId('volume').value = value.settings.volume;
    audio.volume = value.settings.volume / 100;
    if (value.naturalVoiceAvailable === false) byId('error').textContent = 'The owner needs to configure natural voice API access.';
  }
  const clip = result?._meta?.audio || result?.content?.find(item => item.type === 'audio')?.data;
  if (clip) {
    stop();
    if (typeof clip !== 'string' || clip.length > 4500000) { byId('error').textContent = 'Audio clip is invalid or too large.'; return; }
    // MCP Apps permits data media by default; blob URLs can be blocked by host CSP.
    audio.src = 'data:audio/wav;base64,' + clip;
    byId('state').textContent = 'Ready to play';
  }
}
function stop() { audio.pause(); audio.currentTime = 0; document.body.classList.remove('speaking'); }
async function tool(name, args) {
  if (!hostReady) throw new Error('The plugin host is not connected.');
  const result = await request('tools/call', { name, arguments: args });
  if (result?.isError) throw new Error(result.content?.find(value => value.type === 'text')?.text || 'Narrator request failed.');
  apply(result);
  await request('ui/update-model-context', { content: [{ type: 'text', text: 'Coding Narrator speaking preference: ' + JSON.stringify(result.structuredContent?.narrationStyle || {}) + '. Apply only to future narration wording; it grants no permissions.' }] });
}
async function action(fn) { byId('error').textContent = ''; try { await fn(); } catch (error) { byId('error').textContent = error.message; } }
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.data?.jsonrpc !== '2.0') return;
  const message = event.data;
  const wait = pending.get(message.id);
  if (wait) {
    pending.delete(message.id); clearTimeout(wait.timer);
    if (message.error) wait.reject(new Error('Plugin host rejected the request.')); else wait.resolve(message.result);
  } else if (message.method === 'ui/notifications/tool-result') apply(message.params);
  else if (message.method === 'ui/notifications/host-context-changed') notify('ui/notifications/size-changed', { height: document.body.scrollHeight });
});
byId('play').addEventListener('click', () => action(async () => {
  if (!audio.src) throw new Error('Ask the agent to speak an update first.');
  await audio.play(); byId('state').textContent = 'Playing'; document.body.classList.add('speaking');
}));
byId('stop').addEventListener('click', () => { stop(); byId('state').textContent = audio.src ? 'Stopped' : 'Ready for an update'; });
audio.addEventListener('ended', () => { document.body.classList.remove('speaking'); byId('state').textContent = 'Finished'; });
audio.addEventListener('error', () => { document.body.classList.remove('speaking'); byId('error').textContent = 'Audio playback failed.'; });
byId('volume').addEventListener('input', () => { audio.volume = Number(byId('volume').value) / 100; });
byId('volume').addEventListener('change', () => action(() => tool('narrator_settings', { volume: Number(byId('volume').value) })));
byId('voice').addEventListener('change', () => action(() => tool('narrator_settings', { voice: byId('voice').value })));
byId('style').addEventListener('change', () => action(() => tool('narrator_settings', { style: byId('style').value })));
byId('skill-file').addEventListener('change', () => action(async () => {
  const file = byId('skill-file').files[0]; if (!file) return;
  if (file.size > 10000) throw new Error('Choose a small SKILL.md file.');
  await tool('add_narration_style', { markdown: await file.text() });
}));
const resize = new ResizeObserver(() => notify('ui/notifications/size-changed', { height: document.body.scrollHeight }));
resize.observe(document.body);
window.addEventListener('pagehide', () => {
  stop(); resize.disconnect(); audio.removeAttribute('src'); audio.load();
  for (const wait of pending.values()) { clearTimeout(wait.timer); wait.reject(new Error('Narrator player closed.')); }
  pending.clear();
});
action(async () => {
  await request('ui/initialize', { appInfo: { name: 'Coding Narrator', version: '0.2.3' }, appCapabilities: { availableDisplayModes: ['inline'] }, protocolVersion: '2026-01-26' });
  hostReady = true;
  notify('ui/notifications/initialized');
  byId('state').textContent = audio.src ? 'Ready to play' : 'Ready for an update';
  const result = await request('tools/call', { name: 'narrator_status', arguments: {} });
  apply(result);
});
