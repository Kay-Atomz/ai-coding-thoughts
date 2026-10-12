import { runWindowsSpeech } from './speech.mjs';
import { EventEmitter } from 'node:events';
import { performance } from 'node:perf_hooks';
import { Styles } from './styles.mjs';

export class Narrator extends EventEmitter {
  constructor({ voices, run = runWindowsSpeech, maxQueue = 5, providers, styles = new Styles() }) {
    super();
    this.voices = voices;
    this.run = run;
    this.providers = providers ?? { windows: { voices, run, available: true, name: 'Windows' } };
    this.styles = styles;
    this.maxQueue = maxQueue;
    this.settings = { muted: false, volume: 80, rate: 0, voice: voices[0]?.name ?? '', provider: 'windows', style: 'clear' };
    this.queue = [];
    this.active = null;
    this.closed = false;
    this.sequence = 0;
    this.completed = 0;
    this.failed = 0;
    this.cancelled = 0;
    this.lastError = null;
    this.lastDurationMs = null;
  }

  status() {
    return {
      state: this.closed ? 'closed' : this.settings.muted ? 'muted' : this.active ? this.active.job.phase === 'generating' ? 'preparing' : 'speaking' : 'idle',
      queued: this.queue.length, activeId: this.active?.id ?? null,
      completed: this.completed, failed: this.failed, cancelled: this.cancelled,
      lastError: this.lastError, settings: { ...this.settings }, voices: this.providers[this.settings.provider].voices,
      providers: Object.entries(this.providers).map(([id, value]) => ({ id, name: value.name, available: value.available })),
      styles: this.styles.list(), narrationStyle: this.styles.get(this.settings.style),
      lastDurationMs: this.lastDurationMs,
    };
  }

  speak(text, { expectedProvider } = {}) {
    if (this.closed) throw new Error('Narrator is closed.');
    if (typeof text !== 'string' || !text.trim() || text.length > 600) {
      throw new Error('Use a nonempty plain-text update of at most 600 characters.');
    }
    if (expectedProvider !== undefined && (!['windows', 'local'].includes(expectedProvider) || this.settings.provider !== expectedProvider)) {
      throw new Error('Offline triggers require the Windows provider.');
    }
    if (this.settings.muted) return { accepted: false, reason: 'muted' };
    if (!this.providers[this.settings.provider].available) throw new Error('Selected voice provider is unavailable.');
    if (!this.providers[this.settings.provider].voices.length) throw new Error('No enabled speech voices are installed.');
    if (this.queue.length >= this.maxQueue) return { accepted: false, reason: 'queue_full' };
    const id = ++this.sequence;
    const settings = { ...this.settings };
    const voiceDirection = this.styles.get(settings.style).voiceDirection;
    this.queue.push({ id, text: text.trim(), expectedProvider, settings, voiceDirection });
    this.pump();
    this.changed();
    return { accepted: true, id, state: 'queued' };
  }

  configure(patch) {
    if (this.closed) throw new Error('Narrator is closed.');
    const allowed = new Set(['muted', 'volume', 'rate', 'voice', 'provider', 'style']);
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some(k => !allowed.has(k))) {
      throw new Error('Unknown narration setting.');
    }
    if ('muted' in patch && typeof patch.muted !== 'boolean') throw new Error('Muted must be a boolean.');
    if ('volume' in patch && (!Number.isInteger(patch.volume) || patch.volume < 0 || patch.volume > 100)) {
      throw new Error('Volume must be an integer between 0 and 100.');
    }
    if ('rate' in patch && (!Number.isInteger(patch.rate) || patch.rate < -10 || patch.rate > 10)) {
      throw new Error('Rate must be an integer between -10 and 10.');
    }
    const provider = this.providers[patch.provider ?? this.settings.provider];
    if (!provider?.available) throw new Error('Selected voice provider is unavailable. Check its setup or choose Windows.');
    const next = { ...patch };
    if (patch.provider && patch.provider !== this.settings.provider && !('voice' in patch)) next.voice = provider.voices[0]?.name ?? '';
    if ('voice' in next && !provider.voices.some(v => v.name === next.voice)) throw new Error('Choose an available voice.');
    if ('style' in patch) this.styles.get(patch.style);
    if (next.provider && next.provider !== this.settings.provider) {
      this.cancelled += this.queue.length;
      this.queue.length = 0;
    }
    Object.assign(this.settings, next);
    if (this.settings.muted) this.stop();
    this.changed();
    return this.status();
  }

  stop() {
    this.cancelled += this.queue.length;
    this.queue.length = 0;
    if (this.active && !this.active.stopped) {
      this.active.stopped = true;
      this.cancelled++;
      this.active.job.cancel();
    }
    this.changed();
    return this.status();
  }

  addStyle(profile) { const value = this.styles.add(profile); this.configure({ style: value.id }); return this.status(); }
  importStyle(markdown) { const value = this.styles.importMarkdown(markdown); this.configure({ style: value.id }); return this.status(); }
  changed() { this.emit('change', this.status()); }
  close() { this.closed = true; this.stop(); this.removeAllListeners(); }

  pump() {
    if (this.active || this.closed || this.settings.muted || !this.queue.length) return;
    const entry = this.queue.shift();
    // A queued offline event must never move to a cloud provider after settings change.
    if (entry.expectedProvider && entry.expectedProvider !== this.settings.provider) {
      this.cancelled++;
      this.changed();
      this.queueMicrotaskPump();
      return;
    }
    let job;
    const started = performance.now();
    try {
      const { run } = this.providers[entry.settings.provider];
      job = run({ action: 'speak', text: entry.text, ...entry.settings, voiceDirection: entry.voiceDirection });
    } catch {
      this.failed++;
      this.lastError = 'Could not start speech. Check the selected voice provider and audio setup.';
      this.changed();
      this.queueMicrotaskPump();
      return;
    }
    const active = { id: entry.id, job, stopped: false };
    this.active = active;
    this.changed();
    // Release narration text after submitting it; status never returns text.
    job.done.then(result => {
      if (!active.stopped && !result.cancelled) {
        this.completed++;
        this.lastError = null;
      }
    }).catch(() => {
      if (!active.stopped) {
        this.failed++;
        this.lastError = 'Speech failed or timed out. Check the selected voice provider and audio setup.';
      }
    }).finally(() => {
      this.active = null;
      this.lastDurationMs = Math.round(performance.now() - started);
      this.changed();
      this.pump();
    });
  }

  queueMicrotaskPump() { queueMicrotask(() => this.pump()); }
}
