import assert from 'node:assert/strict';
import test from 'node:test';
import { composerStorageKey, createComposerDraft } from '../src/components/messaging/composerDraft.ts';

function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { values.set(key, value); } };
}

test('composer drafts are isolated by account and conversation', async () => {
  const storage = memory();
  const first = createComposerDraft(storage, composerStorageKey('alice', 'home-a'));
  const second = createComposerDraft(storage, composerStorageKey('bob', 'home-a'));
  const another = createComposerDraft(storage, composerStorageKey('alice', 'home-b'));
  await Promise.all([first.hydrate(), second.hydrate(), another.hydrate()]);
  await first.change('Mi primer mensaje');
  assert.equal(second.getSnapshot().text, '');
  assert.equal(another.getSnapshot().text, '');
  const restored = createComposerDraft(storage, composerStorageKey('alice', 'home-a'));
  await restored.hydrate();
  assert.equal(restored.getSnapshot().text, 'Mi primer mensaje');
});

test('failed hydration cannot overwrite a draft and allows a safe retry', async () => {
  const base = memory({ draft: 'Conservar' });
  let fail = true;
  const store = createComposerDraft({ ...base, getItem: async (key: string) => { if (fail) throw Error('disk'); return base.getItem(key); } }, 'draft');
  await store.hydrate();
  assert.equal(store.getSnapshot().ready, false);
  await assert.rejects(store.change('Sobrescribir'));
  assert.equal(base.values.get('draft'), 'Conservar');
  fail = false;
  await store.hydrate();
  assert.equal(store.getSnapshot().text, 'Conservar');
});

test('rapid edits persist in order even when an older disk write is delayed', async () => {
  const base = memory();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const store = createComposerDraft({ ...base, setItem: async (key: string, value: string) => { if (value === 'Uno') await gate; await base.setItem(key, value); } }, 'draft');
  await store.hydrate();
  const first = store.change('Uno');
  const second = store.change('Dos');
  assert.equal(store.getSnapshot().text, 'Dos');
  release();
  await Promise.all([first, second]);
  assert.equal(base.values.get('draft'), 'Dos');
});

test('a queued message clears its composer but never a newer draft', async () => {
  const storage = memory();
  const store = createComposerDraft(storage, 'draft');
  await store.hydrate();
  await store.change('Enviado');
  await store.clearAfterEnqueue('Enviado');
  assert.equal(store.getSnapshot().text, '');
  await store.change('Otro mensaje');
  await store.clearAfterEnqueue('Enviado');
  assert.equal(store.getSnapshot().text, 'Otro mensaje');
  assert.equal(storage.values.get('draft'), 'Otro mensaje');
});

test('a write failure keeps typed text and exposes a retry without re-reading stale data', async () => {
  const base = memory();
  let fail = true;
  const store = createComposerDraft({ ...base, setItem: async (key: string, value: string) => { if (fail) throw Error('disk'); await base.setItem(key, value); } }, 'draft');
  await store.hydrate();
  await assert.rejects(store.change('Mi borrador'));
  assert.equal(store.getSnapshot().text, 'Mi borrador');
  assert.ok(store.getSnapshot().error);
  fail = false;
  await store.retry();
  assert.equal(base.values.get('draft'), 'Mi borrador');
  assert.equal(store.getSnapshot().error, null);
});
