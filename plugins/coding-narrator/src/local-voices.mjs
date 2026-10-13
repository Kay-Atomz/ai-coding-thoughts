import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { speechSegments } from './speech-segments.mjs';

function validWav(audio) {
  if (audio.length < 46 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE' || audio.readUInt32LE(4) !== audio.length - 8) return false;
  let format = false, data = false;
  for (let offset = 12; offset < audio.length;) {
    if (offset + 8 > audio.length) return false;
    const name = audio.toString('ascii', offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > audio.length) return false;
    if (name === 'fmt ') {
      if (size < 16 || audio.readUInt16LE(start) !== 1 || audio.readUInt16LE(start + 2) !== 1 || audio.readUInt16LE(start + 14) !== 16) return false;
      const rate = audio.readUInt32LE(start + 4);
      if (rate < 8000 || rate > 48000 || audio.readUInt32LE(start + 8) !== rate * 2 || audio.readUInt16LE(start + 12) !== 2) return false;
      format = true;
    }
    if (name === 'data') {
      if (!format || !size || size % 2) return false;
      data = true;
    }
    offset = start + size + (size % 2);
    if (offset > audio.length) return false;
  }
  return format && data;
}

export class LocalVoices {
  constructor({ python, models, spawnChild = spawn, killTree = execFile, startupMs = 30000, generationMs = 120000, cleanupMs = 6500 } = {}) {
    const lab = fileURLToPath(new URL('../../../.voice-lab/', import.meta.url));
    this.python = python ?? process.env.NARRATOR_LOCAL_PYTHON ?? join(lab, 'venv', 'Scripts', 'python.exe');
    this.models = models ?? process.env.NARRATOR_LOCAL_MODELS ?? join(lab, 'models');
    this.installed = existsSync(this.python) && existsSync(this.models);
    this.spawnChild = spawnChild;
    this.killTree = killTree;
    this.cleanupMs = cleanupMs;
    this.startupMs = startupMs;
    this.generationMs = generationMs;
    this.child = null;
    this.starting = null;
    this.pending = null;
    this.sequence = 0;
    this.spawns = 0;
    this.closed = false;
    this.voices = [];
    this.killing = new WeakMap();
    this.failures = new WeakMap();
    this.warming = null;
    this.warmJob = null;
    this.warmState = 'cold';
    this.warmupMs = null;
    this.precision = null;
  }

  start() {
    if (this.closed) return Promise.reject(new Error('Local voice worker is closed.'));
    if (this.starting) return this.starting;
    if (this.child) return Promise.resolve(this.voices);
    const child = this.spawnChild(this.python, ['-B', '-u', fileURLToPath(new URL('../scripts/local-voice-worker.py', import.meta.url)), this.models], {
      windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    this.spawns++;
    child.stderr.resume();
    let output = '';
    let readyResolve, readyReject;
    const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
    const timer = setTimeout(() => this.kill(child), this.startupMs);
    const failed = () => {
      clearTimeout(timer);
      readyReject(new Error('Optional local voice worker is unavailable. Run the local voice installer.'));
      if (this.child !== child) return;
      this.child = this.starting = null;
      this.warmState = 'cold';
      if (this.pending) {
        clearTimeout(this.pending.timer);
        if (this.pending.cancelled) this.pending.resolve({ cancelled: true });
        else this.pending.reject(new Error('Local synthesis failed or timed out. Try a shorter update.'));
        this.pending = null;
      }
    };
    child.once('error', failed);
    child.once('close', failed);
    this.failures.set(child, failed);
    child.stdin.on('error', () => this.kill(child));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (output.length > 4500000) { this.kill(child); return; }
      let index;
      while ((index = output.indexOf('\n')) >= 0) {
        const line = output.slice(0, index); output = output.slice(index + 1);
        try {
          const value = JSON.parse(line);
          if (value.type === 'ready') {
            if (!Array.isArray(value.voices) || value.voices.length > 4 || value.voices.some(v => !['kokoro-heart', 'kokoro-bella', 'kitten-bruno', 'piper-ljspeech'].includes(v.name))) throw new Error();
            clearTimeout(timer); this.voices = value.voices; readyResolve(this.voices);
            this.precision = ['fp32', 'int8'].includes(value.kokoroPrecision) ? value.kokoroPrecision : null;
          } else if (this.pending?.id === value.id) {
            const pending = this.pending;
            if (value.error) {
              this.pending = null; clearTimeout(pending.timer);
              pending.reject(new Error('Local voice synthesis failed. Try a shorter update.'));
            }
            else {
              if (typeof value.audio !== 'string' || value.audio.length > 4194304 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value.audio)) throw new Error();
              const audio = Buffer.from(value.audio, 'base64');
              if (!validWav(audio)) throw new Error();
              this.warmState = pending.voice.startsWith('kokoro-') ? 'ready' : 'cold';
              this.pending = null; clearTimeout(pending.timer); pending.resolve({ audio });
            }
          }
        } catch { this.kill(child); }
      }
    });
    this.starting = ready.finally(() => { if (this.child === child) this.starting = null; });
    return this.starting;
  }

  warmup(changed = () => {}) {
    if (this.warming || ['ready', 'failed'].includes(this.warmState) || !this.voices.some(v => v.name === 'kokoro-heart')) return this.warming ?? Promise.resolve();
    this.warmState = 'warming'; changed();
    const started = performance.now();
    const job = this.generate({ text: 'Coding narration is ready.', voice: 'kokoro-heart', volume: 0, rate: 0 }, { skipWarmup: true });
    this.warmJob = job;
    this.warming = job.done.then(result => {
      this.warmState = result.cancelled ? 'cold' : 'ready';
      this.warmupMs = Math.round(performance.now() - started);
    }).catch(() => { this.warmState = 'failed'; }).finally(() => { this.warming = null; this.warmJob = null; changed(); });
    return this.warming;
  }

  generate = (request, { skipWarmup = false } = {}) => {
    const id = ++this.sequence;
    let cancelled = false;
    let settled = false;
    let termination = Promise.resolve();
    const done = this.start().then(async () => {
      if (!skipWarmup && this.warming) await this.warming;
      if (cancelled) return { cancelled: true };
      if (!request.voice.startsWith('kokoro-')) this.warmState = 'cold';
      if (this.pending) throw new Error('Local synthesis is busy.');
      return new Promise((resolve, reject) => {
        this.pending = { id, voice: request.voice, resolve, reject, cancelled: false, timer: setTimeout(() => this.kill(this.child), this.generationMs) };
        this.child.stdin.write(JSON.stringify({ id, text: request.text, voice: request.voice, volume: request.volume, rate: request.rate }) + '\n');
      });
    }).catch(error => { if (cancelled) return { cancelled: true }; throw error; }).finally(async () => {
      settled = true;
      if (await termination === false) throw new Error('Local voice worker cleanup could not be confirmed. Restart the narrator.');
    });
    return { done, cancel: () => {
      cancelled = true;
      if (!skipWarmup && this.warming) this.warmJob?.cancel();
      if (this.pending?.id === id) this.pending.cancelled = true;
      if (!settled) termination = this.kill(this.child);
    } };
  };

  kill(child) {
    if (!child) return Promise.resolve();
    if (this.killing.has(child)) return this.killing.get(child);
    let finish;
    const stopped = new Promise(resolve => { finish = resolve; });
    this.killing.set(child, stopped);
    let cleanupFailed = false;
    const reportFailure = () => {
      if (!cleanupFailed) process.stderr.write('Local voice worker cleanup could not be confirmed. Restart the narrator.\n');
      cleanupFailed = true;
    };
    const deadline = setTimeout(() => {
      reportFailure();
      child.kill();
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref?.();
      this.failures.get(child)?.();
      finish(false);
    }, this.cleanupMs);
    child.once('close', () => { clearTimeout(deadline); finish(!cleanupFailed); });
    // A Windows venv launcher owns a second Python process. Stop both so
    // cancellation cannot leave inference running after its launcher exits.
    if (process.platform === 'win32' && Number.isInteger(child.pid) && child.exitCode === null) {
      const taskkill = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe');
      this.killTree(taskkill, ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => {
        if (error && this.child === child) { reportFailure(); child.kill(); }
      });
    } else child.kill();
    return stopped;
  }

  close() {
    this.closed = true;
    return this.kill(this.child);
  }
}

export function localPlayback(generator, player, changed = () => {}) {
  return request => {
    const started = performance.now();
    const segments = speechSegments(request.text);
    let generation;
    let playback;
    let cancelled = false;
    let phase = 'generating';
    const metrics = { firstChunkMs: null, generationMs: 0, playbackStartMs: null, audioMs: 0, chunks: 0 };
    let bytes = 0;
    const done = (async () => {
      try {
        for (const text of segments) {
          if (cancelled) return { cancelled: true };
          const before = performance.now();
          generation = generator.generate({ ...request, text });
          const result = playback ? await Promise.race([generation.done, playback.done.then(value => {
            if (value.cancelled) return { cancelled: true };
            throw new Error('Streaming playback ended before generation.');
          })]) : await generation.done;
          if (cancelled || result.cancelled) return { cancelled: true };
          metrics.generationMs += performance.now() - before;
          bytes += result.audio.length;
          metrics.audioMs += wavDurationMs(result.audio);
          if (bytes > 3 * 1024 * 1024 || metrics.audioMs > 65000 || ++metrics.chunks > 32) throw new Error('Generated update exceeds audio limits.');
          if (!playback) {
            metrics.firstChunkMs = Math.round(performance.now() - started);
            playback = player.run({ action: 'stream_start', audio: result.audio.toString('base64') });
            // Install a handler immediately while inference prepares the next clip.
            playback.done.catch(() => {});
          } else await playback.append(result.audio.toString('base64'));
          phase = 'playing'; changed();
        }
        if (cancelled) return { cancelled: true };
        await playback.finish();
        const result = await playback.done;
        metrics.generationMs = Math.round(metrics.generationMs);
        metrics.audioMs = Math.round(metrics.audioMs);
        metrics.playbackStartMs = result.playback?.startedMs === undefined ? null : Math.round(result.playback.startedMs - started);
        return { ...result, metrics };
      } catch (error) {
        generation?.cancel(); playback?.cancel();
        await Promise.allSettled([generation?.done, playback?.done]);
        if (cancelled) return { cancelled: true };
        throw error;
      }
    })();
    return { done, get phase() { return playback?.phase ?? phase; }, get metrics() { return metrics; }, cancel: () => { cancelled = true; generation?.cancel(); playback?.cancel(); } };
  };
}

function wavDurationMs(audio) {
  let rate = 0;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const size = audio.readUInt32LE(offset + 4), start = offset + 8;
    const name = audio.toString('ascii', offset, offset + 4);
    if (name === 'fmt ') rate = audio.readUInt32LE(start + 8);
    if (name === 'data') return size / rate * 1000;
    offset = start + size + size % 2;
  }
  throw new Error('Generated WAV has no duration.');
}
