import assert from 'node:assert/strict';
import { once, EventEmitter } from 'node:events';
import { LocalVoices } from '../src/local-voices.mjs';
import { WindowsWorker } from '../src/windows-worker.mjs';

// Actual independent model workers; device audio is explicitly silenced.
const models = [new LocalVoices(), new LocalVoices()];
const events = [new EventEmitter(), new EventEmitter()];
const players = events.map(event => new WindowsWorker({ onStateChange: value => event.emit(value.phase) }));
const voices = ['kokoro-heart', 'kitten-bruno'];
function silent(audio) {
  const copy = Buffer.from(audio);
  for (let offset = 12; offset + 8 <= copy.length;) {
    const size = copy.readUInt32LE(offset + 4);
    if (copy.toString('ascii', offset, offset + 4) === 'data') { copy.fill(0, offset + 8, offset + 8 + size); return copy.toString('base64'); }
    offset += 8 + size + size % 2;
  }
  throw new Error('PCM data is missing.');
}
try {
  await Promise.all([...models.map(model => model.start()), ...players.map(player => player.start())]);
  const clips = await Promise.all(models.map((model, i) => model.generate({ text: 'This is a local coordination check. Two different voices must wait for their speaking turn.', voice: voices[i], volume: 65, rate: 0 }).done));
  const began = once(events[0], 'playing', { signal: AbortSignal.timeout(10000) });
  const first = players[0].run({ action: 'play', audio: silent(clips[0].audio) });
  await began;
  const waiting = once(events[1], 'waiting', { signal: AbortSignal.timeout(10000) });
  const second = players[1].run({ action: 'play', audio: silent(clips[1].audio) });
  await waiting;
  const [a, b] = await Promise.all([first.done, second.done]);
  assert.ok(BigInt(b.playback.startedAt) >= BigInt(a.playback.finishedAt));
  console.log(JSON.stringify({ voices, independentModelProcesses: models.length, wavBytes: clips.map(clip => clip.audio.length), waiting: 'observed', nonOverlappingDevicePlayback: 'passed', deviceAudio: 'silent' }));
} finally { players.forEach(player => player.close()); await Promise.all(models.map(model => model.close())); }
