import assert from 'node:assert/strict';
import test from 'node:test';
import { choosePhotoCover } from '../src/domain/photoCover.ts';

test('choosing a cover moves only that photo and preserves every photo identity and metadata', () => {
  const photos = [
    { uri: 'local-a', uploadId: 'a', thumbUri: 'thumb-a' },
    { uri: 'remote-b', storagePath: 'owner/b.jpg' },
    { uri: 'local-c', uploadId: 'c' },
  ];
  const before = structuredClone(photos);
  const next = choosePhotoCover(photos, 2);
  assert.deepEqual(next, [photos[2], photos[0], photos[1]]);
  assert.equal(next[0], photos[2]);
  assert.deepEqual(photos, before);
  assert.deepEqual(choosePhotoCover(next, 2), [photos[1], photos[2], photos[0]]);
});

test('an absent or invalid cover choice never drops a photo', () => {
  const photos = [{ uri: 'a' }];
  for (const index of [-1, 1, 1.5, NaN, 0]) assert.equal(choosePhotoCover(photos, index), photos);
  assert.deepEqual(choosePhotoCover([], 0), []);
});
