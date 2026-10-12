import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import { LocalVoices } from '../src/local-voices.mjs';
import { WindowsWorker } from '../src/windows-worker.mjs';

// Optional real-model smoke test, separate from the normal dependency-free suite.
// --play intentionally plays the four labelled test phrases on this computer.
const local = new LocalVoices();
const silentPlayback = process.argv.includes('--silent-playback');
const player = process.argv.includes('--play') || silentPlayback ? new WindowsWorker() : null;
const shutdown = () => { local.close(); player?.close(); process.exitCode = 130; };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
const ids = ['kokoro-heart', 'kokoro-bella', 'kitten-bruno', 'piper-ljspeech'];
const phrase = 'This is a local voice test. Coding narration is ready.';
const pcm = audio => {
  for (let offset = 12; offset + 8 <= audio.length;) {
    const size = audio.readUInt32LE(offset + 4);
    if (audio.toString('ascii', offset, offset + 4) === 'data') return audio.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + size % 2;
  }
  throw new Error('No PCM data.');
};
const deviceAudio = audio => { const copy = Buffer.from(audio); if (silentPlayback) pcm(copy).fill(0); return copy.toString('base64'); };
try {
  const voices = await local.start();
  assert.deepEqual(voices.map(v => v.name).sort(), ids.toSorted());
  if (player) await player.start();
  const launcher = local.child.pid;
  const descendants = process.platform === 'win32' ? JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', `ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${launcher}' | Select-Object -ExpandProperty ProcessId)`], { windowsHide: true, encoding: 'utf8' })) : [];
  const pending = local.generate({ text: phrase, voice: ids[0], volume: 65, rate: 0 });
  const cancelStarted = performance.now();
  setTimeout(() => pending.cancel(), 100);
  assert.equal((await pending.done).cancelled, true);
  assert.ok(performance.now() - cancelStarted < 5000, 'cancellation must finish promptly');
  for (const pid of [launcher, ...descendants]) assert.throws(() => process.kill(pid, 0), 'owned Python processes must be gone');
  let heartFrames;
  for (const voice of ids) {
    const started = performance.now();
    const { audio } = await local.generate({ text: `${voices.find(v => v.name === voice).label}. ${phrase}`, voice, volume: 65, rate: 0 }).done;
    assert.ok(pcm(audio).some(byte => byte !== 0));
    const generationMs = Math.round(performance.now() - started);
    if (player) await player.run({ action: 'play', audio: deviceAudio(audio) }).done;
    console.log(JSON.stringify({ voice, wavBytes: audio.length, generationMs, playback: player ? (silentPlayback ? 'silent device playback completed' : 'completed') : 'not requested' }));
  }
  const normal = await local.generate({ text: phrase, voice: ids[0], volume: 65, rate: 0 }).done;
  heartFrames = pcm(normal.audio).length;
  const muted = await local.generate({ text: phrase, voice: ids[0], volume: 0, rate: 0 }).done;
  assert.ok(pcm(muted.audio).every(byte => byte === 0), 'volume zero must be silent');
  const faster = await local.generate({ text: phrase, voice: ids[0], volume: 65, rate: 5 }).done;
  assert.ok(pcm(faster.audio).length < heartFrames, 'higher rate must shorten audio');
  if (player) {
    const playback = player.run({ action: 'play', audio: deviceAudio(normal.audio) });
    setTimeout(() => playback.cancel(), 150);
    assert.equal((await playback.done).cancelled, true);
    assert.equal((await player.run({ action: 'play', audio: deviceAudio(faster.audio) }).done).completed, true);
  }
  console.log(JSON.stringify({ generationCancellation: 'passed', volume: 'passed', rate: 'passed', playbackCancellation: player ? 'passed' : 'not requested', modelWorkerSpawns: local.spawns }));
} finally { await local.close(); player?.close(); }
