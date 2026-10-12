import { hookSummary, triggerLocal } from '../src/local-trigger.mjs';

const hookMode = process.argv.includes('--claude-hook');
try {
  const argument = process.argv.indexOf('--panel-url');
  const url = argument >= 0 ? process.argv[argument + 1] : process.env.NARRATOR_PANEL_URL;
  if (!url) throw new Error('A running control panel is required.');
  const chunks = [];
  let bytes = 0;
  const timer = setTimeout(() => process.stdin.destroy(new Error('Input timed out.')), 5000);
  try {
    for await (const chunk of process.stdin) {
      bytes += chunk.length;
      if (bytes > (hookMode ? 65536 : 2400)) throw new Error('Input too large.');
      chunks.push(chunk);
    }
  } finally { clearTimeout(timer); }
  const input = Buffer.concat(chunks).toString('utf8');
  const text = hookMode ? hookSummary(JSON.parse(input)) : input.trim();
  if (text) {
    const result = await triggerLocal({ url, text });
    if (!hookMode) process.stdout.write(result.accepted ? 'Narration queued.\n' : 'Narration not queued (muted or queue full).\n');
  }
} catch {
  process.stderr.write('Narrator trigger unavailable. Check its loopback URL, offline provider, input and running service.\n');
  // Background hooks never return blocking decisions or control agent execution.
  if (!hookMode) process.exitCode = 1;
}
