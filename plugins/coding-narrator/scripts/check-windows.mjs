import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWindowsSpeech } from '../src/speech.mjs';

const directory = await mkdtemp(join(tmpdir(), 'coding-narrator-check-'));
try {
  const { voices } = await runWindowsSpeech({ action: 'voices' }).done;
  assert.ok(voices.length > 0, 'At least one enabled Windows voice is required.');
  const wavePath = join(directory, 'sample.wav');
  const result = await runWindowsSpeech({
    action: 'speak', text: 'Coding Narrator is ready to speak progress updates.',
    volume: 80, rate: 0, voice: voices[0].name, wavePath,
  }).done;
  assert.equal(result.completed, true);
  const wave = await readFile(wavePath);
  assert.equal(wave.subarray(0, 4).toString(), 'RIFF');
  assert.equal(wave.subarray(8, 12).toString(), 'WAVE');
  assert.ok(wave.length > 1000);
  process.stdout.write(`Windows synthesis passed: ${voices.length} enabled voices, ${wave.length} bytes of WAV audio.\n`);
} finally {
  // Delete only this freshly created, explicitly scoped test directory.
  await rm(directory, { recursive: true, force: true });
}
