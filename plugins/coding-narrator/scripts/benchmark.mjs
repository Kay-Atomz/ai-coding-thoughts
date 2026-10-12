import { performance } from 'node:perf_hooks';
import { WindowsWorker } from '../src/windows-worker.mjs';
import { runWindowsSpeech } from '../src/speech.mjs';

const worker = new WindowsWorker();
try {
  const coldStart = performance.now();
  await runWindowsSpeech({ action: 'voices' }).done;
  const previousProcessMs = performance.now() - coldStart;
  const start = performance.now();
  await worker.start();
  const workerStartupMs = performance.now() - start;
  const timings = [];
  for (let index = 0; index < 10; index++) {
    const before = performance.now();
    await worker.run({ action: 'ping' }).done;
    timings.push(performance.now() - before);
  }
  const sorted = [...timings].sort((a, b) => a - b);
  process.stdout.write(JSON.stringify({
    previousProcessStartupAndVoiceLookupMs: Math.round(previousProcessMs),
    reusableWorkerStartupAndVoiceLookupMs: Math.round(workerStartupMs),
    warmCommandRoundTripMedianMs: Number(sorted[5].toFixed(2)),
    warmCommandRoundTripP90Ms: Number(sorted[8].toFixed(2)), workerProcessesStarted: worker.spawns,
    note: 'Command/startup overhead only. Not a measurement of audio generation or cloud latency.',
  }, null, 2) + '\n');
} finally { worker.close(); }
