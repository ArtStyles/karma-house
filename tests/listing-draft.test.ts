import assert from 'node:assert/strict';
import test from 'node:test';
import { emptyDraft } from '../src/domain/listings.ts';
import { createDraftPersistence, hasDraftVersionConflict, restoreDraft } from '../src/domain/draftPersistence.ts';

test('a failed draft read blocks every automatic write until an explicit retry succeeds', async () => {
  let fail = true;
  let stored = JSON.stringify({ title: 'saved-work' });
  const persistence = createDraftPersistence({
    getItem: async () => { if (fail) throw new Error('read unavailable'); return stored; },
    setItem: async (_key, value) => { stored = value; },
    removeItem: async () => { stored = null; },
  }, 'account-a:draft');
  await assert.rejects(persistence.read(), /read unavailable/);
  await assert.rejects(persistence.write({ title: 'empty' }), /recuperar/i);
  assert.equal(JSON.parse(stored).title, 'saved-work');
  fail = false;
  assert.equal(JSON.parse(await persistence.read()).title, 'saved-work');
  await persistence.write({ title: 'updated' });
  assert.equal(JSON.parse(stored).title, 'updated');
});

test('remote success is final even if local cleanup fails, and late autosaves cannot recreate a submitted draft', async () => {
  let writes = 0;
  const storage = { getItem: async () => null, setItem: async () => { writes++; }, removeItem: async () => { throw new Error('disk unavailable'); } };
  const persistence = createDraftPersistence(storage, 'account-a:submitted');
  await persistence.read();
  await persistence.write({ title: 'ready' });
  assert.equal(await persistence.complete(), false);
  await persistence.write({ title: 'late-effect' });
  assert.equal(writes, 1);
  const reopened = createDraftPersistence(storage, 'account-a:submitted');
  assert.equal(await reopened.read(), null);
});

test('draft completion waits behind writes so autosave cannot recreate a submitted draft', async () => {
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  let stored = null;
  const storage = { getItem: async () => stored, setItem: async (_key, value) => { await blocked; stored = value; }, removeItem: async () => { stored = null; } };
  const persistence = createDraftPersistence(storage, 'account-a:serial');
  await persistence.read();
  const write = persistence.write({ title: 'draft' });
  const completion = persistence.complete();
  release();
  await Promise.all([write, completion]);
  assert.equal(stored, null);
});

test('an old mounted form cannot erase a newer instance of the same draft', async () => {
  let stored = null;
  const storage = { getItem: async () => stored, setItem: async (_key, value) => { stored = value; }, removeItem: async () => { stored = null; } };
  const old = createDraftPersistence(storage, 'account-a:remount');
  await old.read();
  await old.write({ title: 'old' });
  const current = createDraftPersistence(storage, 'account-a:remount');
  await current.read();
  await current.write({ title: 'newer-work' });
  assert.equal(await old.complete(), false);
  await old.write({ title: 'late-old-work' });
  assert.equal(JSON.parse(stored).title, 'newer-work');
});

test('an old edit version stays intact until the user explicitly discards the draft', () => {
  const saved = { expectedVersion: 2, clientRequestId: 'same-home' };
  const latest = { expectedVersion: 3, clientRequestId: 'same-home' };
  assert.equal(hasDraftVersionConflict(saved, latest), true);
  assert.equal(saved.expectedVersion, 2);
  assert.equal(hasDraftVersionConflict(latest, latest), false);
  assert.equal(hasDraftVersionConflict({ clientRequestId: 'same-home' }, latest), true);
  assert.equal(hasDraftVersionConflict({ clientRequestId: 'new-home' }, undefined), false);
});

test('recovering a draft keeps retry keys, selected photos, and the original edit version', () => {
  const saved = { ...emptyDraft, title: 'Casa guardada', clientRequestId: 'request-123', expectedVersion: 4, photos: [{ uri: 'file:///photo.jpg', uploadId: 'photo-123' }] };
  assert.deepEqual(restoreDraft(JSON.stringify(saved), { ...emptyDraft, expectedVersion: 5 }), saved);
});

test('restored photos renew only matching storage references without rebasing or replacing local selections', () => {
  const saved = { ...emptyDraft, expectedVersion: 2, photoUri: 'https://expired.example/photo', photos: [{ uri: 'https://expired.example/photo', storagePath: 'owner/request/photo.jpg' }, { uri: 'file:///new-photo.jpg', uploadId: 'new-photo' }] };
  const latest = { ...emptyDraft, expectedVersion: 3, photos: [{ uri: 'https://fresh.example/photo', storagePath: 'owner/request/photo.jpg' }] };
  const recovered = restoreDraft(JSON.stringify(saved), latest);
  assert.equal(recovered.expectedVersion, 2);
  assert.equal(recovered.photoUri, 'https://fresh.example/photo');
  assert.equal(recovered.photos[0].uri, 'https://fresh.example/photo');
  assert.deepEqual(recovered.photos[1], saved.photos[1]);
});
test('invalid saved drafts cannot break the form or replace a valid draft', () => {
  for (const input of ['{', 'null', '[]', JSON.stringify({ ...emptyDraft, amenities: null }), JSON.stringify({ ...emptyDraft, photos: [{ uri: null }] })]) {
    assert.deepEqual(restoreDraft(input, emptyDraft), emptyDraft);
  }
});
