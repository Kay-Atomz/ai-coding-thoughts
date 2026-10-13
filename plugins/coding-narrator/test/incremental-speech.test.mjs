import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { WindowsWorker } from '../src/windows-worker.mjs';
import { localPlayback } from '../src/local-voices.mjs';
import { speechSegments } from '../src/speech-segments.mjs';

function wave(seconds = 1) {
  const audio = Buffer.alloc(44 + seconds * 48000);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVE', 8);
  audio.write('fmt ', 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24000, 24); audio.writeUInt32LE(48000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  return audio;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('segmentation preserves every word, prefers first clause, and bounds work', () => {
  for (const text of ['I am checking the tests.', 'The changes are pushed to GitHub, and the pull request is open.', 'word '.repeat(120), 'v1.0. API 42. Hello. '.repeat(20)]) {
    const chunks = speechSegments(text);
    assert.equal(chunks.join(' '), text.trim().replace(/\s+/g, ' '));
    assert.ok(chunks.length <= 32);
  }
  assert.equal(speechSegments('The changes are pushed to GitHub, and the pull request is open.')[0], 'The changes are pushed to GitHub,');
});

test('starts first segment before later synthesis finishes and bounds generated lookahead', async () => {
  let nextResolve, finishResolve, appendResolve;
  let calls = 0, played = 0, appended = 0;
  const playback = { done: new Promise(resolve => { finishResolve = resolve; }),
    finish: async () => finishResolve({ completed: true, playback: { startedMs: performance.now() } }),
    append: () => { appended++; return new Promise(resolve => { appendResolve = resolve; }); },
    cancel: () => finishResolve({ cancelled: true }) };
  const generator = { generate() {
    calls++;
    return { done: calls === 1 ? Promise.resolve({ audio: wave() }) : calls === 2 ? new Promise(resolve => { nextResolve = resolve; }) : Promise.resolve({ audio: wave() }), cancel() {} };
  } };
  const job = localPlayback(generator, { run() { played++; return playback; } })({ text: 'I am checking the tests. Another complete sentence follows here. A final sentence is also preserved.' });
  await flush();
  assert.equal(played, 1); assert.equal(calls, 2); assert.equal(appended, 0);
  nextResolve({ audio: wave() }); await flush();
  assert.equal(appended, 1); assert.equal(calls, 2, 'no third segment generated before the queued second is accepted');
  appendResolve(); await flush();
  assert.equal(calls, 3); assert.equal(appended, 2);
  appendResolve();
  const result = await job.done;
  assert.equal(result.completed, true); assert.equal(result.metrics.chunks, 3);
  assert.equal(result.metrics.audioMs, 3000);
});

test('late synthesis failure cancels device stream and is not counted as completion', async () => {
  let calls = 0, cancelled = 0, finish;
  const generator = { generate: () => ({ done: ++calls === 1 ? Promise.resolve({ audio: wave() }) : Promise.reject(new Error('Generation failed.')), cancel() {} }) };
  const player = { run: () => ({ done: new Promise(resolve => { finish = resolve; }), cancel: () => { cancelled++; finish({ cancelled: true }); } }) };
  await assert.rejects(localPlayback(generator, player)({ text: 'The first sentence is spoken. The second sentence fails here.' }).done, /Generation failed/);
  assert.equal(cancelled, 1);
});

test('streamed updates hold one cross-process turn across gaps and recover on stop/error', { skip: process.platform !== 'win32', timeout: 40000 }, async () => {
  const events = [new EventEmitter(), new EventEmitter()];
  const workers = events.map(event => new WindowsWorker({ onStateChange: value => event.emit(value.phase) }));
  const next = (i, phase) => once(events[i], phase, { signal: AbortSignal.timeout(10000) });
  try {
    await Promise.all(workers.map(worker => worker.start()));
    const firstPlaying = next(0, 'playing');
    const first = workers[0].run({ action: 'stream_start', audio: wave().toString('base64') });
    await firstPlaying;
    const waiting = next(1, 'waiting');
    const follower = workers[1].run({ action: 'play', audio: wave().toString('base64') });
    await waiting;
    // Simulate a generation gap after the first silent clip finishes.
    await new Promise(resolve => setTimeout(resolve, 1300));
    assert.equal(follower.phase, 'waiting');
    await first.append(wave().toString('base64')); await first.finish();
    const [a, b] = await Promise.all([first.done, follower.done]);
    assert.ok(BigInt(b.playback.startedAt) >= BigInt(a.playback.finishedAt));
    const starting = next(0, 'playing');
    const stopped = workers[0].run({ action: 'stream_start', audio: wave().toString('base64') });
    await starting;
    stopped.cancel(); assert.equal((await stopped.done).cancelled, true);
    assert.equal((await workers[1].run({ action: 'play', audio: wave().toString('base64') }).done).completed, true);
    const broken = workers[1].run({ action: 'stream_start', audio: wave().toString('base64') });
    const failed = assert.rejects(broken.done, /playback failed/);
    await broken.append(Buffer.from('invalid wave').toString('base64'));
    await failed;
    assert.equal((await workers[0].run({ action: 'play', audio: wave().toString('base64') }).done).completed, true);
  } finally { workers.forEach(worker => worker.close()); }
});
