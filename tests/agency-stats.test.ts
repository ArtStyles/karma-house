import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countPages, weekRange } from '../src/agencies/stats.ts';

test('countPages adds every page it reads and keeps only the items that pass', async () => {
  const pages = [{ items: [1, 2, 3], hasMore: true }, { items: [4, 5], hasMore: false }];
  const offsets: number[] = [];
  const tally = await countPages(async offset => { offsets.push(offset); return pages[offsets.length - 1]; }, n => n !== 2);
  assert.deepEqual(offsets, [0, 3]);
  assert.deepEqual(tally, { count: 4, more: false });
});

test('countPages stops at its page limit and says more were left', async () => {
  const tally = await countPages(async () => ({ items: [1, 2], hasMore: true }), undefined, 3);
  assert.deepEqual(tally, { count: 6, more: true });
});

test('weekRange runs from Monday to the next Monday', () => {
  const { from, to } = weekRange(new Date(2026, 9, 17, 15, 30)); // Saturday 17 October 2026
  const start = new Date(from), end = new Date(to);
  assert.equal(start.getDay(), 1);
  assert.equal(start.getDate(), 12);
  assert.equal(start.getHours(), 0);
  assert.equal(end.getDate(), 19);
});
