import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { WindowsWorker } from '../src/windows-worker.mjs';
import { Narrator } from '../src/narrator.mjs';
import { localPlayback } from '../src/local-voices.mjs';
import { runWindowsSpeech } from '../src/speech.mjs';
import { performance } from 'node:perf_hooks';

function silentWave(seconds = 1) {
  const bytes = 24000 * 2 * seconds;
  const audio = Buffer.alloc(44 + bytes);
  audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVE', 8);
  audio.write('fmt ', 12); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24000, 24); audio.writeUInt32LE(48000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(bytes, 40);
  return audio;
}
function fixture() {
  const events = new EventEmitter();
  const worker = new WindowsWorker({ onStateChange: value => events.emit(value.phase, value) });
  const next = phase => once(events, phase, { signal: AbortSignal.timeout(10000) });
  return { worker, next };
}

test('independent Windows processes serialize speech and WAVs, recover abandoned turns, and isolate cancellation', { skip: process.platform !== 'win32', timeout: 60000 }, async () => {
  const a = fixture(), b = fixture();
  try {
    await Promise.all([a.worker.start(), b.worker.start()]);
    const playingA = a.next('playing');
    const first = a.worker.run({ action: 'speak', text: 'This is a silent coordination test. Another narrator must wait until this voice has finished speaking.', voice: a.worker.voices[0].name, volume: 0, rate: 0 });
    await playingA;
    const waitingB = b.next('waiting');
    const second = b.worker.run({ action: 'play', audio: silentWave().toString('base64') });
    await waitingB;
    assert.equal(second.phase, 'waiting');
    const [resultA, resultB] = await Promise.all([first.done, second.done]);
    assert.ok(BigInt(resultB.playback.startedAt) >= BigInt(resultA.playback.finishedAt), 'actual audio intervals must not overlap');

    // A killed owner abandons its turn; the waiter must acquire it and finish.
    const ownerPlaying = a.next('playing');
    const owner = a.worker.run({ action: 'play', audio: silentWave(4).toString('base64') });
    await ownerPlaying;
    const followerWaiting = b.next('waiting');
    const follower = b.worker.run({ action: 'play', audio: silentWave().toString('base64') });
    await followerWaiting;
    owner.cancel();
    assert.equal((await owner.done).cancelled, true);
    assert.equal((await follower.done).completed, true);

    // Stopping a waiter must leave the owner and its turn alone.
    const otherPlaying = b.next('playing');
    const other = b.worker.run({ action: 'play', audio: silentWave(2).toString('base64') });
    await otherPlaying;
    const cancelledWaiting = a.next('waiting');
    const cancelled = a.worker.run({ action: 'play', audio: silentWave().toString('base64') });
    await cancelledWaiting;
    cancelled.cancel();
    assert.equal((await cancelled.done).cancelled, true);
    assert.equal((await other.done).completed, true);
    assert.equal((await a.worker.run({ action: 'play', audio: silentWave().toString('base64') }).done).completed, true);

    // Device/format failure must release the gate for other sessions.
    await assert.rejects(b.worker.run({ action: 'play', audio: Buffer.from('invalid wave').toString('base64') }).done, /playback failed/);
    assert.equal((await a.worker.run({ action: 'play', audio: silentWave().toString('base64') }).done).completed, true);

    // The older one-shot entry point must share the very same device gate.
    const held = b.next('playing');
    const holder = b.worker.run({ action: 'play', audio: silentWave(4).toString('base64') });
    await held;
    const started = performance.now();
    const legacy = runWindowsSpeech({ action: 'speak', text: 'A silent test.', voice: a.worker.voices[0].name, volume: 0, rate: 0 });
    await Promise.all([holder.done, legacy.done]);
    assert.ok(performance.now() - started >= 4000, 'one-shot audio must wait for the existing device owner');
  } finally { a.worker.close(); b.worker.close(); }
});

test('Heart is the installed default and generated providers expose waiting without losing cancellation', async () => {
  let phase = 'waiting', resolve;
  const playback = { get phase() { return phase; }, done: new Promise(yes => { resolve = yes; }), cancel: () => resolve({ cancelled: true }) };
  const run = localPlayback({ generate: () => ({ done: Promise.resolve({ audio: silentWave() }), cancel() {} }) }, { run: () => playback });
  const voices = [{ name: 'kokoro-heart' }, { name: 'kitten-bruno' }];
  const narrator = new Narrator({ voices: [{ name: 'Windows fixture' }], providers: {
    windows: { available: true, voices: [{ name: 'Windows fixture' }], run },
    local: { available: true, voices, run },
  } });
  try {
    assert.equal(narrator.settings.provider, 'local');
    assert.equal(narrator.settings.voice, 'kokoro-heart');
    narrator.speak('Safe summary.');
    await new Promise(yes => setImmediate(yes));
    assert.equal(narrator.status().state, 'waiting');
    phase = 'playing';
    assert.equal(narrator.status().state, 'speaking');
    narrator.stop();
    await new Promise(yes => setImmediate(yes));
    assert.equal(narrator.status().state, 'idle');
    assert.equal(narrator.status().cancelled, 1);
    assert.equal(narrator.status().completed, 0);
  } finally { narrator.close(); }
});
