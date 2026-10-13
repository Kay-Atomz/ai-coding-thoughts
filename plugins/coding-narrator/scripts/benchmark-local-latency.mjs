import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { LocalVoices, localPlayback } from '../src/local-voices.mjs';
import { WindowsWorker } from '../src/windows-worker.mjs';

// Real warm Heart synthesis and Windows playback, with device PCM silenced.
// Playback-start is the actual worker call boundary, not microphone evidence.
const generator = new LocalVoices();
const coldGenerator = new LocalVoices();
const worker = new WindowsWorker();
process.once('SIGINT', () => { worker.close(); generator.close(); coldGenerator.close(); });
process.once('SIGTERM', () => { worker.close(); generator.close(); coldGenerator.close(); });
function silent(encoded) {
  const wave = Buffer.from(encoded, 'base64');
  for (let offset = 12; offset + 8 <= wave.length;) {
    const size = wave.readUInt32LE(offset + 4), start = offset + 8;
    if (wave.toString('ascii', offset, offset + 4) === 'data') wave.fill(0, start, start + size);
    offset = start + size + size % 2;
  }
  return wave.toString('base64');
}
const player = { run(request) {
  const playback = worker.run({ ...request, audio: silent(request.audio) });
  return { done: playback.done, get phase() { return playback.phase; }, cancel: playback.cancel,
    append: audio => playback.append(silent(audio)), finish: playback.finish };
} };
try {
  await coldGenerator.start();
  const cold = performance.now();
  const before = await coldGenerator.generate({ text: 'The changes are pushed to GitHub, and the pull request is open. It includes the shared playback turn, Kokoro Heart as the default, and the recorded validation results.', voice: 'kokoro-heart', volume: 65, rate: 0 }).done;
  console.log(JSON.stringify({ case: 'cold-full-generation', firstClipMs: Math.round(performance.now() - cold), bytes: before.audio.length }));
  await coldGenerator.close();
  await Promise.all([generator.start(), worker.start()]);
  await generator.warmup();
  assert.equal(generator.warmState, 'ready');
  console.log(JSON.stringify({ case: 'silent-startup-warmup', warmupMs: generator.warmupMs }));
  const run = localPlayback(generator, player);
  for (const [name, text] of [['warm-short', 'I am checking the tests.'], ['warm-long', 'The changes are pushed to GitHub, and the pull request is open. It includes the shared playback turn, Kokoro Heart as the default, and the recorded validation results.'], ['warm-short-repeat', 'I am checking the tests.']]) {
    const started = performance.now();
    const job = run({ text, voice: 'kokoro-heart', volume: 65, rate: 0 });
    const submitMs = Number((performance.now() - started).toFixed(2));
    const result = await job.done;
    assert.equal(result.completed, true);
    assert.ok(result.metrics.playbackStartMs >= result.metrics.firstChunkMs);
    console.log(JSON.stringify({ case: name, submitMs, ...result.metrics, fullJobMs: Math.round(performance.now() - started), deviceAudio: 'silent' }));
  }
} finally { worker.close(); await Promise.all([generator.close(), coldGenerator.close()]); }
