import { Styles } from './styles.mjs';

export class HostedState {
  constructor({ clock = Date.now, maxUsers = 100, ttlMs = 30 * 60 * 1000 } = {}) {
    this.clock = clock; this.maxUsers = maxUsers; this.ttlMs = ttlMs; this.users = new Map();
  }
  get(subject) {
    const now = this.clock();
    for (const [id, value] of this.users) if (now - value.touched > this.ttlMs && !value.active) this.users.delete(id);
    let value = this.users.get(subject);
    if (!value) {
      if (this.users.size >= this.maxUsers) throw new Error('Narrator capacity reached.');
      value = { styles: new Styles(), settings: { muted: false, voice: 'marin', style: 'clear', volume: 80, rate: 0 }, touched: now, window: now, count: 0, active: false };
      this.users.set(subject, value);
    }
    value.touched = now;
    return value;
  }
  begin(subject) {
    const state = this.get(subject);
    const now = this.clock();
    if (now - state.window >= 60000) { state.window = now; state.count = 0; }
    if (state.active || state.count >= 10) throw new Error('Narration rate limit reached. Wait before another update.');
    state.count++; state.active = true;
    let released = false;
    return () => { if (!released) { released = true; state.active = false; state.touched = this.clock(); } };
  }
}
