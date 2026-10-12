import test from 'node:test';
import assert from 'node:assert/strict';
import { Narrator } from '../src/narrator.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const jobs = [];
  const narrator = new Narrator({
    voices: [{ name: 'Test voice', culture: 'en-US' }], maxQueue: 2,
    run: request => {
      let resolve, reject;
      const done = new Promise((yes, no) => { resolve = yes; reject = no; });
      const job = { request, done, resolve, reject, cancelled: false };
      job.cancel = () => { job.cancelled = true; resolve({ cancelled: true }); };
      jobs.push(job);
      return job;
    },
  });
  return { narrator, jobs };
}

test('speech returns immediately, stays serial, and bounds backlog', async () => {
  const { narrator, jobs } = fixture();
  assert.equal(narrator.speak('First.').accepted, true);
  narrator.speak('Second.');
  narrator.speak('Third.');
  assert.deepEqual(narrator.speak('Fourth.'), { accepted: false, reason: 'queue_full' });
  assert.equal(jobs.length, 1);
  jobs[0].resolve({ completed: true });
  await flush();
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].request.text, 'Second.');
  assert.equal(narrator.status().completed, 1);
  narrator.close();
  await flush();
});

test('mute cancels active and queued audio and rejects further speech', async () => {
  const { narrator, jobs } = fixture();
  narrator.speak('Active.');
  narrator.speak('Queued.');
  narrator.configure({ muted: true });
  assert.equal(jobs[0].cancelled, true);
  assert.equal(narrator.status().queued, 0);
  assert.equal(narrator.status().cancelled, 2);
  assert.equal(narrator.speak('Muted.').reason, 'muted');
  await flush();
  narrator.configure({ muted: false });
  narrator.speak('Resumed.');
  assert.equal(jobs.length, 2);
  narrator.close();
  await flush();
});

test('stop waits for cancellation before starting newly submitted speech', async () => {
  const { narrator, jobs } = fixture();
  narrator.speak('First.');
  narrator.stop();
  narrator.speak('After stop.');
  assert.equal(jobs.length, 1);
  await flush();
  assert.equal(jobs.length, 2);
  assert.equal(narrator.status().completed, 0);
  narrator.close();
  await flush();
});

test('validates settings atomically and applies them to the next update', async () => {
  const { narrator, jobs } = fixture();
  const initial = narrator.status().settings;
  assert.throws(() => narrator.configure({ volume: 10, rate: 11 }));
  assert.deepEqual(narrator.status().settings, initial);
  assert.throws(() => narrator.configure({ voice: 'Missing' }));
  assert.throws(() => narrator.configure({ volume: 4.5 }));
  assert.throws(() => narrator.configure({ muted: 'false' }));
  assert.throws(() => narrator.configure({ unknown: true }));
  narrator.configure({ volume: 35, rate: 2 });
  narrator.speak('Settings sample.');
  assert.equal(jobs[0].request.volume, 35);
  assert.equal(jobs[0].request.rate, 2);
  narrator.close();
  await flush();
});

test('handles failures without exposing raw diagnostics or narration text', async () => {
  const { narrator, jobs } = fixture();
  narrator.speak('This text must not appear in status.');
  jobs[0].reject(new Error('SENSITIVE_PLATFORM_ERROR_SAMPLE'));
  await flush();
  const state = narrator.status();
  assert.equal(state.failed, 1);
  assert.equal(state.state, 'idle');
  assert.ok(state.lastError);
  assert.ok(!JSON.stringify(state).includes('SENSITIVE_PLATFORM_ERROR_SAMPLE'));
  assert.ok(!JSON.stringify(state).includes('This text'));
});

test('queued updates keep their submitted settings and provider changes cancel backlog', async () => {
  const { narrator, jobs } = fixture();
  let cloudCalls = 0;
  narrator.providers.natural = {
    available: true, name: 'Cloud fixture', voices: [{ name: 'Cloud voice' }],
    run: () => { cloudCalls++; throw new Error('Unexpected cloud call.'); },
  };
  narrator.speak('Active Windows update.');
  narrator.configure({ volume: 35, rate: 2, style: 'teacher' });
  narrator.speak('Queued settings sample.');
  const direction = narrator.styles.get('teacher').voiceDirection;
  narrator.configure({ volume: 90, rate: -2, style: 'clear' });
  jobs[0].resolve({ completed: true });
  await flush();
  assert.equal(jobs[1].request.volume, 35);
  assert.equal(jobs[1].request.rate, 2);
  assert.equal(jobs[1].request.style, 'teacher');
  assert.equal(jobs[1].request.voiceDirection, direction);
  narrator.speak('Ordinary queued Windows update.');
  narrator.configure({ provider: 'natural' });
  assert.equal(narrator.status().queued, 0);
  assert.equal(narrator.status().cancelled, 1);
  jobs[1].resolve({ completed: true });
  await flush();
  assert.equal(cloudCalls, 0);
  narrator.close();
});

test('rejects empty and excessive text; closure prevents future speech', async () => {
  const { narrator } = fixture();
  assert.throws(() => narrator.speak('  '));
  assert.throws(() => narrator.speak('a'.repeat(601)));
  narrator.close();
  assert.equal(narrator.status().state, 'closed');
  assert.throws(() => narrator.speak('After closure.'));
});
