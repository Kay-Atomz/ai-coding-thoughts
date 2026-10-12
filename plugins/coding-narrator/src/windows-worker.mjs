import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export class WindowsWorker {
  constructor({ onStateChange = () => {} } = {}) {
    this.onStateChange = onStateChange;
    this.child = null;
    this.pending = new Map();
    this.sequence = 0;
    this.starting = null;
    this.closed = false;
    this.voices = [];
    this.spawns = 0;
  }

  start() {
    if (this.closed) return Promise.reject(new Error('Windows speech worker is closed.'));
    if (this.starting) return this.starting;
    if (this.child) return Promise.resolve(this.voices);
    if (process.platform !== 'win32') return Promise.reject(new Error('Windows speech requires Windows.'));
    const child = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', fileURLToPath(new URL('../scripts/speech-worker.ps1', import.meta.url)),
    ], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    this.spawns++;
    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    child.stderr.resume();
    let readyReject;
    let readyTimer;
    const ready = new Promise((resolve, reject) => {
      readyReject = reject;
      // Cold System.Speech initialization can be slow on a busy Windows desktop.
      readyTimer = setTimeout(() => this.kill(child), 30000);
      lines.on('line', line => {
        try {
          const value = JSON.parse(line);
          if (value.type === 'ready') {
            clearTimeout(readyTimer);
            this.voices = value.voices;
            resolve(this.voices);
          } else {
            const pending = this.pending.get(value.id);
            if (!pending) return;
            if (value.type === 'state') {
              if (!['waiting', 'playing', 'finished'].includes(value.phase) || !/^\d{1,20}$/.test(value.timestamp)) throw new Error();
              if (value.phase !== 'finished') {
                pending.setPhase(value.phase);
                clearTimeout(pending.timer);
                pending.timer = setTimeout(() => this.kill(child), value.phase === 'waiting' ? 210000 : 120000);
                this.onStateChange({ id: value.id, phase: value.phase });
              }
              if (value.phase === 'playing') pending.startedAt = value.timestamp;
              if (value.phase === 'finished') pending.finishedAt = value.timestamp;
              return;
            }
            this.pending.delete(value.id);
            clearTimeout(pending.timer);
            if (value.error) pending.reject(new Error('Windows playback failed. Check the audio device and voice.'));
            else pending.resolve({ completed: true, ...(pending.startedAt ? { playback: { startedAt: pending.startedAt, finishedAt: pending.finishedAt } } : {}) });
          }
        } catch { this.kill(child); }
      });
    });
    this.starting = ready.finally(() => { if (this.child === child) this.starting = null; });
    const failed = () => {
      clearTimeout(readyTimer);
      lines.close();
      readyReject(new Error('Windows speech worker could not start or disconnected.'));
      if (this.child !== child) return;
      this.child = null;
      this.starting = null;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timer);
        if (pending.cancelled) pending.resolve({ cancelled: true });
        else pending.reject(new Error('Windows speech worker disconnected.'));
      }
      this.pending.clear();
    };
    child.on('close', failed);
    child.on('error', failed);
    child.stdin.on('error', () => this.kill(child));
    return this.starting;
  }

  run = request => {
    const id = ++this.sequence;
    let cancelled = false;
    let phase = ['speak', 'play'].includes(request.action) ? 'waiting' : 'playing';
    const done = this.start().then(() => {
      if (cancelled) return { cancelled: true };
      return new Promise((resolve, reject) => {
        const pending = { resolve, reject, cancelled: false, timer: null, setPhase: value => { phase = value; } };
        pending.timer = setTimeout(() => this.kill(this.child), phase === 'waiting' ? 210000 : 120000);
        this.pending.set(id, pending);
        this.child.stdin.write(`${JSON.stringify({ ...request, id })}\n`);
      });
    });
    return {
      done,
      get phase() { return phase; },
      cancel: () => {
        cancelled = true;
        const pending = this.pending.get(id);
        if (pending) { pending.cancelled = true; this.kill(this.child); }
      },
    };
  };

  kill(child) { child?.kill(); }
  close() { this.closed = true; this.kill(this.child); }
}
