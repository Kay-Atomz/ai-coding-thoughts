import test from 'node:test';
import assert from 'node:assert/strict';
import { WindowsWorker } from '../src/windows-worker.mjs';

test('Windows worker reuses one process and restarts after cancellation', { skip: process.platform !== 'win32', timeout: 70000 }, async () => {
  const worker = new WindowsWorker();
  try {
    assert.ok((await worker.start()).length > 0);
    await worker.run({ action: 'ping' }).done;
    await worker.run({ action: 'ping' }).done;
    assert.equal(worker.spawns, 1);
    const job = worker.run({ action: 'speak', text: 'A sample update long enough to cancel before playback completes.', voice: worker.voices[0].name, volume: 0, rate: 0 });
    await new Promise(resolve => setImmediate(resolve));
    job.cancel();
    assert.equal((await job.done).cancelled, true);
    await worker.run({ action: 'ping' }).done;
    assert.equal(worker.spawns, 2);
  } finally { worker.close(); }
});
