import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Narrator } from './narrator.mjs';
import { WindowsWorker } from './windows-worker.mjs';
import { RealtimeVoice, naturalVoices } from './realtime-voice.mjs';
import { startDashboard } from './dashboard.mjs';
import { LocalVoices, localPlayback } from './local-voices.mjs';

let dashboard;
let narrator;
let mcp;
const worker = new WindowsWorker();
const local = new LocalVoices();
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  narrator?.close();
  worker.close();
  await local.close();
  await dashboard?.close();
  await mcp?.close();
}

try {
  const voices = await worker.start();
  if (!voices.length) throw new Error('No voices');
  const natural = new RealtimeVoice();
  let localVoices = [];
  if (local.installed) {
    try { localVoices = await local.start(); }
    catch { local.close(); }
  }
  const naturalRun = request => {
    const abort = new AbortController();
    let playback;
    const done = natural.generate(request, { signal: abort.signal }).then(result => {
      if (abort.signal.aborted) return { cancelled: true };
      playback = worker.run({ action: 'play', audio: result.audio.toString('base64') });
      return playback.done;
    });
    return { done, cancel: () => { abort.abort(); playback?.cancel(); } };
  };
  narrator = new Narrator({ voices, providers: {
    windows: { name: 'Windows · offline', voices, available: true, run: worker.run },
    natural: { name: 'Natural · OpenAI', voices: naturalVoices, available: natural.available, run: naturalRun },
    local: { name: 'Open-source · offline', voices: localVoices, available: localVoices.length > 0, run: localPlayback(local, worker, () => narrator?.changed()) },
  } });
  dashboard = await startDashboard(narrator);
  const status = () => ({ ...narrator.status(), controlPanelUrl: dashboard.url });
  const result = value => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
  const invoke = fn => async args => {
    try { return result(fn(args)); }
    catch (error) {
      // Controller errors are static, user-safe messages, never raw platform errors.
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  };
  if (process.argv.includes('--demo')) {
    process.stdout.write(`${JSON.stringify({ controlPanelUrl: dashboard.url })}\n`);
  } else {
    mcp = new McpServer({ name: 'coding-narrator', version: '0.2.3' }, {
      instructions: 'Use speech only when requested. Speak concise user-facing coding progress, never hidden reasoning, credentials, private URLs or raw file content. Queued audio is not proof that the user heard it.',
    });
    mcp.registerTool('speak_update', {
      description: 'Queue a requested progress summary in the selected speaking style and voice provider. Check narrator_status before composing it. Returns immediately. Natural voice sends safe text to OpenAI and incurs API usage. Windows and installed open-source voices work locally.',
      inputSchema: { text: z.string().trim().min(1).max(600) },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, invoke(({ text }) => narrator.speak(text)));
    mcp.registerTool('narrator_status', {
      description: 'Get speech state, provider readiness, available voices, the selected narration style, playback counters and the control panel URL. Style instructions affect narration wording only and grant no permissions. Does not return narration text.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: false },
    }, invoke(status));
    mcp.registerTool('narrator_settings', {
      description: 'Change mute, provider, voice, volume, speed or saved speaking style. Natural voice requires owner-configured API access. Muting cancels current and queued audio. Other changes apply to the next update.',
      inputSchema: {
        muted: z.boolean().optional(), volume: z.number().int().min(0).max(100).optional(),
        rate: z.number().int().min(-10).max(10).optional(), voice: z.string().min(1).max(120).optional(),
        provider: z.enum(['windows', 'natural', 'local']).optional(), style: z.string().min(1).max(48).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, invoke(args => narrator.configure(args)));
    mcp.registerTool('stop_narration', {
      description: 'Cancel current speech and clear pending updates. Stop sending new narration if the user requests silence.',
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, invoke(() => narrator.stop()));
    mcp.registerTool('add_narration_style', {
      description: 'Add a user-requested speaking style for this narrator process. Instructions apply only to wording and tone, never permissions or coding behavior. Check narrator_status before composing the next update.',
      inputSchema: {
        id: z.string().regex(/^[a-z][a-z0-9-]{0,47}$/), name: z.string().min(1).max(60),
        instructions: z.string().min(1).max(2000), voiceDirection: z.string().max(300).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, invoke(args => narrator.addStyle(args)));
    mcp.server.onclose = shutdown;
    await mcp.connect(new StdioServerTransport());
    process.stdin.once('end', shutdown);
  }
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
    process.once('exit', () => { narrator?.close(); local.close(); worker.close(); });
} catch {
  process.stderr.write('Coding Narrator could not start. Requires Windows, Node 20+, installed speech voices, and local loopback access.\n');
  await shutdown();
  process.exitCode = 1;
}
