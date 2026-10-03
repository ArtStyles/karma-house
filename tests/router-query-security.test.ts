import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

// Exercise the same query-string dependency that Expo Router actually resolves.
const require = createRequire(import.meta.url);
const routerRequire = createRequire(require.resolve('expo-router/package.json'));
const queryPath = routerRequire.resolve('query-string');
const query = require(queryPath);

test('router query parsing preserves Unicode, spaces, literal plus and repeated values', () => {
  const parsed = query.parse('title=Casa+en+La+Habana&name=Jos%C3%A9&emoji=%F0%9F%8F%A0&plus=%2B&tag=a&tag=b');
  assert.deepEqual({ ...parsed }, {
    title: 'Casa en La Habana', name: 'José', emoji: '🏠', plus: '+', tag: ['a', 'b'],
  });
  assert.equal(query.parse(query.stringify({ q: 'Niño + balcón 🏠' })).q, 'Niño + balcón 🏠');
});

test('router query parsing handles long malformed percent input without exhausting CPU', () => {
  // The old recursive decoder exceeds this deadline. A separate process bounds
  // the regression itself so a vulnerable install cannot hang the whole suite.
  const script = `
    const assert = require('node:assert/strict');
    const query = require(${JSON.stringify(queryPath)});
    const malformed = '%FF'.repeat(1500);
    assert.equal(query.parse('q=' + malformed + '%41').q, malformed + 'A');
    assert.equal(query.parse('q=%E2%82%AC%FF%41').q, '€%FFA');
    assert.equal(query.parse('q=%G1%').q, '%G1%');
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 3000 });
  assert.equal(result.error, undefined, `Decoder did not finish: ${result.error?.message}`);
  assert.equal(result.status, 0, result.stderr);
});
