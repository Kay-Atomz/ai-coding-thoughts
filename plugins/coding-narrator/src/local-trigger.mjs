export function panelOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use the actual running narrator loopback control-panel URL.');
  }
  return url.origin;
}

export function hookSummary(payload) {
  // Read only event metadata. Never read transcript_path or last_assistant_message.
  if (payload?.hook_event_name === 'Stop') return 'Claude finished an update. The result is ready in your chat.';
  if (payload?.hook_event_name === 'Notification' && ['permission_prompt', 'idle_prompt'].includes(payload.notification_type)) {
    return 'Claude needs your attention. Please check your chat.';
  }
  return null;
}

export async function triggerLocal({ url, text, fetchImpl = fetch }) {
  const origin = panelOrigin(url);
  if (typeof text !== 'string' || !text.trim() || text.length > 600) throw new Error('Use a safe summary of at most 600 characters.');
  const statusResponse = await fetchImpl(`${origin}/status`, { signal: AbortSignal.timeout(3000), redirect: 'error' });
  if (!statusResponse.ok) throw new Error('Narrator is unavailable.');
  const status = await statusResponse.json();
  // This helper is intentionally offline; it cannot silently forward output to an API.
  const provider = status.settings?.provider;
  if (!['windows', 'local'].includes(provider)) throw new Error('Background triggers require an offline voice provider.');
  const response = await fetchImpl(`${origin}/speak`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({ text: text.trim(), expectedProvider: provider }), signal: AbortSignal.timeout(3000), redirect: 'error',
  });
  if (!response.ok) throw new Error('Narrator could not queue the update.');
  const result = await response.json();
  return { accepted: result.accepted === true, reason: result.reason };
}
