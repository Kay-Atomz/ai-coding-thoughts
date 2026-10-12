import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RealtimeVoice, pcmToWav } from '../src/realtime-voice.mjs';

class Socket extends EventEmitter {
  constructor() { super(); this.sent = []; this.closed = false; }
  send(value) { this.sent.push(JSON.parse(value)); }
  close() { this.closed = true; }
  event(value) { this.emit('message', Buffer.from(JSON.stringify(value))); }
}
function fixture() {
  const socket = new Socket();
  const provider = new RealtimeVoice({ apiKey: 'test-only-noncredential', connect: () => socket });
  return { socket, provider };
}

test('natural voice uses the documented handshake and assembles real PCM framing', async () => {
  const { socket, provider } = fixture();
  const job = provider.generate({ text: 'Test speech.', voice: 'marin', rate: 2, volume: 50 });
  socket.event({ type: 'session.created' });
  assert.equal(socket.sent[0].session.audio.output.voice, 'marin');
  assert.equal(socket.sent[0].session.audio.output.speed, 1.1);
  socket.event({ type: 'session.updated' });
  socket.event({ type: 'session.updated' });
  assert.equal(socket.sent.length, 2);
  assert.deepEqual(socket.sent[1].response.input, []);
  const pcm = Buffer.alloc(4800); pcm.writeInt16LE(1000);
  socket.event({ type: 'response.output_audio.delta', delta: pcm.toString('base64') });
  socket.event({ type: 'response.done', response: { status: 'completed' } });
  const result = await job;
  assert.equal(result.audio.subarray(0, 4).toString(), 'RIFF');
  assert.equal(result.audio.readInt16LE(44), 500);
  assert.equal(result.durationMs, 100);
  assert.equal(socket.closed, true);
});

test('natural voice cancels, times out, and hides provider diagnostics', async () => {
  const { socket, provider } = fixture();
  const controller = new AbortController();
  const job = provider.generate({ text: 'Test.' }, { signal: controller.signal });
  controller.abort();
  await assert.rejects(job, /cancelled/);
  assert.equal(socket.closed, true);
  assert.equal(controller.signal.aborted, true);
  const failed = fixture();
  const failure = failed.provider.generate({ text: 'Test.' });
  failed.socket.event({ type: 'error', error: { code: 'invalid_api_key', message: 'RAW_DIAGNOSTIC_SAMPLE' } });
  await assert.rejects(failure, error => /authentication failed/.test(error.message) && !error.message.includes('RAW_DIAGNOSTIC_SAMPLE'));
  const slow = fixture();
  await assert.rejects(slow.provider.generate({ text: 'Test.' }, { timeoutMs: 5 }), /timed out/);
  assert.equal(slow.socket.closed, true);
});

test('natural voice fails explicitly without configuration or complete audio', async () => {
  const provider = new RealtimeVoice({ apiKey: '' });
  assert.equal(provider.available, false);
  assert.throws(() => provider.generate({ text: 'Test.' }), /API setup/);
  const fixtureValue = fixture();
  const job = fixtureValue.provider.generate({ text: 'Test.' });
  fixtureValue.socket.event({ type: 'response.done', response: { status: 'completed' } });
  await assert.rejects(job, /complete audio/);
  assert.throws(() => pcmToWav(Buffer.alloc(3)));
});
