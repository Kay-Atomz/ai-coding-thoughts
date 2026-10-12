const element = id => document.getElementById(id);
let state;
let connection;
let actionError = '';
element('preferences').addEventListener('click', () => {
  const panel = element('preferences-panel');
  panel.hidden = !panel.hidden;
  element('preferences').setAttribute('aria-expanded', String(!panel.hidden));
  element('preferences').setAttribute('aria-label', panel.hidden ? 'Open narrator settings' : 'Close narrator settings');
});
async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Narrator request failed.');
  return result;
}
function options(id, values, selected) {
  const select = element(id);
  const signature = JSON.stringify(values);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...values.map(value => {
      const option = document.createElement('option');
      option.value = value.id ?? value.name;
      option.textContent = value.label ?? value.name;
      option.disabled = value.available === false;
      return option;
    }));
    select.dataset.options = signature;
  }
  if (document.activeElement !== select) select.value = selected;
}
function render(next) {
  state = next;
  document.body.classList.toggle('speaking', ['speaking', 'preparing'].includes(state.state));
  document.body.classList.toggle('muted', state.settings.muted);
  const labels = { idle: 'Ready for updates', preparing: 'Preparing voice…', waiting: 'Waiting for another narrator…', speaking: 'Speaking', muted: 'Narration muted', closed: 'Narrator stopped' };
  element('state').textContent = labels[state.state] || 'Unknown state';
  element('toggle').setAttribute('aria-label', state.settings.muted ? 'Enable narration' : 'Mute narration');
  element('toggle').setAttribute('aria-pressed', String(state.settings.muted));
  element('toggle-icon').setAttribute('d', state.settings.muted ? 'M8 5v14l11-7z' : 'M8 5h3v14H8zm5 0h3v14h-3z');
  options('style', state.styles, state.settings.style);
  options('provider', state.providers, state.settings.provider);
  options('voice', state.voices, state.settings.voice);
  for (const key of ['volume', 'rate']) {
    if (document.activeElement !== element(key)) element(key).value = state.settings[key];
  }
  element('volume-value').textContent = element('volume').value;
  element('rate-value').textContent = element('rate').value === '0' ? 'Normal' : element('rate').value;
  element('metrics').textContent = state.queued ? state.queued + ' queued' : state.completed + ' updates spoken';
  element('error').textContent = actionError || state.lastError || '';
  element('provider-note').textContent = state.settings.provider === 'local'
    ? 'These voices run on your computer. The first update loads the model; following updates reuse it. No cloud fallback.'
    : state.settings.provider === 'natural'
      ? 'Natural speech sends each safe update to OpenAI. API usage is billed.'
      : 'Windows works offline. Open-source voices require the optional local installation.';
  document.querySelector('.badge').textContent = state.settings.provider === 'natural' ? 'Natural voice' : 'Local voice';
}
async function action(fn) {
  actionError = '';
  try { const result = await fn(); if (result?.settings) render(result); }
  catch (error) { actionError = error.message; element('error').textContent = actionError; }
}
element('toggle').addEventListener('click', () => action(() => request('/settings', { muted: !state?.settings.muted })));
element('stop').addEventListener('click', () => action(() => request('/stop', {})));
for (const key of ['voice', 'style', 'provider']) {
  element(key).addEventListener('change', () => action(() => request('/settings', { [key]: element(key).value })));
}
for (const key of ['volume', 'rate']) {
  element(key).addEventListener('input', () => { element(key + '-value').textContent = key === 'rate' && element(key).value === '0' ? 'Normal' : element(key).value; });
  element(key).addEventListener('change', () => action(() => request('/settings', { [key]: Number(element(key).value) })));
}
element('test').addEventListener('click', () => action(async () => {
  const samples = { clear: 'This is a voice sample. I can speak short progress updates while you work.', caveman: 'Me voice ready. Me speak short. Me keep facts true.', teacher: 'Here is a voice sample. Short updates help you follow the work without interrupting it.' };
  const result = await request('/speak', { text: samples[state?.settings.style] || 'This is a sample of your selected voice. The agent applies your speaking instructions to future updates.' });
  if (!result.accepted) throw new Error(result.reason === 'muted' ? 'Enable narration before testing.' : 'Speech queue is full.');
}));
element('style-form').addEventListener('submit', event => {
  event.preventDefault();
  action(() => {
    const name = element('style-name').value.trim();
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return request('/styles', { id, name, instructions: element('style-instructions').value });
  });
});
element('skill-file').addEventListener('change', () => action(async () => {
  const file = element('skill-file').files[0];
  if (!file) return;
  if (file.size > 10000) throw new Error('Choose a small SKILL.md file under 4000 characters.');
  return request('/import-style', { markdown: await file.text() });
}));
element('export-style').addEventListener('click', () => {
  if (!state?.narrationStyle) return;
  const profile = state.narrationStyle;
  const text = '---\nname: ' + profile.id + '\ndescription: Speaking style for Coding Narrator.\n---\n\n' + profile.instructions + '\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
  const link = document.createElement('a');
  link.href = url; link.download = profile.id + '-SKILL.md'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
function connect() {
  connection?.close();
  connection = new EventSource('/events');
  connection.onmessage = event => { try { render(JSON.parse(event.data)); } catch { element('error').textContent = 'Invalid narrator status.'; } };
  connection.onerror = () => { element('state').textContent = 'Reconnecting…'; element('error').textContent = 'Control connection interrupted. Retrying automatically.'; };
}
window.addEventListener('pagehide', () => connection?.close());
window.addEventListener('pageshow', event => { if (event.persisted) connect(); });
request('/status').then(render).catch(() => { element('error').textContent = 'Narrator is unavailable.'; });
connect();

