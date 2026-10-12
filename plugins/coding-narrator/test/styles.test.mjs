import test from 'node:test';
import assert from 'node:assert/strict';
import { Styles } from '../src/styles.mjs';
import { HostedState } from '../src/hosted-state.mjs';

test('built-in styles stay intact and imported skills are bounded preference data', () => {
  const styles = new Styles();
  assert.equal(styles.get('caveman').name, 'Caveman');
  const profile = styles.importMarkdown('---\nname: friendly-coach\ndescription: Friendly speaking preferences.\n---\n\nKeep updates encouraging and accurate.');
  assert.equal(profile.id, 'friendly-coach');
  assert.equal(styles.get(profile.id).instructions, 'Keep updates encouraging and accurate.');
  assert.throws(() => styles.add({ id: 'caveman', name: 'Replacement', instructions: 'Different.' }));
  assert.throws(() => styles.importMarkdown('Missing frontmatter'));
  assert.throws(() => styles.importMarkdown('---\nname: x\nname: y\ndescription: Bad.\n---\nSpeak.'));
  assert.throws(() => styles.importMarkdown('---\nname: ../escape\ndescription: Bad.\n---\nSpeak.'));
  assert.throws(() => styles.importMarkdown('a'.repeat(4001)));
});

test('hosted preferences and rate limits are isolated, bounded and expire', () => {
  let now = 0;
  const store = new HostedState({ clock: () => now, maxUsers: 2, ttlMs: 1000 });
  store.get('alice').settings.style = 'caveman';
  assert.equal(store.get('bob').settings.style, 'clear');
  assert.throws(() => store.get('charlie'));
  const release = store.begin('alice');
  assert.throws(() => store.begin('alice'));
  now = 2000;
  assert.equal(store.get('charlie').settings.style, 'clear');
  assert.equal(store.get('alice').settings.style, 'caveman');
  release(); release();
  now = 4000;
  assert.equal(store.get('alice').settings.style, 'clear');
});
