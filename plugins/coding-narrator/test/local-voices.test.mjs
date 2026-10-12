import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { LocalVoices, localPlayback } from '../src/local-voices.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(options = {}) {
  const children = [];
  const requests = [];
  const worker = new LocalVoices({ startupMs: 1000, generationMs: 1000, spawnChild() {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.killed = false;
    child.kill = () => { child.killed = true; setImmediate(() => child.emit('close', 1)); };
    child.stdin.on('data', data => requests.push(JSON.parse(data.toString())));
    children.push(child);
    queueMicrotask(() => child.stdout.write(JSON.stringify({ type: 'ready', voices: [{ name: 'kokoro-heart', label: 'Heart' }] }) + '\n'));
    return child;
  }, ...options });
  // One PCM16 mono sample; real voice synthesis is validated separately.
  const audio = Buffer.alloc(46);
  audio.write('RIFF'); audio.writeUInt32LE(38, 4); audio.write('WAVE', 8);
  audio.write('fmt ', 12); audio.writeUInt32LE(16, 16);
  audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
  audio.writeUInt32LE(24000, 24); audio.writeUInt32LE(48000, 28);
  audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
  audio.write('data', 36); audio.writeUInt32LE(2, 40); audio.writeInt16LE(123, 44);
  const reply = (child, value) => child.stdout.write(JSON.stringify(value) + '\n');
  return { worker, children, requests, audio, reply };
}

test('local synthesis reuses one worker, bounds protocol and cancels before restart', async () => {
  const { worker, children, requests, audio, reply } = fixture();
  try {
    const job = worker.generate({ text: 'Sample.', voice: 'kokoro-heart', volume: 70, rate: 2 });
    await flush();
    assert.equal(requests[0].volume, 70);
    reply(children[0], { id: requests[0].id, audio: audio.toString('base64') });
    assert.deepEqual((await job.done).audio, audio);
    job.cancel();
    assert.equal(children[0].killed, false, 'completed generation retains its warm model');
    const next = worker.generate({ text: 'Next.', voice: 'kokoro-heart', volume: 70, rate: 0 });
    await flush();
    assert.equal(children.length, 1);
    next.cancel();
    assert.deepEqual(await next.done, { cancelled: true });
    await worker.start();
    assert.equal(children.length, 2);
  } finally { worker.close(); await flush(); }
});

test('Windows cancellation targets the owned Python tree and waits for closure', { skip: process.platform !== 'win32' }, async () => {
  let command;
  const setup = fixture({ killTree(file, args, options, callback) {
    command = { file, args, options };
    setImmediate(() => { setup.children[0].emit('close', 1); callback(null); });
  } });
  const job = setup.worker.generate({ text: 'Sample.', voice: 'kokoro-heart', volume: 65, rate: 0 });
  await flush();
  const child = setup.children[0]; child.pid = 112233; child.exitCode = null;
  job.cancel(); job.cancel();
  assert.deepEqual(await job.done, { cancelled: true });
  assert.deepEqual(command.args, ['/PID', '112233', '/T', '/F']);
  assert.equal(command.options.windowsHide, true);
  assert.equal(command.options.timeout, 5000);
  assert.match(command.file, /System32[\\/]taskkill\.exe$/);
  assert.equal(child.killed, false, 'tree termination runs before direct launcher kill');
  await setup.worker.close();
});

test('cleanup failure is bounded and reported rather than acknowledging cancellation', async () => {
  const { worker, children } = fixture({ cleanupMs: 20 });
  const job = worker.generate({ text: 'Sample.', voice: 'kokoro-heart', volume: 65, rate: 0 });
  await flush();
  children[0].kill = () => {};
  const rejected = assert.rejects(job.done, /cleanup could not be confirmed/);
  job.cancel();
  await rejected;
  await worker.close();
});

test('malformed local audio kills the worker and rejects instead of leaving the job pending', async () => {
  const { worker, children, requests, reply } = fixture();
  try {
    const job = worker.generate({ text: 'Sample.', voice: 'kokoro-heart', volume: 80, rate: 0 });
    const rejected = assert.rejects(job.done, /Local synthesis/);
    await flush();
    const malformed = Buffer.alloc(44);
    malformed.write('RIFF'); malformed.writeUInt32LE(36, 4); malformed.write('WAVE', 8);
    reply(children[0], { id: requests[0].id, audio: malformed.toString('base64') });
    await rejected;
    assert.equal(children[0].killed, true);
  } finally { worker.close(); await flush(); }
});

test('local playback waits for generation, reports preparation, and cancels device playback', async () => {
  let resolve;
  let generationCancelled = 0, playbackCancelled = 0, played = 0;
  const generation = { done: new Promise(yes => { resolve = yes; }), cancel() { generationCancelled++; } };
  const playback = { done: Promise.resolve({ completed: true }), cancel() { playbackCancelled++; } };
  const run = localPlayback({ generate: () => generation }, { run: () => { played++; return playback; } });
  const job = run({});
  assert.equal(job.phase, 'generating');
  assert.equal(played, 0);
  resolve({ audio: Buffer.from('test audio') });
  assert.deepEqual(await job.done, { completed: true });
  assert.equal(job.phase, 'playing');
  job.cancel();
  assert.equal(generationCancelled, 1);
  assert.equal(playbackCancelled, 1);
});
