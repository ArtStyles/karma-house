// @ts-nocheck -- This test exercises the installed Metro watcher on the host filesystem.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const config = require('../metro.config.cjs');
const { posixPathMatchesPattern } = require('../node_modules/@expo/metro-file-map/build/watchers/common.js');
const root = fileURLToPath(new URL('..', import.meta.url));
const blocked = new RegExp(config.resolver.blockList.map(pattern => `(${pattern.source})`).join('|'));

test('Metro excludes Android artifacts before descending into inaccessible Java socket directories', () => {
  for (const target of ['artifacts', 'artifacts/java-sockets', 'artifacts/java-sockets/socket_1629691927']) {
    assert.equal(posixPathMatchesPattern(blocked, path.join(root, target)), true, target);
  }
  assert.equal(posixPathMatchesPattern(blocked, path.join(root, 'src/app/_layout.tsx')), false);
  assert.equal(posixPathMatchesPattern(blocked, path.join(root, 'assets/karmahouse-notification.png')), false);
});
