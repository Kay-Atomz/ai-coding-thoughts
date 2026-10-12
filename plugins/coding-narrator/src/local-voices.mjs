import { spawn, execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

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
  }

  start() {
    if (this.closed) return Promise.reject(new Error('Local voice worker is closed.'));
    if (this.starting) return this.starting;
    if (this.child) return Promise.resolve(this.voices);
    const child = this.spawnChild(this.python, ['-u', fileURLToPath(new URL('../scripts/local-voice-worker.py', import.meta.url)), this.models], {
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
              this.pending = null; clearTimeout(pending.timer); pending.resolve({ audio });
            }
          }
        } catch { this.kill(child); }
      }
    });
    this.starting = ready.finally(() => { if (this.child === child) this.starting = null; });
    return this.starting;
  }

  generate = request => {
    const id = ++this.sequence;
    let cancelled = false;
    let settled = false;
    let termination = Promise.resolve();
    const done = this.start().then(() => {
      if (cancelled) return { cancelled: true };
      if (this.pending) throw new Error('Local synthesis is busy.');
      return new Promise((resolve, reject) => {
        this.pending = { id, resolve, reject, cancelled: false, timer: setTimeout(() => this.kill(this.child), this.generationMs) };
        this.child.stdin.write(JSON.stringify({ id, text: request.text, voice: request.voice, volume: request.volume, rate: request.rate }) + '\n');
      });
    }).catch(error => { if (cancelled) return { cancelled: true }; throw error; }).finally(async () => {
      settled = true;
      if (await termination === false) throw new Error('Local voice worker cleanup could not be confirmed. Restart the narrator.');
    });
    return { done, cancel: () => {
      cancelled = true;
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
    const generation = generator.generate(request);
    let playback;
    let cancelled = false;
    let phase = 'generating';
    const done = generation.done.then(result => {
      if (cancelled || result.cancelled) return { cancelled: true };
      phase = 'playing'; changed();
      playback = player.run({ action: 'play', audio: result.audio.toString('base64') });
      return playback.done;
    });
    return { done, get phase() { return phase; }, cancel: () => { cancelled = true; generation.cancel(); playback?.cancel(); } };
  };
}
