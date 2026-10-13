import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampServiceWorker } from '../scripts/stamp-sw.mjs';

const source = readFileSync('public/sw.js', 'utf8');
const page = (hash: string) => `<link rel="preload" href="/_expo/static/css/map-${hash}.css" as="style"><link rel="stylesheet" href="/_expo/static/css/map-${hash}.css"><script src="/_expo/static/js/web/index-${hash}.js" defer></script>`;

test('stamped service worker precaches the page and exactly the bundles it loads', () => {
  const stamped = stampServiceWorker(source, page('aaa'));
  assert.match(stamped, /const VERSION = '[0-9a-f]{12}';/);
  assert.ok(stamped.includes(`const SHELL = ["/","/_expo/static/css/map-aaa.css","/_expo/static/js/web/index-aaa.js"];`));
  assert.ok(!stamped.includes("VERSION = 'dev'"));
});

test('a new build or a changed worker gets a new cache version', () => {
  const version = (html: string, worker = source) => stampServiceWorker(worker, html).match(/VERSION = '(\w+)'/)?.[1];
  assert.equal(version(page('aaa')), version(page('aaa')));
  assert.notEqual(version(page('aaa')), version(page('bbb')));
  assert.notEqual(version(page('aaa')), version(page('aaa'), `${source}\n// changed`));
});

test('stamping refuses a changed template or a page without bundles', () => {
  assert.throws(() => stampServiceWorker(source.replace("'dev'", "'x'"), page('aaa')), /placeholders/);
  assert.throws(() => stampServiceWorker(source, '<html></html>'), /no \/_expo\/static bundle/);
});
